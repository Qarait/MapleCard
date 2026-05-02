import { parseShoppingList } from "../parseShoppingList";
import { createCanonicalMatcher } from "../matchParsedLineToCanonical";
import type { CanonicalMatch } from "../matchParsedLineToCanonical";
import { selectBestStoreWithAlternatives } from "../selectBestStore";
import type { SelectedStoreResult } from "../selectBestStore";
import { generateClarificationQuestions } from "../generateClarificationQuestions";
import { getCatalogSource } from "../config/catalogSourceConfig";
import { logger } from "../utils/logger";
import type { CatalogProviders } from "./catalogProvider";
import { OptimizeServiceError } from "./optimizeServiceError";
import { validateCanonicalItems, validateStoreProducts } from "./providerValidation";
import { seedCompatibleSyntheticStoreInventoryProvider } from "./seedInventoryBridge";
import { seedCanonicalCatalogProvider } from "./seedCatalogProvider";
import { syntheticCanonicalCatalogProvider, syntheticStoreInventoryProvider } from "./syntheticCatalogProvider";

export type OptimizeResponse = {
  items: Array<{
    rawText: string;
    lineType: "exact_item" | "category_request" | "meal_intent" | "unknown";
    canonicalQuery: string;
    quantity?: { value?: number; unit?: string };
    attributes: Record<string, any>;
    suggestions: string[];
    needsUserChoice: boolean;
    confidence: number;

    match: CanonicalMatch;
  }>;
  winner: SelectedStoreResult;
  alternatives: SelectedStoreResult[];
  clarifications: Array<{ id: string; rawText: string; question: string; options: string[]; attributeKey?: string }>;
};

export const DEFAULT_CATALOG_PROVIDERS: CatalogProviders = {
  canonicalCatalogProvider: syntheticCanonicalCatalogProvider,
  storeInventoryProvider: syntheticStoreInventoryProvider,
};

export function getDefaultCatalogProviders(): CatalogProviders {
  const catalogSource = getCatalogSource();

  if (catalogSource === "seed_bridge") {
    return {
      canonicalCatalogProvider: seedCanonicalCatalogProvider,
      storeInventoryProvider: seedCompatibleSyntheticStoreInventoryProvider,
    };
  }

  return DEFAULT_CATALOG_PROVIDERS;
}

type ProviderDiagnostics = {
  canonicalItemCount: number;
  storeProductCount: number;
  providerFailureReason: string | null;
  providerValidationFailureCount: number;
};

function logProviderWarning(message: string, diagnostics: ProviderDiagnostics, details?: Record<string, unknown>) {
  logger.warn(`[MapleCard providers] ${message}`, {
    ...diagnostics,
    ...(details ?? {}),
  });
}

async function loadCanonicalItems(providers: CatalogProviders, diagnostics: ProviderDiagnostics) {
  let canonicalPayload: unknown;

  try {
    canonicalPayload = await providers.canonicalCatalogProvider.getCanonicalItems();
  } catch (error: any) {
    diagnostics.providerFailureReason = "canonical_catalog_provider_rejected";
    logProviderWarning("Canonical catalog provider failed.", diagnostics, {
      reason: String(error?.message ?? error),
    });
    throw new OptimizeServiceError("catalog_provider_failed", "Catalog provider is currently unavailable.", 503);
  }

  const validation = validateCanonicalItems(canonicalPayload);
  diagnostics.canonicalItemCount = validation.validItems.length;
  diagnostics.providerValidationFailureCount += validation.invalidCount;

  if (validation.invalidCount > 0) {
    diagnostics.providerFailureReason = "invalid_canonical_catalog";
    logProviderWarning("Canonical catalog provider returned invalid items.", diagnostics, {
      firstInvalidReason: validation.firstInvalidReason,
    });
    throw new OptimizeServiceError("invalid_canonical_catalog", "Catalog provider returned invalid data.", 502);
  }

  if (validation.validItems.length === 0) {
    diagnostics.providerFailureReason = "empty_canonical_catalog";
    logProviderWarning("Canonical catalog provider returned no items.", diagnostics);
    throw new OptimizeServiceError("empty_canonical_catalog", "Catalog provider returned no canonical items.", 503);
  }

  return validation.validItems;
}

async function loadStoreProducts(providers: CatalogProviders, diagnostics: ProviderDiagnostics) {
  let storePayload: unknown;

  try {
    storePayload = await providers.storeInventoryProvider.getStoreProducts();
  } catch (error: any) {
    diagnostics.providerFailureReason = "store_inventory_provider_rejected";
    logProviderWarning("Store inventory provider failed.", diagnostics, {
      reason: String(error?.message ?? error),
    });
    throw new OptimizeServiceError("inventory_provider_failed", "Store inventory provider is currently unavailable.", 503);
  }

  const validation = validateStoreProducts(storePayload);
  diagnostics.storeProductCount = validation.validItems.length;
  diagnostics.providerValidationFailureCount += validation.invalidCount;

  if (validation.invalidCount > 0) {
    diagnostics.providerFailureReason = "invalid_store_inventory";
    logProviderWarning("Store inventory provider returned invalid products.", diagnostics, {
      firstInvalidReason: validation.firstInvalidReason,
    });
    throw new OptimizeServiceError("invalid_store_inventory", "Store inventory provider returned invalid data.", 502);
  }

  if (validation.validItems.length === 0) {
    diagnostics.providerFailureReason = "empty_store_inventory";
    logProviderWarning("Store inventory provider returned no products.", diagnostics);
    throw new OptimizeServiceError("empty_store_inventory", "Store inventory provider returned no products.", 503);
  }

  return validation.validItems;
}

export async function optimizeShopping(
  rawInput: string,
  providers: CatalogProviders = getDefaultCatalogProviders()
): Promise<OptimizeResponse> {
  const providerDiagnostics: ProviderDiagnostics = {
    canonicalItemCount: 0,
    storeProductCount: 0,
    providerFailureReason: null,
    providerValidationFailureCount: 0,
  };
  const parsedLines = await parseShoppingList(rawInput);

  const canonicalItems = await loadCanonicalItems(providers, providerDiagnostics);
  const matchParsedLineToCanonical = createCanonicalMatcher(canonicalItems);

  const matches = parsedLines.map((pl) => matchParsedLineToCanonical(pl));
  const storeProducts = await loadStoreProducts(providers, providerDiagnostics);

  const { winner, alternatives } = selectBestStoreWithAlternatives(matches, storeProducts);

  const clarificationInputs = parsedLines.map((pl, idx) => ({
    ...matches[idx],
    rawText: pl.rawText,
    needsUserChoice: pl.needsUserChoice,
  }));

  const clarifications = generateClarificationQuestions(clarificationInputs as any);

  const items = parsedLines.map((pl, idx) => ({
    ...pl,
    match: matches[idx],
  }));

  return {
    items,
    winner,
    alternatives,
    clarifications,
  };
}


import { parseShoppingList } from "../parseShoppingList";
import { createCanonicalMatcher } from "../matchParsedLineToCanonical";
import type { CanonicalMatch } from "../matchParsedLineToCanonical";
import { selectBestStoreWithAlternatives } from "../selectBestStore";
import type { SelectedStoreResult } from "../selectBestStore";
import { generateClarificationQuestions } from "../generateClarificationQuestions";
import type { CatalogProviders } from "./catalogProvider";
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
  clarifications: Array<{ rawText: string; question: string; options: string[] }>;
};

export const DEFAULT_CATALOG_PROVIDERS: CatalogProviders = {
  canonicalCatalogProvider: syntheticCanonicalCatalogProvider,
  storeInventoryProvider: syntheticStoreInventoryProvider,
};

export async function optimizeShopping(
  rawInput: string,
  providers: CatalogProviders = DEFAULT_CATALOG_PROVIDERS
): Promise<OptimizeResponse> {
  const parsedLines = await parseShoppingList(rawInput);

  const canonicalItems = await providers.canonicalCatalogProvider.getCanonicalItems();
  const matchParsedLineToCanonical = createCanonicalMatcher(canonicalItems);

  const matches = parsedLines.map((pl) => matchParsedLineToCanonical(pl));
  const storeProducts = await providers.storeInventoryProvider.getStoreProducts();

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


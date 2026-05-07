import { getKrogerConfig, type KrogerConfig } from "../config/krogerConfig";
import {
  createKrogerClient,
  KrogerClientError,
  type KrogerClient,
  type KrogerLocationSearchResult,
} from "../providers/kroger/krogerClient";
import { mapKrogerProductsToCandidates, type RealStoreProductCandidate } from "../providers/kroger/krogerMapper";

export const MAX_KROGER_PROBE_TERMS = 5;

export type ProbeKrogerInventoryArgs = {
  terms: string[];
  zipCode?: string;
  locationId?: string;
};

export type ProbeKrogerInventoryResult =
  | {
      provider: "kroger";
      status: "disabled" | "unavailable";
      reason: "disabled" | "missing_credentials";
      termLimit: number;
      productLimitPerTerm: number;
    }
  | {
      provider: "kroger";
      status: "no_location";
      reason: "missing_location" | "location_lookup_returned_no_results";
      resolvedZipCode?: string;
      termLimit: number;
      productLimitPerTerm: number;
      searchedTerms: string[];
    }
  | {
      provider: "kroger";
      status: "error";
      code: string;
      message: string;
      termLimit: number;
      productLimitPerTerm: number;
      searchedTerms: string[];
    }
  | {
      provider: "kroger";
      status: "ok";
      resolvedLocationId: string;
      resolvedZipCode?: string;
      location?: Pick<KrogerLocationSearchResult, "locationId" | "name" | "chain" | "address">;
      searchedTerms: string[];
      truncatedTermCount: number;
      productLimitPerTerm: number;
      termResults: Array<{
        term: string;
        candidateCount: number;
        candidates: RealStoreProductCandidate[];
      }>;
    };

type ProbeDependencies = {
  config?: KrogerConfig;
  clientFactory?: (config: KrogerConfig) => KrogerClient;
};

function normalizeProbeTerms(terms: string[]): { searchedTerms: string[]; truncatedTermCount: number } {
  const normalizedTerms = Array.from(
    new Set(terms.map((term) => term.trim()).filter((term) => term.length > 0))
  );

  return {
    searchedTerms: normalizedTerms.slice(0, MAX_KROGER_PROBE_TERMS),
    truncatedTermCount: Math.max(0, normalizedTerms.length - MAX_KROGER_PROBE_TERMS),
  };
}

function getPreferredProbeLocation(args: ProbeKrogerInventoryArgs, config: KrogerConfig): { locationId?: string; zipCode?: string } {
  const locationId = args.locationId?.trim() || config.defaultLocationId;
  const zipCode = args.zipCode?.trim() || config.defaultZipCode;

  return {
    ...(locationId ? { locationId } : {}),
    ...(zipCode ? { zipCode } : {}),
  };
}

export async function probeKrogerInventoryForTerms(
  args: ProbeKrogerInventoryArgs,
  dependencies: ProbeDependencies = {}
): Promise<ProbeKrogerInventoryResult> {
  const config = dependencies.config ?? getKrogerConfig();
  const { searchedTerms, truncatedTermCount } = normalizeProbeTerms(args.terms);
  const productLimitPerTerm = config.maxProductsPerQuery;

  if (!config.providerEnabled) {
    return {
      provider: "kroger",
      status: "disabled",
      reason: "disabled",
      termLimit: MAX_KROGER_PROBE_TERMS,
      productLimitPerTerm,
    };
  }

  if (!config.isAvailable) {
    return {
      provider: "kroger",
      status: "unavailable",
      reason: config.unavailableReason ?? "missing_credentials",
      termLimit: MAX_KROGER_PROBE_TERMS,
      productLimitPerTerm,
    };
  }

  const createClient = dependencies.clientFactory ?? ((nextConfig: KrogerConfig) => createKrogerClient(nextConfig));
  const client = createClient(config);
  const preferredLocation = getPreferredProbeLocation(args, config);

  try {
    let resolvedLocationId = preferredLocation.locationId;
    let resolvedLocation: KrogerLocationSearchResult | undefined;

    if (!resolvedLocationId && preferredLocation.zipCode) {
      const locations = await client.searchLocationsByZip(preferredLocation.zipCode);

      if (locations.length === 0) {
        return {
          provider: "kroger",
          status: "no_location",
          reason: "location_lookup_returned_no_results",
          resolvedZipCode: preferredLocation.zipCode,
          termLimit: MAX_KROGER_PROBE_TERMS,
          productLimitPerTerm,
          searchedTerms,
        };
      }

      resolvedLocation = locations[0];
      resolvedLocationId = resolvedLocation.locationId;
    }

    if (!resolvedLocationId) {
      return {
        provider: "kroger",
        status: "no_location",
        reason: "missing_location",
        ...(preferredLocation.zipCode ? { resolvedZipCode: preferredLocation.zipCode } : {}),
        termLimit: MAX_KROGER_PROBE_TERMS,
        productLimitPerTerm,
        searchedTerms,
      };
    }

    const termResults = await Promise.all(
      searchedTerms.map(async (term) => {
        const products = await client.searchProducts(term, resolvedLocationId as string);
        const candidates = mapKrogerProductsToCandidates(products, resolvedLocationId as string, productLimitPerTerm);

        return {
          term,
          candidateCount: candidates.length,
          candidates,
        };
      })
    );

    return {
      provider: "kroger",
      status: "ok",
      resolvedLocationId,
      ...(preferredLocation.zipCode ? { resolvedZipCode: preferredLocation.zipCode } : {}),
      ...(resolvedLocation
        ? {
            location: {
              locationId: resolvedLocation.locationId,
              name: resolvedLocation.name,
              chain: resolvedLocation.chain,
              address: resolvedLocation.address,
            },
          }
        : {}),
      searchedTerms,
      truncatedTermCount,
      productLimitPerTerm,
      termResults,
    };
  } catch (error) {
    if (error instanceof KrogerClientError) {
      return {
        provider: "kroger",
        status: "error",
        code: error.code,
        message: error.message,
        termLimit: MAX_KROGER_PROBE_TERMS,
        productLimitPerTerm,
        searchedTerms,
      };
    }

    return {
      provider: "kroger",
      status: "error",
      code: "kroger_probe_failed",
      message: "Kroger inventory probe failed.",
      termLimit: MAX_KROGER_PROBE_TERMS,
      productLimitPerTerm,
      searchedTerms,
    };
  }
}
import { logger } from "../utils/logger";

export const DEFAULT_CATALOG_SOURCE = "synthetic" as const;

export type CatalogSource = "synthetic" | "seed_bridge";

const VALID_CATALOG_SOURCES = new Set<CatalogSource>(["synthetic", "seed_bridge"]);

export function getCatalogSource(): CatalogSource {
  const rawSource = (process.env.MAPLECARD_CATALOG_SOURCE ?? DEFAULT_CATALOG_SOURCE).trim();

  if (VALID_CATALOG_SOURCES.has(rawSource as CatalogSource)) {
    return rawSource as CatalogSource;
  }

  logger.warn("[MapleCard config] MAPLECARD_CATALOG_SOURCE is invalid; using synthetic.", {
    providedValue: rawSource,
    fallbackValue: DEFAULT_CATALOG_SOURCE,
  });

  return DEFAULT_CATALOG_SOURCE;
}

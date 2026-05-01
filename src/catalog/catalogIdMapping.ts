export type CatalogIdMappingEntry = {
  syntheticId: string;
  syntheticSlug: string;
  seedId: string;
  seedSlug: string;
};

export const CORE_CATALOG_ID_MAPPINGS: CatalogIdMappingEntry[] = [
  {
    syntheticId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001",
    syntheticSlug: "milk",
    seedId: "seed-dairy-001",
    seedSlug: "milk",
  },
  {
    syntheticId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002",
    syntheticSlug: "eggs",
    seedId: "seed-eggs-001",
    seedSlug: "eggs",
  },
  {
    syntheticId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003",
    syntheticSlug: "banana",
    seedId: "seed-produce-001",
    seedSlug: "bananas",
  },
  {
    syntheticId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004",
    syntheticSlug: "chicken",
    seedId: "seed-meat-001",
    seedSlug: "chicken-breast",
  },
  {
    syntheticId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005",
    syntheticSlug: "rice",
    seedId: "seed-pantry-001",
    seedSlug: "rice",
  },
];

const MAPPINGS_BY_SYNTHETIC_ID = new Map(CORE_CATALOG_ID_MAPPINGS.map((entry) => [entry.syntheticId, entry]));
const MAPPINGS_BY_SEED_ID = new Map(CORE_CATALOG_ID_MAPPINGS.map((entry) => [entry.seedId, entry]));
const MAPPINGS_BY_SYNTHETIC_SLUG = new Map(CORE_CATALOG_ID_MAPPINGS.map((entry) => [entry.syntheticSlug, entry]));
const MAPPINGS_BY_SEED_SLUG = new Map(CORE_CATALOG_ID_MAPPINGS.map((entry) => [entry.seedSlug, entry]));

export function mapSyntheticIdToSeedId(syntheticId: string): string | null {
  return MAPPINGS_BY_SYNTHETIC_ID.get(syntheticId)?.seedId ?? null;
}

export function mapSeedIdToSyntheticId(seedId: string): string | null {
  return MAPPINGS_BY_SEED_ID.get(seedId)?.syntheticId ?? null;
}

export function mapSyntheticSlugToSeedSlug(syntheticSlug: string): string | null {
  return MAPPINGS_BY_SYNTHETIC_SLUG.get(syntheticSlug)?.seedSlug ?? null;
}

export function mapSeedSlugToSyntheticSlug(seedSlug: string): string | null {
  return MAPPINGS_BY_SEED_SLUG.get(seedSlug)?.syntheticSlug ?? null;
}

export function getMappingBySeedId(seedId: string): CatalogIdMappingEntry | null {
  return MAPPINGS_BY_SEED_ID.get(seedId) ?? null;
}

export function getMappingBySyntheticId(syntheticId: string): CatalogIdMappingEntry | null {
  return MAPPINGS_BY_SYNTHETIC_ID.get(syntheticId) ?? null;
}
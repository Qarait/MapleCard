import type { CanonicalCatalogSchemaRecord, QuantityPolicy } from "./catalogSchema";
import { getSeedCanonicalCatalog } from "./seedCanonicalCatalog";

function collapseLookupWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeCatalogLookupText(value: string): string {
  return collapseLookupWhitespace(
    value
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9%\s]/g, " ")
  );
}

const SEED_CATALOG_RECORDS = getSeedCanonicalCatalog();

const seedCatalogById = new Map<string, CanonicalCatalogSchemaRecord>(
  SEED_CATALOG_RECORDS.map((record) => [record.id, record])
);

const seedCatalogBySlug = new Map<string, CanonicalCatalogSchemaRecord>(
  SEED_CATALOG_RECORDS.map((record) => [normalizeCatalogLookupText(record.slug), record])
);

const seedCatalogByAlias = new Map<string, CanonicalCatalogSchemaRecord>();

for (const record of SEED_CATALOG_RECORDS) {
  const aliases = new Set<string>([record.slug, record.display_name, ...(record.aliases ?? []), ...(record.aliases_json ?? [])]);

  for (const alias of aliases) {
    const normalizedAlias = normalizeCatalogLookupText(alias);
    if (!normalizedAlias || seedCatalogByAlias.has(normalizedAlias)) continue;
    seedCatalogByAlias.set(normalizedAlias, record);
  }
}

export function lookupSeedCatalogById(canonicalId: string): CanonicalCatalogSchemaRecord | null {
  return seedCatalogById.get(canonicalId) ?? null;
}

export function lookupSeedCatalogBySlug(slug: string): CanonicalCatalogSchemaRecord | null {
  return seedCatalogBySlug.get(normalizeCatalogLookupText(slug)) ?? null;
}

export function lookupSeedCatalogByAlias(userText: string): CanonicalCatalogSchemaRecord | null {
  return seedCatalogByAlias.get(normalizeCatalogLookupText(userText)) ?? null;
}

export function getQuantityPolicyForSlug(slug: string): QuantityPolicy | null {
  return lookupSeedCatalogBySlug(slug)?.quantityPolicy ?? null;
}

export function getQuantityPolicyForAlias(userText: string): QuantityPolicy | null {
  return lookupSeedCatalogByAlias(userText)?.quantityPolicy ?? null;
}

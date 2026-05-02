import type { CanonicalCatalogSchemaRecord, QuantityPolicy } from "./catalogSchema";
import { getSeedCanonicalCatalog } from "./seedCanonicalCatalog";

export const DEFAULT_BRIDGE_CLARIFICATION_OPTION_LIMIT = 6;

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

export function extractClarificationOptionsFromTemplates(
  templates: Array<{ options?: string[] }>,
  limit = DEFAULT_BRIDGE_CLARIFICATION_OPTION_LIMIT
): string[] {
  if (!Array.isArray(templates) || templates.length === 0) {
    return [];
  }

  const normalizedSeen = new Set<string>();
  const suggestions: string[] = [];

  for (const template of templates) {
    for (const option of template.options ?? []) {
      const trimmedOption = (option ?? "").trim();
      if (!trimmedOption) continue;

      const normalizedOption = trimmedOption.toLowerCase();
      if (normalizedSeen.has(normalizedOption)) continue;

      normalizedSeen.add(normalizedOption);
      suggestions.push(trimmedOption);

      if (suggestions.length >= limit) {
        return suggestions;
      }
    }
  }

  return suggestions;
}

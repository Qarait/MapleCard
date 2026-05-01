import type { CanonicalItem } from "../matchParsedLineToCanonical";
import { getMappingBySeedId } from "../catalog/catalogIdMapping";
import { getSeedCanonicalCatalog } from "../catalog/seedCanonicalCatalog";
import type { CanonicalCatalogProvider } from "./catalogProvider";

export function adaptSeedCatalogRecordToCanonicalItem(record: {
  id: string;
  slug: string;
  display_name: string;
  category: string;
  aliases: string[];
  attribute_schema_json: Record<string, Array<string | number | boolean>>;
  default_attributes_json: Record<string, string | number | boolean>;
}): CanonicalItem {
  const mapping = getMappingBySeedId(record.id);
  const aliases = new Set(record.aliases);
  if (mapping) {
    aliases.add(mapping.syntheticSlug);
  }

  return {
    id: record.id,
    slug: record.slug,
    display_name: record.display_name,
    category: record.category,
    aliases_json: Array.from(aliases),
    attribute_schema_json: record.attribute_schema_json,
    default_attributes_json: record.default_attributes_json,
  };
}

export function getSeedCanonicalItems(): CanonicalItem[] {
  return getSeedCanonicalCatalog().map((record) => adaptSeedCatalogRecordToCanonicalItem(record));
}

export const seedCanonicalCatalogProvider: CanonicalCatalogProvider = {
  async getCanonicalItems() {
    return getSeedCanonicalItems();
  },
};
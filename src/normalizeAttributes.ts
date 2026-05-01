import { ATTRIBUTE_ALIASES } from "./config/attributeAliases";

function normalizeAttributeLookupKey(key: string): string {
  return key.trim().toLowerCase().replace(/[-_\s]+/g, "");
}

const ATTRIBUTE_KEY_LOOKUP = (() => {
  const lookup = new Map<string, string>();
  for (const [canonicalKey, entry] of Object.entries(ATTRIBUTE_ALIASES)) {
    lookup.set(normalizeAttributeLookupKey(canonicalKey), canonicalKey);
    for (const alias of entry.aliases) {
      lookup.set(normalizeAttributeLookupKey(alias), canonicalKey);
    }
  }
  return lookup;
})();

export function normalizeAttributeKey(key: string): string {
  return ATTRIBUTE_KEY_LOOKUP.get(normalizeAttributeLookupKey(key)) ?? key;
}

export function normalizeAttributeRecord<T>(record: Record<string, T> | null | undefined): Record<string, T> {
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};

  const normalized: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    normalized[normalizeAttributeKey(key)] = value as T;
  }
  return normalized;
}
import type { ParsedLine } from "./parseShoppingList";

export type CanonicalItem = {
  id: string;
  slug: string;
  display_name: string;
  category: string;
  default_attributes_json: Record<string, any>;
  attribute_schema_json: Record<string, any[]>;
  aliases_json: any; // typically string[]
};

export type CanonicalMatch = {
  canonicalItemId: string;
  resolvedName: string;
  matchConfidence: number;
  usedDefault: boolean;

  // Clarification flags
  lowConfidence: boolean;
  needsClarification: boolean;
  clarificationSuggestions: string[];

  // Carry through structured constraints so downstream scoring can select
  // the best concrete store product variant.
  requestedAttributes: Record<string, any>;
  requestedQuantity?: { value?: number; unit?: string };
};

function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardSimilarity(aTokens: string[], bTokens: string[]): number {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const tok of a) {
    if (b.has(tok)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function safeAliasesToStrings(aliases_json: any): string[] {
  if (!aliases_json) return [];
  if (Array.isArray(aliases_json)) {
    return aliases_json.filter((x) => typeof x === "string") as string[];
  }
  // Some drivers may deserialize jsonb arrays as something else; ignore if not array.
  return [];
}

function hasAliasMatch(parsedLine: ParsedLine, candidate: CanonicalItem): boolean {
  const aliases = safeAliasesToStrings(candidate.aliases_json);
  const q = parsedLine.canonicalQuery.trim().toLowerCase();
  const raw = parsedLine.rawText.toLowerCase();
  if (!q && !raw) return false;

  // Exact canonical slug / canonical query alias
  if (q && (q === candidate.slug.toLowerCase() || aliases.some((a) => a.toLowerCase() === q))) return true;

  // Substring match in raw text
  if (raw) {
    return aliases.some((a) => {
      const al = a.toLowerCase().trim();
      if (!al) return false;
      return raw.includes(al);
    });
  }

  return false;
}

function computeTextSimilarity(parsedLine: ParsedLine, candidate: CanonicalItem): number {
  const aliases = safeAliasesToStrings(candidate.aliases_json);
  const candidateText = `${candidate.display_name} ${candidate.slug} ${aliases.join(" ")}`;
  const rawTokens = normalizeTokens(parsedLine.rawText);
  const candTokens = normalizeTokens(candidateText);

  const base = jaccardSimilarity(rawTokens, candTokens); // 0..1

  const q = parsedLine.canonicalQuery.trim().toLowerCase();
  const aliasExact =
    q === candidate.slug.toLowerCase() || aliases.some((a) => a.toLowerCase() === q) ? 1 : 0;

  // Give alias exact matches a bump, but keep deterministic.
  return clamp01(base * 0.85 + aliasExact * 0.25);
}

function computeCategoryMatch(parsedLine: ParsedLine, candidate: CanonicalItem): number {
  const q = parsedLine.canonicalQuery.trim().toLowerCase();
  if (parsedLine.lineType === "category_request") {
    return q && candidate.category.toLowerCase() === q ? 1 : 0;
  }

  if (parsedLine.lineType === "exact_item") {
    // Exact item match implicitly signals category relevance.
    return q && candidate.slug.toLowerCase() === q ? 1 : 0.3;
  }

  if (parsedLine.lineType === "meal_intent") {
    // Meal intent is weak evidence; attribute/canonicalQuery suggestions should dominate.
    return candidate.category ? 0.45 : 0;
  }

  return 0.2;
}

function valuesContainAllowed(allowed: any[], value: any): boolean {
  return allowed.some((v) => {
    // strict equality works for strings/booleans/numbers
    // but avoid accidental matches for "2%" vs 2
    return v === value;
  });
}

function computeAttributeMatch(parsedLine: ParsedLine, candidate: CanonicalItem): number {
  const schema = candidate.attribute_schema_json ?? {};
  const attrs = parsedLine.attributes ?? {};
  const keys = Object.keys(attrs);
  if (keys.length === 0) return 0.45; // rely more on text/category

  let evaluated = 0;
  let matched = 0;

  for (const key of keys) {
    if (!(key in schema)) continue;
    evaluated++;
    const allowed = schema[key];
    const value = attrs[key];

    if (Array.isArray(allowed) && valuesContainAllowed(allowed, value)) matched++;
  }

  // If none of the provided attribute keys are in the schema, score softly.
  if (evaluated === 0) return 0.4;
  return matched / evaluated; // 0..1
}

function computeSizeCompatibility(parsedLine: ParsedLine, candidate: CanonicalItem): number {
  const unit = parsedLine.quantity?.unit?.toLowerCase();
  if (!unit) return 0.55;

  // Units we may have from parsing: L/ml/kg/g/lb/eggs/bananas
  const category = candidate.category.toLowerCase();
  const slug = candidate.slug.toLowerCase();

  if (unit === "eggs") return slug === "eggs" ? 1 : 0.45;
  if (unit === "bananas") return slug === "banana" ? 1 : 0.45;

  if (unit === "l" || unit === "ml") {
    // dairy likes liquids
    return category === "dairy" ? 1 : 0.6;
  }

  if (unit === "kg" || unit === "g" || unit === "lb") {
    // most meats/produce/grains/pantry use weight
    if (category === "dairy") return 0.65; // less likely, but possible
    if (category === "pantry" || category === "produce" || category === "meat") return 0.95;
    return 0.75;
  }

  return 0.6;
}

function computeUsedDefault(parsedLine: ParsedLine, candidate: CanonicalItem): boolean {
  const defaults = candidate.default_attributes_json ?? {};
  const providedKeys = Object.keys(parsedLine.attributes ?? {});
  if (providedKeys.length === 0) return true;

  // usedDefault if all provided keys match the candidate defaults exactly.
  for (const key of providedKeys) {
    if (!(key in defaults)) return false;
    if (parsedLine.attributes[key] !== defaults[key]) return false;
  }
  return true;
}

function computeDefaultPreference(usedDefault: boolean): number {
  return usedDefault ? 0.9 : 1.0;
}

function buildClarificationSuggestions(parsedLine: ParsedLine, candidate: CanonicalItem): string[] {
  const hints: string[] = [];
  const schema = candidate.attribute_schema_json ?? {};
  const attrs = parsedLine.attributes ?? {};

  for (const [key, value] of Object.entries(attrs)) {
    if (!(key in schema)) continue;
    const allowed = schema[key];
    if (Array.isArray(allowed) && !valuesContainAllowed(allowed, value)) {
      hints.push(`${key} must be one of: ${allowed.slice(0, 6).join(", ")}`);
    }
  }

  if (hints.length > 0) return hints.slice(0, 3);
  if (parsedLine.suggestions.length > 0) return parsedLine.suggestions.slice(0, 3);
  if (parsedLine.quantity?.unit) return [`Please confirm quantity for ${candidate.display_name}`];
  return ["Please confirm which specific item/variant you want."];
}

/**
 * Factory that creates a deterministic matcher over the provided canonical_items.
 */
export function createCanonicalMatcher(canonicalItems: CanonicalItem[]) {
  if (!Array.isArray(canonicalItems) || canonicalItems.length === 0) {
    throw new Error("createCanonicalMatcher requires at least one canonical item.");
  }

  function matchParsedLineToCanonical(parsedLine: ParsedLine): CanonicalMatch {
    const aliasCandidates: CanonicalItem[] = [];
    const categoryCandidates: CanonicalItem[] = [];

    for (const item of canonicalItems) {
      if (hasAliasMatch(parsedLine, item)) aliasCandidates.push(item);
      if (parsedLine.lineType === "category_request") {
        const q = parsedLine.canonicalQuery.trim().toLowerCase();
        if (q && item.category.toLowerCase() === q) categoryCandidates.push(item);
      } else if (parsedLine.lineType === "exact_item") {
        // Also treat direct slug match as a category candidate.
        const q = parsedLine.canonicalQuery.trim().toLowerCase();
        if (q && item.slug.toLowerCase() === q) categoryCandidates.push(item);
      }
    }

    const candidateSet = new Map<string, CanonicalItem>();
    for (const c of [...aliasCandidates, ...categoryCandidates]) candidateSet.set(c.id, c);
    let candidates = [...candidateSet.values()];

    // If no candidates found via alias/category, fall back to all items.
    if (candidates.length === 0) candidates = canonicalItems;

    let best: {
      item: CanonicalItem;
      score: number;
      usedDefault: boolean;
    } | null = null;

    for (const item of candidates) {
      const usedDefault = computeUsedDefault(parsedLine, item);
      const defaultPreference = computeDefaultPreference(usedDefault);

      const textSimilarity = computeTextSimilarity(parsedLine, item);
      const categoryMatch = computeCategoryMatch(parsedLine, item);
      const attributeMatch = computeAttributeMatch(parsedLine, item);
      const sizeCompatibility = computeSizeCompatibility(parsedLine, item);

      // Simple fixed weights (sum ~1.0). Keep attribute-heavy because we use structured attributes.
      const score =
        textSimilarity * 0.3 +
        categoryMatch * 0.15 +
        attributeMatch * 0.35 +
        sizeCompatibility * 0.1 +
        defaultPreference * 0.1;

      if (!best || score > best.score) {
        best = { item, score, usedDefault };
      }
    }

    const bestItem = best!.item;
    const matchConfidence = clamp01(best!.score);
    const lowConfidence = matchConfidence < 0.6;

    return {
      canonicalItemId: bestItem.id,
      resolvedName: bestItem.display_name || bestItem.slug,
      matchConfidence,
      usedDefault: best!.usedDefault,
      lowConfidence,
      needsClarification: lowConfidence,
      clarificationSuggestions: lowConfidence ? buildClarificationSuggestions(parsedLine, bestItem) : [],
      requestedAttributes: parsedLine.attributes ?? {},
      requestedQuantity: parsedLine.quantity,
    };
  }

  return matchParsedLineToCanonical;
}


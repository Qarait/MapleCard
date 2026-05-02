import type { CanonicalMatch } from "./matchParsedLineToCanonical";
import { extractCatalogClarificationQuestionCandidates, lookupSeedCatalogById } from "./catalog/catalogLookup";

export type ClarificationQuestion = {
  rawText: string;
  question: string;
  options: string[];
};

export type ClarificationInput = CanonicalMatch & {
  rawText: string;
  // Derived from ParsedLine; if present, it takes priority over low confidence.
  needsUserChoice?: boolean;
};

function clampNonEmptyStrings(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    const s = (v ?? "").toString().trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function uniqByNormalized(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const n = (s ?? "").toString().trim().toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(s);
  }
  return out;
}

function parseKeyHint(s: string): { key: string; allowed: string[] } | null {
  // Format produced by match builder:
  //   "<key> must be one of: <v1>, <v2>, ..."
  const m = s.match(/^([a-zA-Z0-9_]+)\s+must\s+be\s+one\s+of:\s*(.*)$/);
  if (!m) return null;
  const key = m[1];
  const allowedRaw = m[2] ?? "";
  const allowed = allowedRaw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (allowed.length === 0) return null;
  return { key, allowed };
}

function booleanToLabel(key: string, value: boolean): string {
  const truthy = (label: string) => (value ? label : "");
  switch (key) {
    case "lactoseFree":
      return value ? "lactose-free" : "regular (lactose)";
    case "organic":
      return value ? "organic" : "non-organic";
    case "cageFree":
      return value ? "cage-free" : "not cage-free";
    case "boneless":
      return value ? "boneless" : "with bones";
    case "skinless":
      return value ? "skinless" : "skin-on";
    default:
      return value ? truthy("yes") || "true" : "false";
  }
}

function valuesToOptions(key: string, allowed: string[]): string[] {
  const lowered = allowed.map((v) => v.trim().toLowerCase());

  // Convert common boolean-ish values.
  if (lowered.includes("true") || lowered.includes("false")) {
    return uniqByNormalized(
      allowed.map((v) => {
        const lv = v.trim().toLowerCase();
        if (lv === "true") return booleanToLabel(key, true);
        if (lv === "false") return booleanToLabel(key, false);
        return v;
      })
    );
  }

  // Otherwise keep as-is.
  return uniqByNormalized(allowed);
}

function pickQuestionTemplate(input: ClarificationInput, key?: string, options?: string[]): string {
  const resolved = (input.resolvedName ?? "").toString().toLowerCase();
  const raw = (input.rawText ?? "").toString().toLowerCase();
  const optLower = new Set((options ?? []).map((o) => o.toLowerCase()));

  if (key === "lactoseFree" && resolved.includes("milk")) return "Do you want lactose-free milk?";
  if (key === "organic") return resolved ? `Do you want organic ${resolved}?` : "Do you want organic?";
  if (key === "fat" && resolved.includes("milk")) return "Which milk fat level do you want?";
  if (key === "ripeness" && resolved.includes("banana")) return "What ripeness do you prefer for bananas?";
  if (key === "eggCount" || key === "size") return "Which egg option do you prefer?";
  if (key === "type" && resolved.includes("rice")) return "Which rice type do you prefer?";
  if (key && optLower.size > 0) return `Which option do you want for ${input.resolvedName}?`;

  // For meal-intent style choices, use content from options (rules-based).
  if (input.needsUserChoice || input.needsClarification) {
    if (optLower.has("banana") || optLower.has("bananas") || raw.includes("fruit")) return "Which fruit do you prefer for your kid?";
    return "Which option do you prefer?";
  }

  return "Can you confirm which item/variant you want?";
}

function determineOptions(input: ClarificationInput): { options: string[]; key?: string } {
  const suggestions = input.clarificationSuggestions ?? [];
  const hint = suggestions.map((s) => parseKeyHint(s)).find(Boolean) as { key: string; allowed: string[] } | undefined;
  if (hint) {
    return { key: hint.key, options: valuesToOptions(hint.key, hint.allowed) };
  }

  // Fallback: treat suggestions as selectable options.
  // Often these are canonical item candidates from meal_intent parsing.
  const cleaned = clampNonEmptyStrings(suggestions);
  return { options: cleaned };
}

function getCatalogClarificationQuestions(input: ClarificationInput): ClarificationQuestion[] {
  const seedRecord = lookupSeedCatalogById(input.canonicalItemId);
  if (!seedRecord) return [];

  return extractCatalogClarificationQuestionCandidates(seedRecord).map((candidate) => ({
    rawText: input.rawText,
    question: candidate.question,
    options: candidate.options,
  }));
}

/**
 * Generate rule-based clarification questions.
 * No LLM calls.
 */
export function generateClarificationQuestions(matches: ClarificationInput[]): ClarificationQuestion[] {
  const out: ClarificationQuestion[] = [];
  for (const m of matches) {
    const needsQuestion = m.needsUserChoice === true || m.matchConfidence < 0.65 || m.lowConfidence === true || m.needsClarification === true;
    if (!needsQuestion) continue;

    const catalogQuestions = getCatalogClarificationQuestions(m);
    if (catalogQuestions.length > 0) {
      out.push(...catalogQuestions);
      continue;
    }

    const { options, key } = determineOptions(m);
    const fallbackOptions = clampNonEmptyStrings(m.clarificationSuggestions ?? []);
    const finalOptions = options.length > 0 ? options.slice(0, 6) : fallbackOptions.slice(0, 6);

    const question = pickQuestionTemplate(m, key, finalOptions);
    out.push({
      rawText: m.rawText,
      question,
      options: clampNonEmptyStrings(finalOptions),
    });
  }
  return out;
}


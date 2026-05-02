import { extractClarificationOptionsFromTemplates, lookupSeedCatalogByAlias } from "./catalog/catalogLookup";
import type { QuantityPolicy } from "./catalog/catalogSchema";
import { logger } from "./utils/logger";

export type ParsedLine = {
  rawText: string;
  lineType: "exact_item" | "category_request" | "meal_intent" | "unknown";
  canonicalQuery: string;
  quantity?: { value?: number; unit?: string };
  attributes: Record<string, any>;
  suggestions: string[];
  needsUserChoice: boolean;
  confidence: number;
};

type KnownItem = {
  slug: string;
  category: string;
  attributeSchema: Record<string, any[]>;
  defaultAttributes: Record<string, any>;
  aliases: string[];
};

const KNOWN_ITEMS: KnownItem[] = [
  {
    slug: "milk",
    category: "dairy",
    attributeSchema: {
      fat: ["skim", "1%", "2%", "whole"],
      lactoseFree: [true, false],
      organic: [true, false],
    },
    defaultAttributes: {
      fat: "2%",
      lactoseFree: false,
      organic: false,
    },
    aliases: ["milk", "dairy milk", "cow milk"],
  },
  {
    slug: "eggs",
    category: "protein",
    attributeSchema: {
      size: ["small", "large", "jumbo"],
      eggCount: [6, 12, 18],
      organic: [true, false],
      cageFree: [true, false],
    },
    defaultAttributes: {
      size: "large",
      eggCount: 12,
      organic: false,
      cageFree: false,
    },
    aliases: ["eggs", "egg"],
  },
  {
    slug: "banana",
    category: "produce",
    attributeSchema: {
      ripeness: ["green", "yellow", "ripe"],
      organic: [true, false],
    },
    defaultAttributes: {
      ripeness: "yellow",
      organic: false,
    },
    aliases: ["banana", "bananas"],
  },
  {
    slug: "chicken",
    category: "meat",
    attributeSchema: {
      cut: ["breast", "thigh", "ground"],
      organic: [true, false],
      boneless: [true, false],
      skinless: [true, false],
    },
    defaultAttributes: {
      cut: "breast",
      organic: false,
      boneless: true,
      skinless: true,
    },
    aliases: ["chicken"],
  },
  {
    slug: "rice",
    category: "pantry",
    attributeSchema: {
      type: ["white", "brown", "basmati", "jasmine"],
      organic: [true, false],
    },
    defaultAttributes: {
      type: "white",
      organic: false,
    },
    aliases: ["rice", "white rice", "brown rice"],
  },
];

const CATEGORY_TO_SUGGESTED_ITEMS: Record<string, string[]> = {
  dairy: ["milk"],
  protein: ["eggs"],
  produce: ["banana"],
  meat: ["chicken"],
  pantry: ["rice"],
};

function normalizeText(s: string) {
  return s.trim().toLowerCase();
}

function stripLeadingQuantityPhrase(line: string) {
  return line
    .trim()
    .replace(
      /^(\d+(?:\.\d+)?)\s*(l|lt|liter|litre|ml|kg|g|lb|lbs|pound|pounds|item|items|dozen|dozens|bunch|bunches|box|boxes|bag|bags|package|packages|pack|packs|jar|jars|bottle|bottles|tub|tubs|can|cans|roll|rolls)?\s+/i,
      ""
    )
    .trim();
}

function parseQuantityFromLine(line: string): { value?: number; unit?: string } | undefined {
  const t = line.trim();
  if (!t) return undefined;

  // Size / weight patterns first (milk 1L, chicken 2lb, rice 5lb, banana 2lb)
  const unitMatch =
    t.match(
      /(^|[\s,;])(\d+(?:\.\d+)?)\s*(l|lt|liter|litre|ml|mL|kg|g|lb|lbs|pound|pounds)\b/i
    ) ??
    // e.g. "500 ml" (with optional space already covered above) but this handles "500ml"
    t.match(/(^|[\s,;])(\d+(?:\.\d+)?)\s*(ml|g|kg|lb|lbs)\b/i);

  if (unitMatch) {
    // unitMatch[1] is the leading boundary, [2] is the numeric value, [3] is the unit
    const rawValue = unitMatch[2];
    const rawUnit = unitMatch[3].toLowerCase();
    const value = Number(rawValue);

    const unitMap: Record<string, string> = {
      l: "L",
      lt: "L",
      liter: "L",
      litre: "L",
      ml: "ml",
      "mL": "ml",
      kg: "kg",
      g: "g",
      lb: "lb",
      lbs: "lb",
      pound: "lb",
      pounds: "lb",
    };

    const unit = unitMap[rawUnit] ?? rawUnit;
    if (Number.isFinite(value)) return { value, unit };
  }

  // Bare quantity patterns (e.g. "12 eggs") - keep unit generic.
  const bareMatch = t.match(/(^|[\s,;])(\d+)\b/);
  if (bareMatch) {
    const value = Number(bareMatch[2]);
    if (!Number.isFinite(value)) return undefined;
    return { value };
  }

  return undefined;
}

function milkRule(line: string) {
  const t = normalizeText(line);
  const hasMilk = /\bmilk\b/.test(t) || KNOWN_ITEMS.find((x) => x.slug === "milk")!.aliases.some((a) => t.includes(a));
  if (!hasMilk) return null;

  const attributes: Record<string, any> = { ...KNOWN_ITEMS[0].defaultAttributes };

  // fat: "skim", "whole", or "2%" / "1%"
  if (/\bskim\b/.test(t)) attributes.fat = "skim";
  else if (/\bwhole\b/.test(t)) attributes.fat = "whole";
  else {
    const pct = t.match(/\b([12])\s*%/);
    if (pct) attributes.fat = `${pct[1]}%`;
  }

  if (/\blactose\s*-?\s*free\b/.test(t) || /\blactosefree\b/.test(t)) attributes.lactoseFree = true;
  if (/\borganic\b/.test(t)) attributes.organic = true;

  // Quantity: prefer volume (1L, 500ml). For "2% milk", do not treat 2% as quantity.
  const quantity = parseQuantityFromLine(line);
  const containsFatPercent = /\b([12])\s*%/.test(t) && /\bmilk\b/.test(t);
  const finalQuantity =
    containsFatPercent && quantity?.unit == null
      ? undefined
      : quantity && quantity.unit == null && /\b\d+(\.\d+)?\b/.test(t)
        ? // "2 milk" without explicit unit is ambiguous, don't assume it means volume.
          undefined
        : quantity;

  const allFats: string[] = ["skim", "1%", "2%", "whole"];
  const suggestions = allFats
    .filter((fat) => fat !== attributes.fat)
    .slice(0, 3)
    .map((fat) => `milk ${fat}`);

  const confidence = 0.9;
  return {
    lineType: "exact_item" as const,
    canonicalQuery: "milk",
    attributes,
    suggestions: Array.from(new Set(suggestions)).slice(0, 3),
    quantity: finalQuantity,
    needsUserChoice: false,
    confidence,
  };
}

function eggsRule(line: string) {
  const t = normalizeText(line);
  const hasEggs =
    /\beggs?\b/.test(t) ||
    KNOWN_ITEMS.find((x) => x.slug === "eggs")!.aliases.some((a) => t.includes(a));
  if (!hasEggs) return null;

  const item = KNOWN_ITEMS.find((x) => x.slug === "eggs")!;
  const attributes: Record<string, any> = { ...item.defaultAttributes };

  if (/\bjumbo\b/.test(t)) attributes.size = "jumbo";
  else if (/\blarge\b/.test(t)) attributes.size = "large";
  else if (/\bsmall\b/.test(t)) attributes.size = "small";

  const eggCountMatch = t.match(/\b(6|12|18)\b/);
  if (eggCountMatch) attributes.eggCount = Number(eggCountMatch[1]);

  if (/\borganic\b/.test(t)) attributes.organic = true;
  if (/\bcage\s*-?\s*free\b/.test(t) || /\bfree\s*-?\s*range\b/.test(t) || /\bcagefree\b/.test(t)) {
    attributes.cageFree = true;
  }

  const quantity = parseQuantityFromLine(line);
  const finalQuantity =
    quantity?.value != null && Number.isFinite(quantity.value)
      ? { value: attributes.eggCount ?? quantity.value, unit: "eggs" }
      : undefined;

  const suggestions: string[] = [];
  if (attributes.organic) suggestions.push("non-organic eggs");
  else suggestions.push("organic eggs");
  if (attributes.cageFree) suggestions.push("cage-free eggs");
  else suggestions.push("cage-free eggs");

  const confidence = 0.88;
  return {
    lineType: "exact_item" as const,
    canonicalQuery: "eggs",
    attributes,
    suggestions: Array.from(new Set(suggestions)).slice(0, 3),
    quantity: finalQuantity,
    needsUserChoice: false,
    confidence,
  };
}

function bananaRule(line: string) {
  const t = normalizeText(line);
  const hasBanana = /\bbananas?\b/.test(t) || KNOWN_ITEMS.find((x) => x.slug === "banana")!.aliases.some((a) => t.includes(a));
  if (!hasBanana) return null;

  const item = KNOWN_ITEMS.find((x) => x.slug === "banana")!;
  const attributes: Record<string, any> = { ...item.defaultAttributes };

  if (/\bgreen\b/.test(t)) attributes.ripeness = "green";
  else if (/\byellow\b/.test(t)) attributes.ripeness = "yellow";
  else if (/\bripe\b/.test(t)) attributes.ripeness = "ripe";

  if (/\borganic\b/.test(t)) attributes.organic = true;

  const quantity = parseQuantityFromLine(line);
  const finalQuantity =
    quantity && quantity.value != null && quantity.unit == null
      ? { value: quantity.value, unit: "bananas" }
      : quantity;

  const suggestions = [
    attributes.ripeness === "green" ? "yellow bananas" : "green bananas",
    attributes.organic ? "non-organic bananas" : "organic bananas",
  ];
  const confidence = 0.86;
  return {
    lineType: "exact_item" as const,
    canonicalQuery: "banana",
    attributes,
    suggestions: Array.from(new Set(suggestions)).slice(0, 3),
    quantity: finalQuantity,
    needsUserChoice: false,
    confidence,
  };
}

function chickenRule(line: string) {
  const t = normalizeText(line);
  const hasChicken = /\bchicken\b/.test(t) || KNOWN_ITEMS.find((x) => x.slug === "chicken")!.aliases.some((a) => t.includes(a));
  if (!hasChicken) return null;

  const item = KNOWN_ITEMS.find((x) => x.slug === "chicken")!;
  const attributes: Record<string, any> = { ...item.defaultAttributes };

  if (/\bthighs?\b/.test(t)) attributes.cut = "thigh";
  else if (/\bground\b/.test(t)) attributes.cut = "ground";
  else if (/\bbreasts?\b/.test(t)) attributes.cut = "breast";

  if (/\borganic\b/.test(t)) attributes.organic = true;
  if (/\bboneless\b/.test(t)) attributes.boneless = true;
  if (/\bskinless\b/.test(t)) attributes.skinless = true;

  // Avoid flipping defaults incorrectly when user says "with skin"/"with bones" (not modeled).
  if (/\bwith\s+skin\b/.test(t) || /\bskin\s*on\b/.test(t) || /\bnot\s+skinless\b/.test(t)) {
    attributes.skinless = false;
  }
  if (/\bwith\s+bones\b/.test(t) || /\bbone\s*in\b/.test(t) || /\bnot\s+boneless\b/.test(t)) {
    attributes.boneless = false;
  }

  const quantity = parseQuantityFromLine(line);
  const finalQuantity =
    quantity && quantity.value != null && quantity.unit == null
      ? undefined
      : quantity;

  const suggestions = [
    attributes.cut === "breast" ? "chicken thighs" : "chicken breast",
    attributes.organic ? "non-organic chicken" : "organic chicken",
  ];
  const confidence = 0.86;
  return {
    lineType: "exact_item" as const,
    canonicalQuery: "chicken",
    attributes,
    suggestions: Array.from(new Set(suggestions)).slice(0, 3),
    quantity: finalQuantity,
    needsUserChoice: false,
    confidence,
  };
}

function riceRule(line: string) {
  const t = normalizeText(line);
  const hasRice = /\brice\b/.test(t) || KNOWN_ITEMS.find((x) => x.slug === "rice")!.aliases.some((a) => t.includes(a));
  if (!hasRice) return null;

  const item = KNOWN_ITEMS.find((x) => x.slug === "rice")!;
  const attributes: Record<string, any> = { ...item.defaultAttributes };

  if (/\bbasmati\b/.test(t)) attributes.type = "basmati";
  else if (/\bjasmine\b/.test(t)) attributes.type = "jasmine";
  else if (/\bbrown\b/.test(t)) attributes.type = "brown";
  else if (/\bwhite\b/.test(t)) attributes.type = "white";

  if (/\borganic\b/.test(t)) attributes.organic = true;

  const quantity = parseQuantityFromLine(line);
  const finalQuantity =
    quantity && quantity.value != null && quantity.unit == null
      ? undefined
      : quantity;

  const suggestions = [
    attributes.type === "brown" ? "white rice" : "brown rice",
    attributes.organic ? "non-organic rice" : "organic rice",
  ];
  const confidence = 0.86;
  return {
    lineType: "exact_item" as const,
    canonicalQuery: "rice",
    attributes,
    suggestions: Array.from(new Set(suggestions)).slice(0, 3),
    quantity: finalQuantity,
    needsUserChoice: false,
    confidence,
  };
}

function resolveCatalogAwareQuantity(line: string, quantityPolicy: QuantityPolicy) {
  const quantity = parseQuantityFromLine(line);

  if (!quantity || quantity.value == null) return undefined;
  if (quantity.unit != null) return quantity;

  if (quantityPolicy.kind === "countable_item") {
    return { value: quantity.value, unit: quantityPolicy.defaultUnit };
  }

  if (quantityPolicy.kind === "volume_based_item" && quantityPolicy.bareNumberInterpretation === "volume") {
    return { value: quantity.value, unit: quantityPolicy.defaultUnit };
  }

  if (quantityPolicy.kind === "weight_based_item" && quantityPolicy.bareNumberInterpretation === "package_count") {
    return { value: quantity.value };
  }

  return undefined;
}

function getBridgeClarificationSuggestions(record: { clarificationTemplates: Array<{ options?: string[] }> }) {
  return extractClarificationOptionsFromTemplates(record.clarificationTemplates);
}

function seedCatalogBridgeRule(line: string) {
  const candidateText = stripLeadingQuantityPhrase(line);
  if (!candidateText) return null;

  const record = lookupSeedCatalogByAlias(candidateText);
  if (!record) return null;

  const suggestions = getBridgeClarificationSuggestions(record);

  return {
    lineType: "exact_item" as const,
    canonicalQuery: record.slug,
    quantity: resolveCatalogAwareQuantity(line, record.quantityPolicy),
    attributes: { ...(record.default_attributes_json ?? {}) },
    suggestions,
    needsUserChoice: suggestions.length > 0,
    confidence: suggestions.length > 0 ? 0.78 : 0.82,
  };
}

function categoryRequestRule(line: string) {
  const t = normalizeText(line);

  const hit = Object.keys(CATEGORY_TO_SUGGESTED_ITEMS).find((cat) => {
    if (!cat) return false;
    if (cat === "pantry") return /\bpantry\b/.test(t) || /\bstaples?\b/.test(t) || /\bgrains\b/.test(t);
    return new RegExp(`\\b${cat}\\b`).test(t);
  });
  if (!hit) return null;

  const suggestions = CATEGORY_TO_SUGGESTED_ITEMS[hit] ?? [];
  return {
    lineType: "category_request" as const,
    canonicalQuery: hit,
    attributes: {},
    suggestions,
    needsUserChoice: false,
    confidence: 0.87,
  };
}

function mealIntentRule(line: string) {
  const t = normalizeText(line);
  const mealKeywords = ["dinner", "supper", "tonight", "tomorrow", "lunch", "breakfast", "brunch", "meal"];
  const hasMeal = mealKeywords.some((k) => t.includes(k));
  if (!hasMeal) return null;

  // If rules already detect a known item/category, do not treat as ambiguous meal intent.
  const hasKnownItem =
    KNOWN_ITEMS.some((item) => item.aliases.some((a) => t.includes(a))) || /\bmilk\b/.test(t) || /\beggs?\b/.test(t) || /\bchicken\b/.test(t) || /\brice\b/.test(t) || /\bbananas?\b/.test(t);
  const hasCategory = Object.keys(CATEGORY_TO_SUGGESTED_ITEMS).some((cat) => new RegExp(`\\b${cat}\\b`).test(t));
  if (hasKnownItem || hasCategory) return null;

  // Generic meal intent is ambiguous and requires user choice or LLM assistance.
  const intent =
    /\bdinner|supper|tonight\b/.test(t) ? "dinner" :
    /\blunch\b/.test(t) ? "lunch" :
    /\bbreakfast\b/.test(t) ? "breakfast" :
    /\bbrunch\b/.test(t) ? "brunch" :
    "meal";

  const suggestions = ["chicken", "rice", "eggs", "milk", "banana"];
  return {
    lineType: "meal_intent" as const,
    canonicalQuery: intent,
    attributes: {},
    suggestions,
    needsUserChoice: true,
    confidence: 0.65,
  };
}

function buildParsedLineBase(line: string, partial: Omit<ParsedLine, "rawText">): ParsedLine {
  return {
    rawText: line,
    ...partial,
  };
}

export type ParserMode = "deterministic_only" | "llm_assisted";

export type ParserDiagnostics = {
  parserMode: ParserMode;
  llmEnabled: boolean;
  llmAttempted: boolean;
  llmCalls: number;
  llmFallbacks: number;
  llmSkippedReason: string | null;
  warnings: string[];
};

export type ParseShoppingListResult = {
  parsedLines: ParsedLine[];
  diagnostics: ParserDiagnostics;
};

const DEFAULT_LLM_FALLBACK_SUGGESTIONS = ["chicken", "rice", "eggs"];
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_TIMEOUT_MS = 5000;
const DEFAULT_OPENAI_MAX_BATCH_ITEMS = 20;

function buildFallbackParsedLine(rawText: string): ParsedLine {
  return buildParsedLineBase(rawText, {
    lineType: "meal_intent",
    canonicalQuery: "meal",
    quantity: undefined,
    attributes: {},
    suggestions: DEFAULT_LLM_FALLBACK_SUGGESTIONS,
    needsUserChoice: true,
    confidence: 0.6,
  });
}

function makeFallbackResults(lines: { index: number; rawText: string }[]): { index: number; parsed: ParsedLine }[] {
  return lines.map(({ index, rawText }) => ({
    index,
    parsed: buildFallbackParsedLine(rawText),
  }));
}

function pushParserWarning(diagnostics: ParserDiagnostics, warning: string) {
  diagnostics.warnings.push(warning);
  logger.warn(`[MapleCard parser] ${warning}`);
}

function parsePositiveIntegerEnv(rawValue: string | undefined, fallback: number, diagnostics: ParserDiagnostics, envName: string): number {
  if (rawValue == null || rawValue.trim() === "") return fallback;

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    pushParserWarning(diagnostics, `${envName} is invalid; using default ${fallback}.`);
    return fallback;
  }

  return parsedValue;
}

function resolveParserMode(diagnostics: ParserDiagnostics): ParserMode {
  const rawMode = (process.env.MAPLECARD_PARSER_MODE ?? "deterministic_only").trim();
  if (rawMode === "deterministic_only" || rawMode === "llm_assisted") {
    return rawMode;
  }

  pushParserWarning(diagnostics, `MAPLECARD_PARSER_MODE is invalid; using deterministic_only.`);
  return "deterministic_only";
}

function getOpenAIConfig(diagnostics: ParserDiagnostics) {
  return {
    model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    timeoutMs: parsePositiveIntegerEnv(process.env.OPENAI_TIMEOUT_MS, DEFAULT_OPENAI_TIMEOUT_MS, diagnostics, "OPENAI_TIMEOUT_MS"),
    maxBatchItems: parsePositiveIntegerEnv(process.env.OPENAI_MAX_BATCH_ITEMS, DEFAULT_OPENAI_MAX_BATCH_ITEMS, diagnostics, "OPENAI_MAX_BATCH_ITEMS"),
  };
}

function isAmbiguousForLLM(parsed: ParsedLine): boolean {
  // Only call the LLM for ambiguous meal-intent lines.
  return parsed.lineType === "meal_intent" && parsed.needsUserChoice;
}

function validateParsedLineCandidate(x: any): x is ParsedLine {
  if (!x || typeof x !== "object") return false;
  if (typeof x.rawText !== "string") return false;
  if (!["exact_item", "category_request", "meal_intent", "unknown"].includes(x.lineType)) return false;
  if (typeof x.canonicalQuery !== "string") return false;
  if (typeof x.attributes !== "object" || x.attributes == null || Array.isArray(x.attributes)) return false;
  if (!Array.isArray(x.suggestions)) return false;
  if (typeof x.needsUserChoice !== "boolean") return false;
  if (typeof x.confidence !== "number") return false;
  if (x.quantity !== undefined) {
    if (typeof x.quantity !== "object" || x.quantity == null || Array.isArray(x.quantity)) return false;
    if (x.quantity.value !== undefined && typeof x.quantity.value !== "number") return false;
    if (x.quantity.unit !== undefined && typeof x.quantity.unit !== "string") return false;
  }
  return true;
}

async function callOpenAIForAmbiguousLines(args: {
  lines: { index: number; rawText: string }[];
  model: string;
  timeoutMs: number;
  diagnostics: ParserDiagnostics;
}): Promise<{ index: number; parsed: ParsedLine }[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return makeFallbackResults(args.lines);
  }

  // Use Chat Completions with JSON-only output.
  const system = [
    "You are a strict grocery list parser for a shopping optimization system.",
    "Return only valid JSON. No markdown, no commentary, no free text.",
    "Each result must match the ParsedLine shape exactly.",
  ].join("\n");

  const payload = {
    model: args.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "Classify each ambiguous line into exactly one lineType and fill ParsedLine fields.",
            parsedLineSchema: {
              rawText: "string",
              lineType: ["exact_item", "category_request", "meal_intent", "unknown"],
              canonicalQuery: "string",
              quantity: { value: "number|undefined", unit: "string|undefined" },
              attributes: "object",
              suggestions: "string[]",
              needsUserChoice: "boolean",
              confidence: "number",
            },
            canonicalItems: KNOWN_ITEMS.map((it) => ({
              slug: it.slug,
              category: it.category,
              attribute_schema_json: it.attributeSchema,
              default_attributes_json: it.defaultAttributes,
            })),
            categorySuggestions: CATEGORY_TO_SUGGESTED_ITEMS,
            rules: [
              "Rules have already been applied. You are only handling ambiguous meal-intent lines.",
              "If the line actually mentions one of the canonical items, return lineType='exact_item'.",
              "If the line requests a category like dairy/produce/meat/pantry/protein, return lineType='category_request'.",
              "If it is truly a meal intent (e.g. 'something for dinner') return lineType='meal_intent'.",
              "If you are unsure, set needsUserChoice=true and use confidence between 0.6 and 0.8.",
              "For exact_item, set attributes using allowed values; if missing, use default_attributes_json.",
              "Do not treat milk fat percentages (e.g. '2%') as quantity; treat volumes (1L, 500ml) as quantity.",
            ],
            inputs: args.lines.map((l) => ({ index: l.index, rawText: l.rawText })),
          },
          null,
          0
        ),
      },
    ],
  };

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, args.timeoutMs);

  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    args.diagnostics.llmFallbacks += args.lines.length;
    if ((error as Error)?.name === "AbortError") {
      pushParserWarning(args.diagnostics, `OpenAI request timed out after ${args.timeoutMs}ms; using deterministic fallback.`);
    } else {
      pushParserWarning(args.diagnostics, "OpenAI request failed; using deterministic fallback.");
    }
    return makeFallbackResults(args.lines);
  }
  clearTimeout(timeoutHandle);

  if (!resp.ok) {
    args.diagnostics.llmFallbacks += args.lines.length;
    pushParserWarning(args.diagnostics, `OpenAI request failed with status ${resp.status}; using deterministic fallback.`);
    return makeFallbackResults(args.lines);
  }

  const data: any = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  let json: any;
  try {
    json = typeof content === "string" ? JSON.parse(content) : content;
  } catch {
    json = null;
  }

  const results: any[] = json?.results ?? json?.lines ?? [];
  if (!Array.isArray(results)) {
    args.diagnostics.llmFallbacks += args.lines.length;
    pushParserWarning(args.diagnostics, "OpenAI response was not valid JSON for parser results; using deterministic fallback.");
    return makeFallbackResults(args.lines);
  }

  // Expect results aligned to the inputs, but handle if LLM includes wrong ordering.
  const byIndex = new Map<number, ParsedLine>();
  for (const item of results) {
    const parsedCandidate = item?.parsed ?? item; // accept both {parsed:{...}} and direct objects
    if (!validateParsedLineCandidate(parsedCandidate)) continue;
    // Prefer the LLM-provided rawText; but we will keep it as returned.
    // If the LLM also provides index, respect it:
    const idx = typeof item?.index === "number" ? item.index : null;
    if (idx != null) byIndex.set(idx, parsedCandidate);
  }

  // Fill in missing indices.
  return args.lines.map(({ index, rawText }) => {
    const fromMap = byIndex.get(index);
    if (fromMap) return { index, parsed: fromMap };
    args.diagnostics.llmFallbacks += 1;
    pushParserWarning(args.diagnostics, `OpenAI response omitted parser result for line ${index}; using deterministic fallback.`);
    return {
      index,
      parsed: buildFallbackParsedLine(rawText),
    };
  });
}

export async function parseShoppingListDetailed(rawInput: string): Promise<ParseShoppingListResult> {
  const diagnostics: ParserDiagnostics = {
    parserMode: "deterministic_only",
    llmEnabled: false,
    llmAttempted: false,
    llmCalls: 0,
    llmFallbacks: 0,
    llmSkippedReason: null,
    warnings: [],
  };

  diagnostics.parserMode = resolveParserMode(diagnostics);
  const openAIConfig = getOpenAIConfig(diagnostics);
  const apiKeyPresent = Boolean(process.env.OPENAI_API_KEY);
  diagnostics.llmEnabled = diagnostics.parserMode === "llm_assisted" && apiKeyPresent;

  const lines = rawInput.split(/\r?\n/);

  const parsed: ParsedLine[] = new Array(lines.length);
  const ambiguousForLLM: { index: number; rawText: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawText = lines[i] ?? "";
    const t = rawText.trim();

    if (!t) {
      parsed[i] = buildParsedLineBase(rawText, {
        lineType: "unknown",
        canonicalQuery: "",
        quantity: undefined,
        attributes: {},
        suggestions: [],
        needsUserChoice: false,
        confidence: 0.2,
      });
      continue;
    }

    // 1) Rules: exact items first.
    const milk = milkRule(rawText);
    if (milk) {
      parsed[i] = buildParsedLineBase(rawText, milk);
      continue;
    }
    const eggs = eggsRule(rawText);
    if (eggs) {
      parsed[i] = buildParsedLineBase(rawText, eggs);
      continue;
    }
    const banana = bananaRule(rawText);
    if (banana) {
      parsed[i] = buildParsedLineBase(rawText, banana);
      continue;
    }
    const chicken = chickenRule(rawText);
    if (chicken) {
      parsed[i] = buildParsedLineBase(rawText, chicken);
      continue;
    }
    const rice = riceRule(rawText);
    if (rice) {
      parsed[i] = buildParsedLineBase(rawText, rice);
      continue;
    }

    const seedCatalogBridgeItem = seedCatalogBridgeRule(rawText);
    if (seedCatalogBridgeItem) {
      parsed[i] = buildParsedLineBase(rawText, seedCatalogBridgeItem);
      continue;
    }

    // 2) Rules: category request.
    const cat = categoryRequestRule(rawText);
    if (cat) {
      parsed[i] = buildParsedLineBase(rawText, cat);
      continue;
    }

    // 3) Rules: meal intent (ambiguous) - LLM only when needed.
    const meal = mealIntentRule(rawText);
    if (meal) {
      parsed[i] = buildParsedLineBase(rawText, meal);
      if (isAmbiguousForLLM(parsed[i])) ambiguousForLLM.push({ index: i, rawText });
      continue;
    }

    // 4) Otherwise unknown
    parsed[i] = buildParsedLineBase(rawText, {
      lineType: "unknown",
      canonicalQuery: "",
      quantity: undefined,
      attributes: {},
      suggestions: [],
      needsUserChoice: false,
      confidence: 0.4,
    });
  }

  if (ambiguousForLLM.length > 0) {
    if (diagnostics.parserMode === "deterministic_only") {
      diagnostics.llmSkippedReason = "parser_mode_deterministic_only";
      diagnostics.llmFallbacks += ambiguousForLLM.length;
      for (const item of ambiguousForLLM) {
        parsed[item.index] = buildFallbackParsedLine(item.rawText);
      }
    } else if (!apiKeyPresent) {
      diagnostics.llmSkippedReason = "missing_openai_api_key";
      diagnostics.llmFallbacks += ambiguousForLLM.length;
      pushParserWarning(diagnostics, "MAPLECARD_PARSER_MODE=llm_assisted but OPENAI_API_KEY is missing; using deterministic fallback.");
      for (const item of ambiguousForLLM) {
        parsed[item.index] = buildFallbackParsedLine(item.rawText);
      }
    } else {
      diagnostics.llmAttempted = true;
      diagnostics.llmCalls = 1;

      const llmBatch = ambiguousForLLM.slice(0, openAIConfig.maxBatchItems);
      const overflow = ambiguousForLLM.slice(openAIConfig.maxBatchItems);
      if (overflow.length > 0) {
        diagnostics.llmFallbacks += overflow.length;
        diagnostics.llmSkippedReason = "openai_batch_overflow";
        pushParserWarning(
          diagnostics,
          `OPENAI_MAX_BATCH_ITEMS limit reached; ${overflow.length} ambiguous lines used deterministic fallback.`
        );
      }

      const llmResults = await callOpenAIForAmbiguousLines({
        lines: llmBatch,
        model: openAIConfig.model,
        timeoutMs: openAIConfig.timeoutMs,
        diagnostics,
      });
      const byIndex = new Map<number, ParsedLine>();
      for (const r of llmResults) byIndex.set(r.index, r.parsed);
      for (let i = 0; i < parsed.length; i++) {
        if (byIndex.has(i)) parsed[i] = byIndex.get(i)!;
      }

      for (const item of overflow) {
        parsed[item.index] = buildFallbackParsedLine(item.rawText);
      }
    }
  } else {
    diagnostics.llmSkippedReason = "no_ambiguous_lines";
  }

  // Final safety: ensure return is structured JSON (objects only).
  return {
    parsedLines: parsed,
    diagnostics: {
      ...diagnostics,
      warnings: [...diagnostics.warnings],
    },
  };
}

export async function parseShoppingList(rawInput: string): Promise<ParsedLine[]> {
  const result = await parseShoppingListDetailed(rawInput);
  return result.parsedLines;
}


import { afterEach, describe, expect, it, vi } from "vitest";
import { getLastParserDiagnostics, parseShoppingList, resetLastParserDiagnostics } from "../src/parseShoppingList";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_WARN = console.warn;

function ambiguousInput(count: number): string {
  return Array.from({ length: count }, (_, index) => `something for dinner ${index + 1}`).join("\n");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
  console.warn = ORIGINAL_WARN;
  resetLastParserDiagnostics();
  vi.restoreAllMocks();
});

describe("parseShoppingList OpenAI guardrails", () => {
  it("does not call OpenAI in deterministic_only mode", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.OPENAI_API_KEY = "test-key";
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;

    const parsed = await parseShoppingList("something for dinner");
    const diagnostics = getLastParserDiagnostics();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(parsed[0].lineType).toBe("meal_intent");
    expect(diagnostics.parserMode).toBe("deterministic_only");
    expect(diagnostics.llmEnabled).toBe(false);
    expect(diagnostics.llmAttempted).toBe(false);
    expect(diagnostics.llmFallbacks).toBe(1);
    expect(diagnostics.llmSkippedReason).toBe("parser_mode_deterministic_only");
  });

  it("falls back safely in llm_assisted mode when OPENAI_API_KEY is missing", async () => {
    process.env.MAPLECARD_PARSER_MODE = "llm_assisted";
    delete process.env.OPENAI_API_KEY;
    const warnSpy = vi.fn();
    console.warn = warnSpy;

    const parsed = await parseShoppingList("something for dinner");
    const diagnostics = getLastParserDiagnostics();

    expect(parsed[0].canonicalQuery).toBe("meal");
    expect(diagnostics.parserMode).toBe("llm_assisted");
    expect(diagnostics.llmEnabled).toBe(false);
    expect(diagnostics.llmAttempted).toBe(false);
    expect(diagnostics.llmFallbacks).toBe(1);
    expect(diagnostics.llmSkippedReason).toBe("missing_openai_api_key");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("falls back safely when the OpenAI request times out", async () => {
    process.env.MAPLECARD_PARSER_MODE = "llm_assisted";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_TIMEOUT_MS = "5";

    global.fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }) as typeof fetch;

    const parsed = await parseShoppingList("something for dinner");
    const diagnostics = getLastParserDiagnostics();

    expect(parsed[0].canonicalQuery).toBe("meal");
    expect(diagnostics.llmAttempted).toBe(true);
    expect(diagnostics.llmCalls).toBe(1);
    expect(diagnostics.llmFallbacks).toBe(1);
    expect(diagnostics.warnings.some((warning) => warning.includes("timed out"))).toBe(true);
  });

  it("caps ambiguous meal-intent batches and falls back for overflow", async () => {
    process.env.MAPLECARD_PARSER_MODE = "llm_assisted";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MAX_BATCH_ITEMS = "2";

    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: [
                    {
                      index: 0,
                      parsed: {
                        rawText: "something for dinner 1",
                        lineType: "exact_item",
                        canonicalQuery: "chicken",
                        quantity: undefined,
                        attributes: { cut: "breast", organic: false, boneless: true, skinless: true },
                        suggestions: ["rice"],
                        needsUserChoice: false,
                        confidence: 0.77,
                      },
                    },
                    {
                      index: 1,
                      parsed: {
                        rawText: "something for dinner 2",
                        lineType: "exact_item",
                        canonicalQuery: "rice",
                        quantity: undefined,
                        attributes: { type: "white", organic: false },
                        suggestions: ["chicken"],
                        needsUserChoice: false,
                        confidence: 0.74,
                      },
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const parsed = await parseShoppingList(ambiguousInput(3));
    const diagnostics = getLastParserDiagnostics();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(parsed[0].canonicalQuery).toBe("chicken");
    expect(parsed[1].canonicalQuery).toBe("rice");
    expect(parsed[2].canonicalQuery).toBe("meal");
    expect(diagnostics.llmCalls).toBe(1);
    expect(diagnostics.llmFallbacks).toBe(1);
    expect(diagnostics.llmSkippedReason).toBe("openai_batch_overflow");
  });
});
import { describe, expect, it } from "vitest";
import { generateClarificationQuestions } from "../src/generateClarificationQuestions";
import { createCanonicalMatcher } from "../src/matchParsedLineToCanonical";
import { selectBestStoreWithAlternatives } from "../src/selectBestStore";
import { getSyntheticCanonicalItems, getSyntheticStoreProducts } from "../src/services/syntheticCatalogService";

describe("domain behavior", () => {
  it("generates a basic clarification question", () => {
    const questions = generateClarificationQuestions([
      {
        rawText: "milk",
        canonicalItemId: "item-1",
        resolvedName: "Milk",
        matchConfidence: 0.5,
        usedDefault: false,
        lowConfidence: true,
        needsClarification: true,
        clarificationSuggestions: ["fat must be one of: skim, 1%, 2%, whole"],
        requestedAttributes: {},
      },
    ]);

    expect(questions).toHaveLength(1);
    expect(questions[0].question).toBe("Which milk fat level do you want?");
    expect(questions[0].options).toEqual(["skim", "1%", "2%", "whole"]);
  });

  it("selects the basic winning store deterministically", () => {
    const matchParsedLineToCanonical = createCanonicalMatcher(getSyntheticCanonicalItems());
    const matches = [
      matchParsedLineToCanonical({
        rawText: "2% milk",
        lineType: "exact_item",
        canonicalQuery: "milk",
        quantity: undefined,
        attributes: { fat: "2%", lactoseFree: false, organic: false },
        suggestions: [],
        needsUserChoice: false,
        confidence: 0.9,
      }),
      matchParsedLineToCanonical({
        rawText: "eggs",
        lineType: "exact_item",
        canonicalQuery: "eggs",
        quantity: undefined,
        attributes: { size: "large", eggCount: 12, organic: false, cageFree: false },
        suggestions: [],
        needsUserChoice: false,
        confidence: 0.88,
      }),
    ];

    const result = selectBestStoreWithAlternatives(matches, getSyntheticStoreProducts());

    expect(result.winner.retailerKey).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001");
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});
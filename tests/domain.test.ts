import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_STORE_SCORING_CONFIG } from "../src/config/storeScoringConfig";
import { generateClarificationQuestions } from "../src/generateClarificationQuestions";
import { createCanonicalMatcher } from "../src/matchParsedLineToCanonical";
import { selectBestStore, selectBestStoreWithAlternatives } from "../src/selectBestStore";
import { getSyntheticCanonicalItems, getSyntheticStoreProducts } from "../src/services/syntheticCatalogService";

const ORIGINAL_WEIGHTS = { ...DEFAULT_STORE_SCORING_CONFIG.weights };

afterEach(() => {
  DEFAULT_STORE_SCORING_CONFIG.weights.coverage = ORIGINAL_WEIGHTS.coverage;
  DEFAULT_STORE_SCORING_CONFIG.weights.matchConfidence = ORIGINAL_WEIGHTS.matchConfidence;
  DEFAULT_STORE_SCORING_CONFIG.weights.price = ORIGINAL_WEIGHTS.price;
  DEFAULT_STORE_SCORING_CONFIG.weights.eta = ORIGINAL_WEIGHTS.eta;
  DEFAULT_STORE_SCORING_CONFIG.weights.substitutionRisk = ORIGINAL_WEIGHTS.substitutionRisk;
});

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

  it("uses the scoring config weights at runtime", () => {
    const matches = [
      {
        canonicalItemId: "milk",
        resolvedName: "Milk",
        matchConfidence: 0.95,
        usedDefault: false,
        lowConfidence: false,
        needsClarification: false,
        clarificationSuggestions: [],
        requestedAttributes: {},
      },
    ];
    const storeProducts = [
      {
        store_id: "store-cheap-missing-eta",
        retailerKey: "store-cheap-missing-eta",
        canonical_item_id: "milk",
        price_cents: 100,
        availability_status: "in_stock",
        in_stock: true,
      },
      {
        store_id: "store-known-eta",
        retailerKey: "store-known-eta",
        canonical_item_id: "milk",
        price_cents: 130,
        availability_status: "in_stock",
        in_stock: true,
        eta_min: 20,
      },
    ];

    const baselineWinner = selectBestStore(matches as any, storeProducts as any);
    DEFAULT_STORE_SCORING_CONFIG.weights.price = 0;
    DEFAULT_STORE_SCORING_CONFIG.weights.eta = 1;
    const etaWeightedWinner = selectBestStore(matches as any, storeProducts as any);

    expect(baselineWinner.retailerKey).toBe("store-cheap-missing-eta");
    expect(etaWeightedWinner.retailerKey).toBe("store-known-eta");
  });

  it("does not surface missing ETA as 0", () => {
    const matches = [
      {
        canonicalItemId: "milk",
        resolvedName: "Milk",
        matchConfidence: 0.95,
        usedDefault: false,
        lowConfidence: false,
        needsClarification: false,
        clarificationSuggestions: [],
        requestedAttributes: {},
      },
    ];
    const result = selectBestStore(matches as any, [
      {
        store_id: "store-missing-eta",
        retailerKey: "store-missing-eta",
        canonical_item_id: "milk",
        price_cents: 100,
        availability_status: "in_stock",
        in_stock: true,
      },
    ] as any);

    expect(result.etaMin).toBeNull();
    expect(result.reason).toContain("unknown ETA");
  });

  it("penalizes stores with missing ETA when competing against known ETA", () => {
    const matches = [
      {
        canonicalItemId: "milk",
        resolvedName: "Milk",
        matchConfidence: 0.95,
        usedDefault: false,
        lowConfidence: false,
        needsClarification: false,
        clarificationSuggestions: [],
        requestedAttributes: {},
      },
    ];
    const result = selectBestStoreWithAlternatives(matches as any, [
      {
        store_id: "store-missing-eta",
        retailerKey: "store-missing-eta",
        canonical_item_id: "milk",
        price_cents: 100,
        availability_status: "in_stock",
        in_stock: true,
      },
      {
        store_id: "store-known-eta",
        retailerKey: "store-known-eta",
        canonical_item_id: "milk",
        price_cents: 100,
        availability_status: "in_stock",
        in_stock: true,
        eta_min: 15,
      },
    ] as any);

    expect(result.winner.retailerKey).toBe("store-known-eta");
    expect(result.alternatives[0].retailerKey).toBe("store-missing-eta");
    expect(result.alternatives[0].etaMin).toBeNull();
  });
});
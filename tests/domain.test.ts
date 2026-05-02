import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STORE_SCORING_CONFIG } from "../src/config/storeScoringConfig";
import { generateClarificationQuestions } from "../src/generateClarificationQuestions";
import { createCanonicalMatcher } from "../src/matchParsedLineToCanonical";
import { selectBestStore, selectBestStoreWithAlternatives } from "../src/selectBestStore";
import type { CanonicalCatalogProvider, StoreInventoryProvider } from "../src/services/catalogProvider";
import { OptimizeServiceError } from "../src/services/optimizeServiceError";
import { optimizeShopping, DEFAULT_CATALOG_PROVIDERS, getDefaultCatalogProviders } from "../src/services/optimizeService";
import { seedCompatibleSyntheticStoreInventoryProvider } from "../src/services/seedInventoryBridge";
import { seedCanonicalCatalogProvider } from "../src/services/seedCatalogProvider";
import { syntheticCanonicalCatalogProvider, syntheticStoreInventoryProvider } from "../src/services/syntheticCatalogProvider";
import { getSyntheticCanonicalItems, getSyntheticStoreProducts } from "../src/services/syntheticCatalogService";

const ORIGINAL_WEIGHTS = { ...DEFAULT_STORE_SCORING_CONFIG.weights };
const ORIGINAL_SUBSTITUTION_RISK_BLEND = { ...DEFAULT_STORE_SCORING_CONFIG.substitutionRiskBlend };
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  DEFAULT_STORE_SCORING_CONFIG.weights.coverage = ORIGINAL_WEIGHTS.coverage;
  DEFAULT_STORE_SCORING_CONFIG.weights.matchConfidence = ORIGINAL_WEIGHTS.matchConfidence;
  DEFAULT_STORE_SCORING_CONFIG.weights.price = ORIGINAL_WEIGHTS.price;
  DEFAULT_STORE_SCORING_CONFIG.weights.eta = ORIGINAL_WEIGHTS.eta;
  DEFAULT_STORE_SCORING_CONFIG.weights.substitutionRisk = ORIGINAL_WEIGHTS.substitutionRisk;
  DEFAULT_STORE_SCORING_CONFIG.substitutionRiskBlend.baseRisk = ORIGINAL_SUBSTITUTION_RISK_BLEND.baseRisk;
  DEFAULT_STORE_SCORING_CONFIG.substitutionRiskBlend.attributeMismatchRisk = ORIGINAL_SUBSTITUTION_RISK_BLEND.attributeMismatchRisk;
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
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

  it("uses the configured substitution-risk blend at runtime", () => {
    const matches = [
      {
        canonicalItemId: "milk",
        resolvedName: "Milk",
        matchConfidence: 0.4,
        usedDefault: true,
        lowConfidence: true,
        needsClarification: false,
        clarificationSuggestions: [],
        requestedAttributes: { organic: true },
      },
    ];
    const storeProducts = [
      {
        store_id: "exact-match-expensive-store",
        retailerKey: "exact-match-expensive-store",
        canonical_item_id: "milk",
        price_cents: 130,
        availability_status: "in_stock",
        in_stock: true,
        eta_min: 10,
        attributes_json: { organic: true },
      },
      {
        store_id: "attribute-mismatch-cheap-store",
        retailerKey: "attribute-mismatch-cheap-store",
        canonical_item_id: "milk",
        price_cents: 100,
        availability_status: "in_stock",
        in_stock: true,
        eta_min: 10,
        attributes_json: { organic: false },
      },
    ];

    DEFAULT_STORE_SCORING_CONFIG.weights.coverage = 0;
    DEFAULT_STORE_SCORING_CONFIG.weights.matchConfidence = 0;
    DEFAULT_STORE_SCORING_CONFIG.weights.price = 1;
    DEFAULT_STORE_SCORING_CONFIG.weights.eta = 0;
    DEFAULT_STORE_SCORING_CONFIG.weights.substitutionRisk = 1;

    DEFAULT_STORE_SCORING_CONFIG.substitutionRiskBlend.baseRisk = 1;
    DEFAULT_STORE_SCORING_CONFIG.substitutionRiskBlend.attributeMismatchRisk = 0;
    const baseRiskWeightedWinner = selectBestStore(matches as any, storeProducts as any);

    DEFAULT_STORE_SCORING_CONFIG.substitutionRiskBlend.baseRisk = 0;
    DEFAULT_STORE_SCORING_CONFIG.substitutionRiskBlend.attributeMismatchRisk = 1;
    const attributeMismatchWeightedWinner = selectBestStore(matches as any, storeProducts as any);

    expect(baseRiskWeightedWinner.retailerKey).toBe("attribute-mismatch-cheap-store");
    expect(attributeMismatchWeightedWinner.retailerKey).toBe("exact-match-expensive-store");
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

  it("matches exact attribute keys without normalization side effects", () => {
    const result = selectBestStore(
      [
        {
          canonicalItemId: "milk",
          resolvedName: "Milk",
          matchConfidence: 0.95,
          usedDefault: false,
          lowConfidence: false,
          needsClarification: false,
          clarificationSuggestions: [],
          requestedAttributes: { organic: true },
        },
      ] as any,
      [
        {
          store_id: "exact-organic",
          retailerKey: "exact-organic",
          canonical_item_id: "milk",
          price_cents: 100,
          availability_status: "in_stock",
          in_stock: true,
          eta_min: 10,
          attributes_json: { organic: true },
        },
        {
          store_id: "mismatch",
          retailerKey: "mismatch",
          canonical_item_id: "milk",
          price_cents: 100,
          availability_status: "in_stock",
          in_stock: true,
          eta_min: 10,
          attributes_json: { organic: false },
        },
      ] as any
    );

    expect(result.retailerKey).toBe("exact-organic");
  });

  it("matches configured alias keys across store attributes", () => {
    const result = selectBestStore(
      [
        {
          canonicalItemId: "milk",
          resolvedName: "Milk",
          matchConfidence: 0.95,
          usedDefault: false,
          lowConfidence: false,
          needsClarification: false,
          clarificationSuggestions: [],
          requestedAttributes: { organic: true },
        },
      ] as any,
      [
        {
          store_id: "bio-store",
          retailerKey: "bio-store",
          canonical_item_id: "milk",
          price_cents: 100,
          availability_status: "in_stock",
          in_stock: true,
          eta_min: 10,
          attributes_json: { bio: true },
        },
        {
          store_id: "organic-false-store",
          retailerKey: "organic-false-store",
          canonical_item_id: "milk",
          price_cents: 100,
          availability_status: "in_stock",
          in_stock: true,
          eta_min: 10,
          attributes_json: { organic: false },
        },
      ] as any
    );

    expect(result.retailerKey).toBe("bio-store");
  });

  it("does not match unknown aliases", () => {
    const result = selectBestStore(
      [
        {
          canonicalItemId: "milk",
          resolvedName: "Milk",
          matchConfidence: 0.95,
          usedDefault: false,
          lowConfidence: false,
          needsClarification: false,
          clarificationSuggestions: [],
          requestedAttributes: { organic: true },
        },
      ] as any,
      [
        {
          store_id: "unknown-alias",
          retailerKey: "unknown-alias",
          canonical_item_id: "milk",
          price_cents: 100,
          availability_status: "in_stock",
          in_stock: true,
          eta_min: 10,
          attributes_json: { organics: true },
        },
        {
          store_id: "known-organic",
          retailerKey: "known-organic",
          canonical_item_id: "milk",
          price_cents: 100,
          availability_status: "in_stock",
          in_stock: true,
          eta_min: 10,
          attributes_json: { organic: true },
        },
      ] as any
    );

    expect(result.retailerKey).toBe("known-organic");
  });

  it("does not treat natural as organic", () => {
    const result = selectBestStore(
      [
        {
          canonicalItemId: "milk",
          resolvedName: "Milk",
          matchConfidence: 0.95,
          usedDefault: false,
          lowConfidence: false,
          needsClarification: false,
          clarificationSuggestions: [],
          requestedAttributes: { organic: true },
        },
      ] as any,
      [
        {
          store_id: "natural-store",
          retailerKey: "natural-store",
          canonical_item_id: "milk",
          price_cents: 100,
          availability_status: "in_stock",
          in_stock: true,
          eta_min: 10,
          attributes_json: { natural: true },
        },
        {
          store_id: "bio-store",
          retailerKey: "bio-store",
          canonical_item_id: "milk",
          price_cents: 100,
          availability_status: "in_stock",
          in_stock: true,
          eta_min: 10,
          attributes_json: { bio: true },
        },
      ] as any
    );

    expect(result.retailerKey).toBe("bio-store");
  });

  it("does not break existing canonical item behavior", () => {
    const matchParsedLineToCanonical = createCanonicalMatcher(getSyntheticCanonicalItems());
    const cases = [
      { rawText: "2% milk", canonicalQuery: "milk", attributes: { fat: "2%", lactoseFree: false, organic: false } },
      { rawText: "eggs", canonicalQuery: "eggs", attributes: { size: "large", eggCount: 12, organic: false, cageFree: false } },
      { rawText: "banana", canonicalQuery: "banana", attributes: { ripeness: "yellow", organic: false } },
      { rawText: "chicken breast", canonicalQuery: "chicken", attributes: { cut: "breast", organic: false, boneless: true, skinless: true } },
      { rawText: "white rice", canonicalQuery: "rice", attributes: { type: "white", organic: false } },
    ];

    const results = cases.map((item) =>
      matchParsedLineToCanonical({
        rawText: item.rawText,
        lineType: "exact_item",
        canonicalQuery: item.canonicalQuery,
        quantity: undefined,
        attributes: item.attributes,
        suggestions: [],
        needsUserChoice: false,
        confidence: 0.9,
      })
    );

    expect(results.every((result) => result.matchConfidence > 0.6)).toBe(true);
  });

  it("synthetic canonical catalog provider returns canonical items", async () => {
    const items = await syntheticCanonicalCatalogProvider.getCanonicalItems();

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        display_name: expect.any(String),
        category: expect.any(String),
        attribute_schema_json: expect.any(Object),
      })
    );
  });

  it("synthetic store inventory provider returns store products", async () => {
    const products = await syntheticStoreInventoryProvider.getStoreProducts();

    expect(products.length).toBeGreaterThan(0);
    expect(products[0]).toEqual(
      expect.objectContaining({
        store_id: expect.any(String),
        canonical_item_id: expect.any(String),
        price_cents: expect.any(Number),
      })
    );
  });

  it("optimizeService works through the default synthetic providers", async () => {
    const canonicalSpy = vi.spyOn(DEFAULT_CATALOG_PROVIDERS.canonicalCatalogProvider, "getCanonicalItems");
    const inventorySpy = vi.spyOn(DEFAULT_CATALOG_PROVIDERS.storeInventoryProvider, "getStoreProducts");

    const result = await optimizeShopping("2% milk\neggs");

    expect(canonicalSpy).toHaveBeenCalledTimes(1);
    expect(inventorySpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
        winner: expect.any(Object),
        alternatives: expect.any(Array),
        clarifications: expect.any(Array),
      })
    );

    canonicalSpy.mockRestore();
    inventorySpy.mockRestore();
  });

  it("uses synthetic providers when MAPLECARD_CATALOG_SOURCE=synthetic", async () => {
    process.env.MAPLECARD_CATALOG_SOURCE = "synthetic";
    const canonicalSpy = vi.spyOn(syntheticCanonicalCatalogProvider, "getCanonicalItems");
    const inventorySpy = vi.spyOn(syntheticStoreInventoryProvider, "getStoreProducts");

    const result = await optimizeShopping("milk");

    expect(result.items).toHaveLength(1);
    expect(canonicalSpy).toHaveBeenCalledTimes(1);
    expect(inventorySpy).toHaveBeenCalledTimes(1);
  });

  it("uses the seed provider and bridged inventory when MAPLECARD_CATALOG_SOURCE=seed_bridge", async () => {
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";
    const canonicalSpy = vi.spyOn(seedCanonicalCatalogProvider, "getCanonicalItems");
    const inventorySpy = vi.spyOn(seedCompatibleSyntheticStoreInventoryProvider, "getStoreProducts");

    const result = await optimizeShopping("milk\neggs\nbanana\nchicken\nrice");

    expect(result.items).toHaveLength(5);
    expect(canonicalSpy).toHaveBeenCalledTimes(1);
    expect(inventorySpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to synthetic providers when MAPLECARD_CATALOG_SOURCE is invalid", async () => {
    process.env.MAPLECARD_CATALOG_SOURCE = "invalid_source";
    const canonicalSpy = vi.spyOn(syntheticCanonicalCatalogProvider, "getCanonicalItems");
    const inventorySpy = vi.spyOn(syntheticStoreInventoryProvider, "getStoreProducts");

    const resolvedProviders = getDefaultCatalogProviders();
    const result = await optimizeShopping("milk");

    expect(resolvedProviders).toBe(DEFAULT_CATALOG_PROVIDERS);
    expect(result.items).toHaveLength(1);
    expect(canonicalSpy).toHaveBeenCalledTimes(1);
    expect(inventorySpy).toHaveBeenCalledTimes(1);
  });

  it("optimizeService can run against injected providers instead of raw synthetic service calls", async () => {
    const canonicalCatalogProvider: CanonicalCatalogProvider = {
      getCanonicalItems: vi.fn(async () => [getSyntheticCanonicalItems()[0]]),
    };
    const storeInventoryProvider: StoreInventoryProvider = {
      getStoreProducts: vi.fn(async () =>
        getSyntheticStoreProducts().filter((product) => product.canonical_item_id === getSyntheticCanonicalItems()[0].id)
      ),
    };

    const result = await optimizeShopping("milk", {
      canonicalCatalogProvider,
      storeInventoryProvider,
    });

    expect(canonicalCatalogProvider.getCanonicalItems).toHaveBeenCalledTimes(1);
    expect(storeInventoryProvider.getStoreProducts).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.winner.retailerKey).toBeTruthy();
    expect(Object.keys(result)).toEqual(["items", "winner", "alternatives", "clarifications"]);
  });

  it("surfaces a controlled error when the catalog provider rejects", async () => {
    const providers = {
      canonicalCatalogProvider: {
        getCanonicalItems: vi.fn(async () => {
          throw new Error("catalog secret");
        }),
      },
      storeInventoryProvider: syntheticStoreInventoryProvider,
    };

    await expect(optimizeShopping("milk", providers)).rejects.toMatchObject<Partial<OptimizeServiceError>>({
      code: "catalog_provider_failed",
      statusCode: 503,
      message: "Catalog provider is currently unavailable.",
    });
  });

  it("surfaces a controlled error when the inventory provider rejects", async () => {
    const providers = {
      canonicalCatalogProvider: syntheticCanonicalCatalogProvider,
      storeInventoryProvider: {
        getStoreProducts: vi.fn(async () => {
          throw new Error("inventory secret");
        }),
      },
    };

    await expect(optimizeShopping("milk", providers)).rejects.toMatchObject<Partial<OptimizeServiceError>>({
      code: "inventory_provider_failed",
      statusCode: 503,
      message: "Store inventory provider is currently unavailable.",
    });
  });

  it("surfaces a controlled error when the catalog provider returns no items", async () => {
    const providers = {
      canonicalCatalogProvider: {
        getCanonicalItems: vi.fn(async () => []),
      },
      storeInventoryProvider: syntheticStoreInventoryProvider,
    };

    await expect(optimizeShopping("milk", providers)).rejects.toMatchObject<Partial<OptimizeServiceError>>({
      code: "empty_canonical_catalog",
      statusCode: 503,
    });
  });

  it("surfaces a controlled error when the inventory provider returns no products", async () => {
    const providers = {
      canonicalCatalogProvider: syntheticCanonicalCatalogProvider,
      storeInventoryProvider: {
        getStoreProducts: vi.fn(async () => []),
      },
    };

    await expect(optimizeShopping("milk", providers)).rejects.toMatchObject<Partial<OptimizeServiceError>>({
      code: "empty_store_inventory",
      statusCode: 503,
    });
  });

  it("surfaces a controlled error for invalid canonical item payloads", async () => {
    const providers = {
      canonicalCatalogProvider: {
        getCanonicalItems: vi.fn(async () => [
          {
            id: "bad-item",
            display_name: "Bad Item",
          },
        ]),
      },
      storeInventoryProvider: syntheticStoreInventoryProvider,
    };

    await expect(optimizeShopping("milk", providers)).rejects.toMatchObject<Partial<OptimizeServiceError>>({
      code: "invalid_canonical_catalog",
      statusCode: 502,
    });
  });

  it("surfaces a controlled error for invalid store product payloads", async () => {
    const providers = {
      canonicalCatalogProvider: syntheticCanonicalCatalogProvider,
      storeInventoryProvider: {
        getStoreProducts: vi.fn(async () => [
          {
            store_id: "bad-store",
            canonical_item_id: getSyntheticCanonicalItems()[0].id,
            price_cents: 100,
          },
        ]),
      },
    };

    await expect(optimizeShopping("milk", providers)).rejects.toMatchObject<Partial<OptimizeServiceError>>({
      code: "invalid_store_inventory",
      statusCode: 502,
    });
  });
});
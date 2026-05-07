import { describe, expect, it } from "vitest";
import { mapKrogerProductToCandidate, mapKrogerProductsToCandidates } from "../src/providers/kroger/krogerMapper";
import type { KrogerProductSearchResult } from "../src/providers/kroger/krogerClient";

function createProduct(overrides: Partial<KrogerProductSearchResult> = {}): KrogerProductSearchResult {
  return {
    productId: "0001111041700",
    description: "Whole Milk",
    brand: "Kroger",
    items: [
      {
        itemId: "001",
        upc: "0001111041700",
        price: { regular: 3.99, promo: 3.49 },
        inventory: { stockLevel: "HIGH" },
        fulfillment: [{ type: "pickup", availability: "AVAILABLE" }, { type: "delivery", availability: "AVAILABLE" }],
      },
    ],
    raw: {
      productId: "0001111041700",
    },
    ...overrides,
  };
}

describe("kroger mapper", () => {
  it("maps Kroger product data into a real-store candidate", () => {
    expect(mapKrogerProductToCandidate(createProduct(), "01400943")).toEqual({
      provider: "kroger",
      locationId: "01400943",
      productId: "0001111041700",
      upc: "0001111041700",
      description: "Whole Milk",
      brand: "Kroger",
      priceCents: 349,
      currency: "USD",
      available: true,
      fulfillment: ["pickup", "delivery"],
      rawProvider: "kroger",
    });
  });

  it("falls back to unknown availability and omits optional fields when product details are sparse", () => {
    const candidate = mapKrogerProductToCandidate(
      createProduct({
        description: undefined,
        brand: undefined,
        items: [{ itemId: "001" }],
      }),
      "01400943"
    );

    expect(candidate).toEqual({
      provider: "kroger",
      locationId: "01400943",
      productId: "0001111041700",
      upc: "001",
      description: "0001111041700",
      currency: "USD",
      available: "unknown",
      rawProvider: "kroger",
    });
    expect(candidate).not.toHaveProperty("priceCents");
  });

  it("caps mapped candidates when a max is provided", () => {
    const products = [createProduct(), createProduct({ productId: "2", raw: { productId: "2" } })];

    expect(mapKrogerProductsToCandidates(products, "01400943", 1)).toHaveLength(1);
  });
});
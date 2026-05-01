import { describe, expect, it } from "vitest";
import { optimizeShopping } from "../src/services/optimizeService";
import { getSeedCompatibleSyntheticStoreProducts, seedCompatibleSyntheticStoreInventoryProvider } from "../src/services/seedInventoryBridge";
import { seedCanonicalCatalogProvider } from "../src/services/seedCatalogProvider";
import { syntheticStoreInventoryProvider } from "../src/services/syntheticCatalogProvider";

describe("seed inventory bridge", () => {
  it("projects mapped synthetic inventory into seed canonical ids only", async () => {
    const bridged = await seedCompatibleSyntheticStoreInventoryProvider.getStoreProducts();

    expect(bridged.length).toBeGreaterThan(0);
    expect(new Set(bridged.map((product) => product.canonical_item_id)).size).toBe(5);
    expect(bridged.every((product) => String(product.canonical_item_id).startsWith("seed-"))).toBe(true);
  });

  it("does not create fake inventory coverage for unmapped seed items", async () => {
    const bridged = await seedCompatibleSyntheticStoreInventoryProvider.getStoreProducts();
    const applesInventory = bridged.filter((product) => product.canonical_item_id === "seed-produce-002");

    expect(applesInventory).toEqual([]);
  });

  it("allows optimizeService to run with seed provider and bridged inventory for mapped core items", async () => {
    const result = await optimizeShopping("milk\neggs\nbanana\nchicken\nrice", {
      canonicalCatalogProvider: seedCanonicalCatalogProvider,
      storeInventoryProvider: seedCompatibleSyntheticStoreInventoryProvider,
    });

    expect(Object.keys(result)).toEqual(["items", "winner", "alternatives", "clarifications"]);
    expect(result.items).toHaveLength(5);
    expect(result.winner.retailerKey).toBeTruthy();
  });

  it("keeps the default synthetic runtime path working", async () => {
    const result = await optimizeShopping("milk\neggs");

    expect(Object.keys(result)).toEqual(["items", "winner", "alternatives", "clarifications"]);
  });

  it("only remaps mapped core items from synthetic inventory", async () => {
    const products = await syntheticStoreInventoryProvider.getStoreProducts();
    const bridged = getSeedCompatibleSyntheticStoreProducts(products);

    expect(bridged).toHaveLength(products.length);
    expect(bridged.some((product) => product.canonical_item_id === "seed-dairy-001")).toBe(true);
    expect(bridged.some((product) => product.canonical_item_id === "seed-eggs-001")).toBe(true);
    expect(bridged.some((product) => product.canonical_item_id === "seed-produce-001")).toBe(true);
    expect(bridged.some((product) => product.canonical_item_id === "seed-meat-001")).toBe(true);
    expect(bridged.some((product) => product.canonical_item_id === "seed-pantry-001")).toBe(true);
  });
});
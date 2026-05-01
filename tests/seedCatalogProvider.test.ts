import { describe, expect, it } from "vitest";
import { validateCanonicalItems } from "../src/services/providerValidation";
import { optimizeShopping } from "../src/services/optimizeService";
import { seedCanonicalCatalogProvider, getSeedCanonicalItems } from "../src/services/seedCatalogProvider";
import { syntheticStoreInventoryProvider } from "../src/services/syntheticCatalogProvider";

describe("seed catalog provider adapter", () => {
  it("adapts seed schema records into runtime canonical items", async () => {
    const items = await seedCanonicalCatalogProvider.getCanonicalItems();
    const milk = items.find((item) => item.slug === "milk");
    const eggs = items.find((item) => item.slug === "eggs");
    const bananas = items.find((item) => item.slug === "bananas");
    const chicken = items.find((item) => item.slug === "chicken-breast");
    const rice = items.find((item) => item.slug === "rice");

    expect(milk).toEqual(
      expect.objectContaining({
        id: "seed-dairy-001",
        slug: "milk",
        display_name: "Milk",
        category: "dairy",
      })
    );
    expect(eggs?.slug).toBe("eggs");
    expect(bananas?.slug).toBe("bananas");
    expect(chicken?.slug).toBe("chicken-breast");
    expect(rice?.slug).toBe("rice");
  });

  it("produces provider-valid canonical items", async () => {
    const items = await seedCanonicalCatalogProvider.getCanonicalItems();
    const validation = validateCanonicalItems(items);

    expect(validation.invalidCount).toBe(0);
    expect(validation.validItems).toHaveLength(items.length);
  });

  it("keeps adapted ids and slugs unique and stable", () => {
    const items = getSeedCanonicalItems();
    const ids = items.map((item) => item.id);
    const slugs = items.map((item) => item.slug);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(items.find((item) => item.slug === "milk")?.id).toBe("seed-dairy-001");
  });

  it("leaves optimize response shape unchanged on the synthetic default path", async () => {
    const result = await optimizeShopping("milk\neggs");

    expect(Object.keys(result)).toEqual(["items", "winner", "alternatives", "clarifications"]);
  });

  it("can be consumed through the canonical provider interface while synthetic inventory remains separate", async () => {
    const canonicalItems = await seedCanonicalCatalogProvider.getCanonicalItems();
    const storeProducts = await syntheticStoreInventoryProvider.getStoreProducts();

    expect(canonicalItems.length).toBeGreaterThan(0);
    expect(storeProducts.length).toBeGreaterThan(0);
    expect(canonicalItems.some((item) => item.slug === "milk")).toBe(true);
  });
});
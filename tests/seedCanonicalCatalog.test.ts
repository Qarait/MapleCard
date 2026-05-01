import { describe, expect, it } from "vitest";
import { findUnsafeAliasCollisions, validateCatalogSchemaRecord } from "../src/catalog/catalogSchema";
import { getSeedCanonicalCatalog } from "../src/catalog/seedCanonicalCatalog";

describe("seed canonical catalog", () => {
  it("contains 50 to 100 MapleCard-owned grocery concepts", () => {
    const seed = getSeedCanonicalCatalog();

    expect(seed.length).toBeGreaterThanOrEqual(50);
    expect(seed.length).toBeLessThanOrEqual(100);
  });

  it("validates every seed record against the catalog schema", () => {
    const results = getSeedCanonicalCatalog().map((record) => validateCatalogSchemaRecord(record));

    expect(results.every((result) => result.isValid)).toBe(true);
    expect(results.flatMap((result) => result.errors)).toEqual([]);
  });

  it("keeps ids and slugs unique", () => {
    const seed = getSeedCanonicalCatalog();
    const ids = seed.map((item) => item.id);
    const slugs = seed.map((item) => item.slug);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("avoids dangerous alias collisions", () => {
    expect(findUnsafeAliasCollisions(getSeedCanonicalCatalog())).toEqual([]);
  });

  it("has a quantity policy for every seed item", () => {
    expect(getSeedCanonicalCatalog().every((record) => record.quantityPolicy != null)).toBe(true);
  });

  it("covers the expected common grocery categories", () => {
    const categories = new Set(getSeedCanonicalCatalog().map((record) => record.category));

    expect(categories).toEqual(
      new Set([
        "dairy",
        "eggs",
        "produce",
        "meat",
        "seafood",
        "pantry",
        "bakery",
        "frozen",
        "beverages",
        "household-basics",
      ])
    );
  });

  it("keeps milk volume-based while leaving bare-number milk ambiguous", () => {
    const milk = getSeedCanonicalCatalog().find((record) => record.slug === "milk");

    expect(milk?.quantityPolicy.kind).toBe("volume_based_item");
    expect(milk?.quantityPolicy.bareNumberInterpretation).toBe("ambiguous");
  });

  it("keeps eggs and bananas countable", () => {
    const seed = getSeedCanonicalCatalog();
    const eggs = seed.find((record) => record.slug === "eggs");
    const bananas = seed.find((record) => record.slug === "bananas");

    expect(eggs?.quantityPolicy.kind).toBe("countable_item");
    expect(bananas?.quantityPolicy.kind).toBe("countable_item");
  });

  it("keeps chicken breast and rice ambiguous where appropriate", () => {
    const seed = getSeedCanonicalCatalog();
    const chicken = seed.find((record) => record.slug === "chicken-breast");
    const rice = seed.find((record) => record.slug === "rice");

    expect(chicken?.quantityPolicy.kind).toBe("ambiguous_bare_number_item");
    expect(rice?.quantityPolicy.kind).toBe("ambiguous_bare_number_item");
  });
});
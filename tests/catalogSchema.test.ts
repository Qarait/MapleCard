import { describe, expect, it } from "vitest";
import {
  findUnsafeAliasCollisions,
  toCatalogSchemaRecord,
  validateCatalogSchemaRecord,
  validateQuantityPolicy,
} from "../src/catalog/catalogSchema";
import type { CanonicalItem } from "../src/matchParsedLineToCanonical";
import { getSyntheticCatalogSchemaRecords, getSyntheticCanonicalItems } from "../src/services/syntheticCatalogService";

describe("catalog schema readiness", () => {
  it("accepts a valid synthetic catalog schema record", () => {
    const record = toCatalogSchemaRecord(getSyntheticCanonicalItems()[0]);

    const result = validateCatalogSchemaRecord(record);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a missing canonical item id", () => {
    const invalidItem: CanonicalItem = {
      ...getSyntheticCanonicalItems()[0],
      id: "",
    };

    const result = validateCatalogSchemaRecord(toCatalogSchemaRecord(invalidItem));

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Canonical item id is required.");
  });

  it("rejects an invalid attribute option definition", () => {
    const record = toCatalogSchemaRecord(getSyntheticCanonicalItems()[0]);
    record.attributeDefinitions[0].options = [];

    const result = validateCatalogSchemaRecord(record);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(`Attribute definition '${record.attributeDefinitions[0].key}' must define at least one option.`);
  });

  it("models the expected quantity policy examples", () => {
    const records = getSyntheticCatalogSchemaRecords();
    const bySlug = new Map(records.map((record) => [record.slug, record]));

    expect(bySlug.get("eggs")?.quantityPolicy.kind).toBe("countable_item");
    expect(bySlug.get("banana")?.quantityPolicy.kind).toBe("countable_item");
    expect(bySlug.get("milk")?.quantityPolicy.kind).toBe("volume_based_item");
    expect(bySlug.get("milk")?.quantityPolicy.bareNumberInterpretation).toBe("ambiguous");
    expect(bySlug.get("chicken")?.quantityPolicy.kind).toBe("ambiguous_bare_number_item");
    expect(bySlug.get("rice")?.quantityPolicy.kind).toBe("ambiguous_bare_number_item");
  });

  it("keeps bare-number milk ambiguous even though milk is volume-based", () => {
    const milk = getSyntheticCatalogSchemaRecords().find((record) => record.slug === "milk");

    expect(milk?.quantityPolicy.kind).toBe("volume_based_item");
    expect(milk?.quantityPolicy.bareNumberInterpretation).toBe("ambiguous");
    expect(milk?.quantityPolicy.bareNumberInterpretation).not.toBe("volume");
  });

  it("detects unsafe alias collisions", () => {
    const [first, second] = getSyntheticCatalogSchemaRecords();
    second.aliases = [...second.aliases, first.aliases[0]];

    const errors = findUnsafeAliasCollisions([first, second]);

    expect(errors).toContain(`Alias '${first.aliases[0].toLowerCase()}' collides across canonical items.`);
  });

  it("rejects an invalid quantity policy", () => {
    const errors = validateQuantityPolicy({
      kind: "countable_item",
      defaultUnit: "item",
      bareNumberInterpretation: "count",
    });

    expect(errors).toEqual([]);

    const invalidErrors = validateQuantityPolicy({
      kind: "ambiguous_bare_number_item",
      allowedUnits: [],
      bareNumberInterpretation: "ambiguous",
    });

    expect(invalidErrors).toContain("Ambiguous bare-number items must declare allowed units.");
  });

  it("proves the synthetic canonical catalog validates against schema expectations", () => {
    const results = getSyntheticCatalogSchemaRecords().map((record) => validateCatalogSchemaRecord(record));

    expect(results.every((result) => result.isValid)).toBe(true);
    expect(findUnsafeAliasCollisions(getSyntheticCatalogSchemaRecords())).toEqual([]);
  });
});
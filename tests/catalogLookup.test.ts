import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRIDGE_CLARIFICATION_OPTION_LIMIT,
  extractClarificationOptionsFromTemplates,
  getQuantityPolicyForAlias,
  getQuantityPolicyForSlug,
  lookupSeedCatalogByAlias,
  lookupSeedCatalogById,
  lookupSeedCatalogBySlug,
  normalizeCatalogLookupText,
} from "../src/catalog/catalogLookup";

describe("catalog lookup", () => {
  it("looks up seed records by canonical id", () => {
    const record = lookupSeedCatalogById("seed-bakery-001");

    expect(record?.slug).toBe("bread");
  });

  it("looks up seed records by slug", () => {
    const record = lookupSeedCatalogBySlug("bread");

    expect(record?.display_name).toBe("Bread");
  });

  it("looks up seed records by alias", () => {
    const record = lookupSeedCatalogByAlias("Greek Yogurt");

    expect(record?.slug).toBe("greek-yogurt");
  });

  it("keeps generic yogurt lookup generic", () => {
    const record = lookupSeedCatalogByAlias("yogurt");

    expect(record?.slug).toBe("yogurt");
  });

  it("does not match unknown aliases", () => {
    expect(lookupSeedCatalogByAlias("mystery pantry orb")).toBeNull();
  });

  it("normalizes user text safely for exact lookup", () => {
    expect(normalizeCatalogLookupText("  Greek-Yogurt!! ")).toBe("greek yogurt");
  });

  it("returns quantity policies by slug and alias", () => {
    expect(getQuantityPolicyForSlug("bread")?.kind).toBe("countable_item");
    expect(getQuantityPolicyForAlias("yogurt")?.kind).toBe("ambiguous_bare_number_item");
  });

  it("returns an empty list when no clarification templates exist", () => {
    expect(extractClarificationOptionsFromTemplates([])).toEqual([]);
  });

  it("de-duplicates clarification options while preserving template order", () => {
    const options = extractClarificationOptionsFromTemplates([
      { options: ["ground", "whole-bean", "ground"] },
      { options: ["medium", "dark", "whole-bean"] },
    ]);

    expect(options).toEqual(["ground", "whole-bean", "medium", "dark"]);
  });

  it("enforces the clarification option limit", () => {
    const options = extractClarificationOptionsFromTemplates([
      { options: ["one", "two", "three", "four"] },
      { options: ["five", "six", "seven", "eight"] },
    ]);

    expect(options).toHaveLength(DEFAULT_BRIDGE_CLARIFICATION_OPTION_LIMIT);
    expect(options).toEqual(["one", "two", "three", "four", "five", "six"]);
  });
});

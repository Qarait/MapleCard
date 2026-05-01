import { describe, expect, it } from "vitest";
import {
  CORE_CATALOG_ID_MAPPINGS,
  mapSeedIdToSyntheticId,
  mapSeedSlugToSyntheticSlug,
  mapSyntheticIdToSeedId,
  mapSyntheticSlugToSeedSlug,
} from "../src/catalog/catalogIdMapping";

describe("catalog id mapping", () => {
  it("maps known synthetic ids to expected seed ids", () => {
    expect(mapSyntheticIdToSeedId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001")).toBe("seed-dairy-001");
    expect(mapSyntheticIdToSeedId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002")).toBe("seed-eggs-001");
    expect(mapSyntheticIdToSeedId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003")).toBe("seed-produce-001");
    expect(mapSyntheticIdToSeedId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004")).toBe("seed-meat-001");
    expect(mapSyntheticIdToSeedId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005")).toBe("seed-pantry-001");
  });

  it("maps known seed ids back to synthetic ids", () => {
    expect(mapSeedIdToSyntheticId("seed-dairy-001")).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001");
    expect(mapSeedIdToSyntheticId("seed-eggs-001")).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002");
  });

  it("does not silently map unknown ids", () => {
    expect(mapSyntheticIdToSeedId("unknown-synthetic-id")).toBeNull();
    expect(mapSeedIdToSyntheticId("unknown-seed-id")).toBeNull();
  });

  it("keeps mapped slugs stable", () => {
    expect(mapSyntheticSlugToSeedSlug("milk")).toBe("milk");
    expect(mapSyntheticSlugToSeedSlug("eggs")).toBe("eggs");
    expect(mapSyntheticSlugToSeedSlug("banana")).toBe("bananas");
    expect(mapSeedSlugToSyntheticSlug("chicken-breast")).toBe("chicken");
    expect(mapSeedSlugToSyntheticSlug("rice")).toBe("rice");
  });

  it("does not collapse unrelated items", () => {
    expect(mapSyntheticSlugToSeedSlug("banana")).not.toBe("rice");
    expect(mapSyntheticIdToSeedId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004")).not.toBe("seed-pantry-001");
    expect(new Set(CORE_CATALOG_ID_MAPPINGS.map((entry) => entry.seedId)).size).toBe(CORE_CATALOG_ID_MAPPINGS.length);
  });
});
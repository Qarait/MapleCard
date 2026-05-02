import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATALOG_SOURCE, getCatalogSource } from "../src/config/catalogSourceConfig";
import { logger } from "../src/utils/logger";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("catalog source config", () => {
  it("defaults to synthetic when MAPLECARD_CATALOG_SOURCE is unset", () => {
    delete process.env.MAPLECARD_CATALOG_SOURCE;

    expect(getCatalogSource()).toBe(DEFAULT_CATALOG_SOURCE);
  });

  it("returns synthetic when explicitly configured", () => {
    process.env.MAPLECARD_CATALOG_SOURCE = "synthetic";

    expect(getCatalogSource()).toBe("synthetic");
  });

  it("returns seed_bridge when explicitly configured", () => {
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    expect(getCatalogSource()).toBe("seed_bridge");
  });

  it("falls back to synthetic and warns when the configured source is invalid", () => {
    process.env.MAPLECARD_CATALOG_SOURCE = "banana_mode";
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    expect(getCatalogSource()).toBe("synthetic");
    expect(warnSpy).toHaveBeenCalledWith(
      "[MapleCard config] MAPLECARD_CATALOG_SOURCE is invalid; using synthetic.",
      expect.objectContaining({
        providedValue: "banana_mode",
        fallbackValue: "synthetic",
      })
    );
  });
});

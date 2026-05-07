import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_KROGER_BASE_URL,
  DEFAULT_KROGER_MAX_PRODUCTS_PER_QUERY,
  DEFAULT_KROGER_PROVIDER_ENABLED,
  DEFAULT_KROGER_TIMEOUT_MS,
  DEFAULT_KROGER_TOKEN_URL,
  getKrogerConfig,
} from "../src/config/krogerConfig";
import { logger } from "../src/utils/logger";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("kroger config", () => {
  it("defaults to disabled with safe fallbacks", () => {
    delete process.env.KROGER_PROVIDER_ENABLED;
    delete process.env.KROGER_CLIENT_ID;
    delete process.env.KROGER_CLIENT_SECRET;

    expect(getKrogerConfig()).toEqual({
      providerEnabled: DEFAULT_KROGER_PROVIDER_ENABLED,
      isAvailable: false,
      unavailableReason: "disabled",
      clientId: undefined,
      clientSecret: undefined,
      defaultZipCode: undefined,
      defaultLocationId: undefined,
      baseUrl: DEFAULT_KROGER_BASE_URL,
      tokenUrl: DEFAULT_KROGER_TOKEN_URL,
      timeoutMs: DEFAULT_KROGER_TIMEOUT_MS,
      maxProductsPerQuery: DEFAULT_KROGER_MAX_PRODUCTS_PER_QUERY,
    });
  });

  it("returns unavailable when enabled without full credentials", () => {
    process.env.KROGER_PROVIDER_ENABLED = "true";
    process.env.KROGER_CLIENT_ID = "client-id";
    delete process.env.KROGER_CLIENT_SECRET;
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    expect(getKrogerConfig()).toEqual(
      expect.objectContaining({
        providerEnabled: true,
        isAvailable: false,
        unavailableReason: "missing_credentials",
        clientId: "client-id",
        clientSecret: undefined,
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[MapleCard config] Kroger provider enabled without complete credentials; provider unavailable.",
      { hasClientId: true, hasClientSecret: false }
    );
  });

  it("returns an available config when enabled with credentials", () => {
    process.env.KROGER_PROVIDER_ENABLED = "true";
    process.env.KROGER_CLIENT_ID = "client-id";
    process.env.KROGER_CLIENT_SECRET = "client-secret";
    process.env.KROGER_DEFAULT_ZIP_CODE = "45202";
    process.env.KROGER_DEFAULT_LOCATION_ID = "01400943";
    process.env.KROGER_BASE_URL = "https://example.com/base";
    process.env.KROGER_TOKEN_URL = "https://example.com/token";
    process.env.KROGER_TIMEOUT_MS = "7000";
    process.env.KROGER_MAX_PRODUCTS_PER_QUERY = "15";

    expect(getKrogerConfig()).toEqual({
      providerEnabled: true,
      isAvailable: true,
      clientId: "client-id",
      clientSecret: "client-secret",
      defaultZipCode: "45202",
      defaultLocationId: "01400943",
      baseUrl: "https://example.com/base",
      tokenUrl: "https://example.com/token",
      timeoutMs: 7000,
      maxProductsPerQuery: 15,
    });
  });

  it("falls back for invalid numeric settings and does not log the client secret", () => {
    process.env.KROGER_PROVIDER_ENABLED = "true";
    process.env.KROGER_CLIENT_ID = "client-id";
    process.env.KROGER_CLIENT_SECRET = "super-secret";
    process.env.KROGER_TIMEOUT_MS = "banana";
    process.env.KROGER_MAX_PRODUCTS_PER_QUERY = "0";
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    const config = getKrogerConfig();

    expect(config.timeoutMs).toBe(DEFAULT_KROGER_TIMEOUT_MS);
    expect(config.maxProductsPerQuery).toBe(DEFAULT_KROGER_MAX_PRODUCTS_PER_QUERY);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls.flat().join(" ")).not.toContain("super-secret");
  });
});
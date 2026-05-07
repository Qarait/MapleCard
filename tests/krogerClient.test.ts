import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKrogerClient, KrogerClientError } from "../src/providers/kroger/krogerClient";
import type { KrogerConfig } from "../src/config/krogerConfig";

function createEnabledConfig(overrides: Partial<KrogerConfig> = {}): KrogerConfig {
  return {
    providerEnabled: true,
    isAvailable: true,
    clientId: "client-id",
    clientSecret: "client-secret",
    defaultZipCode: "45202",
    defaultLocationId: "01400943",
    baseUrl: "https://api.kroger.test/v1",
    tokenUrl: "https://api.kroger.test/v1/connect/oauth2/token",
    timeoutMs: 5000,
    maxProductsPerQuery: 10,
    ...overrides,
  };
}

describe("kroger client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not call fetch when the provider is disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createKrogerClient(
      createEnabledConfig({
        providerEnabled: false,
        isAvailable: false,
        unavailableReason: "disabled",
        clientId: undefined,
        clientSecret: undefined,
      }),
      fetchMock
    );

    await expect(client.getAccessToken()).rejects.toEqual(
      expect.objectContaining<KrogerClientError>({
        name: "KrogerClientError",
        code: "kroger_provider_unavailable",
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and caches an access token until near expiry", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      } as Response);

    const client = createKrogerClient(createEnabledConfig(), fetchMock);

    await expect(client.getAccessToken()).resolves.toBe("token-123");
    await expect(client.getAccessToken()).resolves.toBe("token-123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.kroger.test/v1/connect/oauth2/token");
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          "Content-Type": "application/x-www-form-urlencoded",
        }),
        body: "grant_type=client_credentials",
      })
    );
  });

  it("searches locations by zip with a bearer token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              locationId: "01400943",
              name: "Downtown Kroger",
              chain: "Kroger",
              address: {
                addressLine1: "1 Main St",
                city: "Cincinnati",
                state: "OH",
                zipCode: "45202",
              },
            },
          ],
        }),
      } as Response);

    const client = createKrogerClient(createEnabledConfig(), fetchMock);

    await expect(client.searchLocationsByZip("45202")).resolves.toEqual([
      {
        locationId: "01400943",
        name: "Downtown Kroger",
        chain: "Kroger",
        address: {
          addressLine1: "1 Main St",
          city: "Cincinnati",
          state: "OH",
          zipCode: "45202",
        },
        raw: expect.objectContaining({ locationId: "01400943" }),
      },
    ]);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.kroger.test/v1/locations?filter.zipCode.near=45202");
    expect(init).toEqual(
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          Accept: "application/json",
        }),
      })
    );
  });

  it("searches products with the configured per-query limit", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              productId: "0001111041700",
              description: "Whole Milk",
              brand: "Kroger",
              items: [
                {
                  itemId: "001",
                  price: { regular: 3.99 },
                  inventory: { stockLevel: "HIGH" },
                },
              ],
            },
          ],
        }),
      } as Response);

    const client = createKrogerClient(createEnabledConfig({ maxProductsPerQuery: 7 }), fetchMock);

    await expect(client.searchProducts("milk", "01400943")).resolves.toEqual([
      {
        productId: "0001111041700",
        description: "Whole Milk",
        brand: "Kroger",
        items: [
          {
            itemId: "001",
            price: { regular: 3.99 },
            inventory: { stockLevel: "HIGH" },
          },
        ],
        raw: expect.objectContaining({ productId: "0001111041700" }),
      },
    ]);

    const [url] = fetchMock.mock.calls[1];
    expect(url).toBe(
      "https://api.kroger.test/v1/products?filter.term=milk&filter.locationId=01400943&filter.limit=7"
    );
  });

  it("surfaces a timeout as a safe structured error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const signal = init?.signal as AbortSignal;

      return await new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const abortError = new Error("Aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      });
    });

    const client = createKrogerClient(createEnabledConfig({ timeoutMs: 5 }), fetchMock);
    const tokenExpectation = expect(client.getAccessToken()).rejects.toEqual(
      expect.objectContaining<KrogerClientError>({
        name: "KrogerClientError",
        code: "kroger_timeout",
        message: "Kroger request timed out.",
      })
    );

    await vi.advanceTimersByTimeAsync(5);
    await tokenExpectation;
  });
});
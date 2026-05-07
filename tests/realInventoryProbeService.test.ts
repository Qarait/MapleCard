import { describe, expect, it, vi } from "vitest";
import { probeKrogerInventoryForTerms, MAX_KROGER_PROBE_TERMS } from "../src/services/realInventoryProbeService";
import type { KrogerClient, KrogerLocationSearchResult, KrogerProductSearchResult } from "../src/providers/kroger/krogerClient";
import type { KrogerConfig } from "../src/config/krogerConfig";

function createEnabledConfig(overrides: Partial<KrogerConfig> = {}): KrogerConfig {
  return {
    providerEnabled: true,
    isAvailable: true,
    clientId: "client-id",
    clientSecret: "client-secret",
    defaultZipCode: "45202",
    defaultLocationId: undefined,
    baseUrl: "https://api.kroger.test/v1",
    tokenUrl: "https://api.kroger.test/v1/connect/oauth2/token",
    timeoutMs: 5000,
    maxProductsPerQuery: 3,
    ...overrides,
  };
}

function createClientStub(overrides: Partial<KrogerClient> = {}): KrogerClient {
  return {
    getAccessToken: vi.fn(async () => "token-123"),
    searchLocationsByZip: vi.fn(async (_zipCode: string): Promise<KrogerLocationSearchResult[]> => [
      {
        locationId: "01400943",
        name: "Downtown Kroger",
        chain: "Kroger",
        address: { city: "Cincinnati", state: "OH", zipCode: "45202" },
        raw: { locationId: "01400943" },
      },
    ]),
    searchProducts: vi.fn(async (term: string, _locationId: string): Promise<KrogerProductSearchResult[]> => [
      {
        productId: `${term}-1`,
        description: `${term} product`,
        brand: "Kroger",
        items: [
          {
            itemId: `${term}-item-1`,
            price: { regular: 2.99 },
            inventory: { stockLevel: "HIGH" },
            fulfillment: [{ type: "pickup", availability: "AVAILABLE" }],
          },
        ],
        raw: { productId: `${term}-1` },
      },
    ]),
    ...overrides,
  };
}

describe("real inventory probe service", () => {
  it("returns disabled without creating a client when the provider is off", async () => {
    const clientFactory = vi.fn();

    await expect(
      probeKrogerInventoryForTerms(
        { terms: ["milk"] },
        {
          config: createEnabledConfig({ providerEnabled: false, isAvailable: false, unavailableReason: "disabled" }),
          clientFactory,
        }
      )
    ).resolves.toEqual({
      provider: "kroger",
      status: "disabled",
      reason: "disabled",
      termLimit: MAX_KROGER_PROBE_TERMS,
      productLimitPerTerm: 3,
    });

    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("returns unavailable when credentials are missing", async () => {
    const result = await probeKrogerInventoryForTerms(
      { terms: ["milk"] },
      {
        config: createEnabledConfig({ isAvailable: false, unavailableReason: "missing_credentials" }),
      }
    );

    expect(result).toEqual({
      provider: "kroger",
      status: "unavailable",
      reason: "missing_credentials",
      termLimit: MAX_KROGER_PROBE_TERMS,
      productLimitPerTerm: 3,
    });
    expect(JSON.stringify(result)).not.toContain("client-secret");
    expect(JSON.stringify(result)).not.toContain("client-id");
  });

  it("returns no_location when neither a locationId nor a zip-backed location is available", async () => {
    await expect(
      probeKrogerInventoryForTerms(
        { terms: ["milk"] },
        {
          config: createEnabledConfig({ defaultZipCode: undefined, defaultLocationId: undefined }),
        }
      )
    ).resolves.toEqual({
      provider: "kroger",
      status: "no_location",
      reason: "missing_location",
      termLimit: MAX_KROGER_PROBE_TERMS,
      productLimitPerTerm: 3,
      searchedTerms: ["milk"],
    });
  });

  it("uses zip lookup when no locationId is provided and returns mapped candidates", async () => {
    const client = createClientStub();

    await expect(
      probeKrogerInventoryForTerms(
        { terms: ["milk", "eggs"], zipCode: "45202" },
        {
          config: createEnabledConfig(),
          clientFactory: () => client,
        }
      )
    ).resolves.toEqual({
      provider: "kroger",
      status: "ok",
      resolvedLocationId: "01400943",
      resolvedZipCode: "45202",
      location: {
        locationId: "01400943",
        name: "Downtown Kroger",
        chain: "Kroger",
        address: { city: "Cincinnati", state: "OH", zipCode: "45202" },
      },
      searchedTerms: ["milk", "eggs"],
      truncatedTermCount: 0,
      productLimitPerTerm: 3,
      termResults: [
        {
          term: "milk",
          candidateCount: 1,
          candidates: [
            {
              provider: "kroger",
              locationId: "01400943",
              productId: "milk-1",
              upc: "milk-item-1",
              description: "milk product",
              brand: "Kroger",
              priceCents: 299,
              currency: "USD",
              available: true,
              fulfillment: ["pickup"],
              rawProvider: "kroger",
            },
          ],
        },
        {
          term: "eggs",
          candidateCount: 1,
          candidates: [
            {
              provider: "kroger",
              locationId: "01400943",
              productId: "eggs-1",
              upc: "eggs-item-1",
              description: "eggs product",
              brand: "Kroger",
              priceCents: 299,
              currency: "USD",
              available: true,
              fulfillment: ["pickup"],
              rawProvider: "kroger",
            },
          ],
        },
      ],
    });

    expect(client.searchLocationsByZip).toHaveBeenCalledWith("45202");
    expect(client.searchProducts).toHaveBeenNthCalledWith(1, "milk", "01400943");
    expect(client.searchProducts).toHaveBeenNthCalledWith(2, "eggs", "01400943");
  });

  it("caps and de-duplicates terms before searching", async () => {
    const client = createClientStub();

    const result = await probeKrogerInventoryForTerms(
      {
        terms: ["milk", " eggs ", "milk", "bread", "coffee", "yogurt", "bananas"],
        locationId: "01400943",
      },
      {
        config: createEnabledConfig(),
        clientFactory: () => client,
      }
    );

    expect(result).toEqual(
      expect.objectContaining({
        provider: "kroger",
        status: "ok",
        searchedTerms: ["milk", "eggs", "bread", "coffee", "yogurt"],
        truncatedTermCount: 1,
      })
    );
    expect(client.searchLocationsByZip).not.toHaveBeenCalled();
    expect(client.searchProducts).toHaveBeenCalledTimes(5);
  });

  it("returns a controlled error result when the client fails", async () => {
    const client = createClientStub({
      searchProducts: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    await expect(
      probeKrogerInventoryForTerms(
        { terms: ["milk"], locationId: "01400943" },
        {
          config: createEnabledConfig(),
          clientFactory: () => client,
        }
      )
    ).resolves.toEqual({
      provider: "kroger",
      status: "error",
      code: "kroger_probe_failed",
      message: "Kroger inventory probe failed.",
      termLimit: MAX_KROGER_PROBE_TERMS,
      productLimitPerTerm: 3,
      searchedTerms: ["milk"],
    });
  });
});
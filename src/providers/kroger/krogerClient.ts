import { Buffer } from "node:buffer";
import { getKrogerConfig, type KrogerConfig, type KrogerUnavailableReason } from "../../config/krogerConfig";

type FetchLike = typeof fetch;

type KrogerTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type KrogerApiListResponse<T> = {
  data?: T[];
};

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

export type KrogerLocationSearchResult = {
  locationId: string;
  name?: string;
  chain?: string;
  address?: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  raw: Record<string, unknown>;
};

export type KrogerProductSearchResult = {
  productId: string;
  description?: string;
  brand?: string;
  items: Array<Record<string, unknown>>;
  raw: Record<string, unknown>;
};

export type KrogerClientErrorCode =
  | "kroger_provider_unavailable"
  | "kroger_auth_failed"
  | "kroger_request_failed"
  | "kroger_timeout"
  | "kroger_invalid_response";

export class KrogerClientError extends Error {
  constructor(
    public readonly code: KrogerClientErrorCode,
    message: string,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "KrogerClientError";
  }
}

export type KrogerClient = {
  getAccessToken(): Promise<string>;
  searchLocationsByZip(zipCode: string): Promise<KrogerLocationSearchResult[]>;
  searchProducts(term: string, locationId: string): Promise<KrogerProductSearchResult[]>;
};

function getUnavailableError(reason: KrogerUnavailableReason): KrogerClientError {
  return new KrogerClientError("kroger_provider_unavailable", "Kroger provider is unavailable.", 503, {
    unavailableReason: reason,
  });
}

function requireAvailableConfig(config: KrogerConfig): asserts config is KrogerConfig & { clientId: string; clientSecret: string } {
  if (!config.isAvailable || !config.clientId || !config.clientSecret) {
    throw getUnavailableError(config.unavailableReason ?? "missing_credentials");
  }
}

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutHandle),
  };
}

async function fetchJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  errorContext: { code: KrogerClientErrorCode; message: string; endpoint: string }
): Promise<T> {
  const { signal, cleanup } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal,
    });

    if (!response.ok) {
      throw new KrogerClientError(errorContext.code, errorContext.message, response.status, {
        endpoint: errorContext.endpoint,
      });
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof KrogerClientError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new KrogerClientError("kroger_timeout", "Kroger request timed out.", 504, {
        endpoint: errorContext.endpoint,
        timeoutMs,
      });
    }

    throw new KrogerClientError(errorContext.code, errorContext.message, undefined, {
      endpoint: errorContext.endpoint,
    });
  } finally {
    cleanup();
  }
}

function normalizeLocationRecord(record: unknown): KrogerLocationSearchResult | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const raw = record as Record<string, unknown>;
  const locationId = typeof raw.locationId === "string" ? raw.locationId : undefined;

  if (!locationId) {
    return null;
  }

  const address = raw.address && typeof raw.address === "object" ? (raw.address as Record<string, unknown>) : undefined;

  return {
    locationId,
    name: typeof raw.name === "string" ? raw.name : undefined,
    chain: typeof raw.chain === "string" ? raw.chain : undefined,
    address: address
      ? {
          addressLine1: typeof address.addressLine1 === "string" ? address.addressLine1 : undefined,
          city: typeof address.city === "string" ? address.city : undefined,
          state: typeof address.state === "string" ? address.state : undefined,
          zipCode: typeof address.zipCode === "string" ? address.zipCode : undefined,
        }
      : undefined,
    raw,
  };
}

function normalizeProductRecord(record: unknown): KrogerProductSearchResult | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const raw = record as Record<string, unknown>;
  const productId = typeof raw.productId === "string" ? raw.productId : undefined;

  if (!productId) {
    return null;
  }

  return {
    productId,
    description: typeof raw.description === "string" ? raw.description : undefined,
    brand: typeof raw.brand === "string" ? raw.brand : undefined,
    items: Array.isArray(raw.items) ? raw.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [],
    raw,
  };
}

export function createKrogerClient(
  config: KrogerConfig = getKrogerConfig(),
  fetchImpl: FetchLike = fetch
): KrogerClient {
  let cachedToken: CachedToken | null = null;

  async function getAccessToken(): Promise<string> {
    requireAvailableConfig(config);

    const now = Date.now();
    if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
      return cachedToken.accessToken;
    }

    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    const payload = new URLSearchParams({
      grant_type: "client_credentials",
    });

    const tokenResponse = await fetchJson<KrogerTokenResponse>(
      fetchImpl,
      config.tokenUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload.toString(),
      },
      config.timeoutMs,
      {
        code: "kroger_auth_failed",
        message: "Kroger authentication failed.",
        endpoint: "oauth2/token",
      }
    );

    if (
      typeof tokenResponse.access_token !== "string" ||
      tokenResponse.access_token.trim().length === 0 ||
      typeof tokenResponse.expires_in !== "number" ||
      !Number.isFinite(tokenResponse.expires_in)
    ) {
      throw new KrogerClientError("kroger_invalid_response", "Kroger token response was invalid.", 502, {
        endpoint: "oauth2/token",
      });
    }

    const expiresAtMs = now + Math.max(tokenResponse.expires_in * 1000 - 30_000, 1_000);
    cachedToken = {
      accessToken: tokenResponse.access_token,
      expiresAtMs,
    };

    return cachedToken.accessToken;
  }

  async function searchLocationsByZip(zipCode: string): Promise<KrogerLocationSearchResult[]> {
    requireAvailableConfig(config);

    const trimmedZipCode = zipCode.trim();

    if (!trimmedZipCode) {
      throw new KrogerClientError("kroger_invalid_response", "A zip code is required for Kroger location search.", 400, {
        endpoint: "locations",
      });
    }

    const accessToken = await getAccessToken();
    const url = new URL(`${config.baseUrl}/locations`);
    url.searchParams.set("filter.zipCode.near", trimmedZipCode);

    const response = await fetchJson<KrogerApiListResponse<unknown>>(
      fetchImpl,
      url.toString(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
      config.timeoutMs,
      {
        code: "kroger_request_failed",
        message: "Kroger location search failed.",
        endpoint: "locations",
      }
    );

    if (!Array.isArray(response.data)) {
      throw new KrogerClientError("kroger_invalid_response", "Kroger location response was invalid.", 502, {
        endpoint: "locations",
      });
    }

    return response.data.map(normalizeLocationRecord).filter((location): location is KrogerLocationSearchResult => location != null);
  }

  async function searchProducts(term: string, locationId: string): Promise<KrogerProductSearchResult[]> {
    requireAvailableConfig(config);

    const trimmedTerm = term.trim();
    const trimmedLocationId = locationId.trim();

    if (!trimmedTerm || !trimmedLocationId) {
      throw new KrogerClientError(
        "kroger_invalid_response",
        "A search term and locationId are required for Kroger product search.",
        400,
        { endpoint: "products" }
      );
    }

    const accessToken = await getAccessToken();
    const url = new URL(`${config.baseUrl}/products`);
    url.searchParams.set("filter.term", trimmedTerm);
    url.searchParams.set("filter.locationId", trimmedLocationId);
    url.searchParams.set("filter.limit", String(config.maxProductsPerQuery));

    const response = await fetchJson<KrogerApiListResponse<unknown>>(
      fetchImpl,
      url.toString(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
      config.timeoutMs,
      {
        code: "kroger_request_failed",
        message: "Kroger product search failed.",
        endpoint: "products",
      }
    );

    if (!Array.isArray(response.data)) {
      throw new KrogerClientError("kroger_invalid_response", "Kroger product response was invalid.", 502, {
        endpoint: "products",
      });
    }

    return response.data.map(normalizeProductRecord).filter((product): product is KrogerProductSearchResult => product != null);
  }

  return {
    getAccessToken,
    searchLocationsByZip,
    searchProducts,
  };
}
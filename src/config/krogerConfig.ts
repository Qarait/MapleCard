import { logger } from "../utils/logger";

export const DEFAULT_KROGER_PROVIDER_ENABLED = false;
export const DEFAULT_KROGER_BASE_URL = "https://api.kroger.com/v1";
export const DEFAULT_KROGER_TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token";
export const DEFAULT_KROGER_TIMEOUT_MS = 5000;
export const DEFAULT_KROGER_MAX_PRODUCTS_PER_QUERY = 10;

export type KrogerUnavailableReason = "disabled" | "missing_credentials";

export type KrogerConfig = {
  providerEnabled: boolean;
  isAvailable: boolean;
  unavailableReason?: KrogerUnavailableReason;
  clientId?: string;
  clientSecret?: string;
  defaultZipCode?: string;
  defaultLocationId?: string;
  baseUrl: string;
  tokenUrl: string;
  timeoutMs: number;
  maxProductsPerQuery: number;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") return true;
  if (normalizedValue === "false") return false;

  return fallback;
}

function getTrimmedEnvValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number, envVarName: string): number {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(trimmedValue, 10);

  if (Number.isInteger(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  logger.warn(`[MapleCard config] ${envVarName} is invalid; using fallback.`, {
    providedValue: trimmedValue,
    fallbackValue: fallback,
  });

  return fallback;
}

export function getKrogerConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): KrogerConfig {
  const providerEnabled = parseBoolean(env.KROGER_PROVIDER_ENABLED, DEFAULT_KROGER_PROVIDER_ENABLED);
  const clientId = getTrimmedEnvValue(env.KROGER_CLIENT_ID);
  const clientSecret = getTrimmedEnvValue(env.KROGER_CLIENT_SECRET);
  const baseUrl = getTrimmedEnvValue(env.KROGER_BASE_URL) ?? DEFAULT_KROGER_BASE_URL;
  const tokenUrl = getTrimmedEnvValue(env.KROGER_TOKEN_URL) ?? DEFAULT_KROGER_TOKEN_URL;
  const defaultZipCode = getTrimmedEnvValue(env.KROGER_DEFAULT_ZIP_CODE);
  const defaultLocationId = getTrimmedEnvValue(env.KROGER_DEFAULT_LOCATION_ID);
  const timeoutMs = parsePositiveInteger(env.KROGER_TIMEOUT_MS, DEFAULT_KROGER_TIMEOUT_MS, "KROGER_TIMEOUT_MS");
  const maxProductsPerQuery = parsePositiveInteger(
    env.KROGER_MAX_PRODUCTS_PER_QUERY,
    DEFAULT_KROGER_MAX_PRODUCTS_PER_QUERY,
    "KROGER_MAX_PRODUCTS_PER_QUERY"
  );

  if (!providerEnabled) {
    return {
      providerEnabled,
      isAvailable: false,
      unavailableReason: "disabled",
      clientId,
      clientSecret,
      defaultZipCode,
      defaultLocationId,
      baseUrl,
      tokenUrl,
      timeoutMs,
      maxProductsPerQuery,
    };
  }

  if (!clientId || !clientSecret) {
    logger.warn("[MapleCard config] Kroger provider enabled without complete credentials; provider unavailable.", {
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
    });

    return {
      providerEnabled,
      isAvailable: false,
      unavailableReason: "missing_credentials",
      clientId,
      clientSecret,
      defaultZipCode,
      defaultLocationId,
      baseUrl,
      tokenUrl,
      timeoutMs,
      maxProductsPerQuery,
    };
  }

  return {
    providerEnabled,
    isAvailable: true,
    clientId,
    clientSecret,
    defaultZipCode,
    defaultLocationId,
    baseUrl,
    tokenUrl,
    timeoutMs,
    maxProductsPerQuery,
  };
}
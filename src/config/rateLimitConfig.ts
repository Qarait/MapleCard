import { logger } from "../utils/logger";

export type RateLimitConfig = {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
};

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;

function parseBoolean(rawValue: string | undefined): boolean {
  return rawValue?.trim().toLowerCase() === "true";
}

function parsePositiveInteger(rawValue: string | undefined, fallbackValue: number, envVarName: string): number {
  if (rawValue == null || rawValue.trim().length === 0) {
    return fallbackValue;
  }

  const parsedValue = Number(rawValue.trim());

  if (Number.isInteger(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  logger.warn(`[MapleCard config] ${envVarName} is invalid; using fallback value.`, {
    providedValue: rawValue,
    fallbackValue,
  });

  return fallbackValue;
}

export function getRateLimitConfig(): RateLimitConfig {
  return {
    enabled: parseBoolean(process.env.MAPLECARD_RATE_LIMIT_ENABLED),
    windowMs: parsePositiveInteger(
      process.env.MAPLECARD_RATE_LIMIT_WINDOW_MS,
      DEFAULT_RATE_LIMIT_WINDOW_MS,
      "MAPLECARD_RATE_LIMIT_WINDOW_MS"
    ),
    maxRequests: parsePositiveInteger(
      process.env.MAPLECARD_RATE_LIMIT_MAX_REQUESTS,
      DEFAULT_RATE_LIMIT_MAX_REQUESTS,
      "MAPLECARD_RATE_LIMIT_MAX_REQUESTS"
    ),
  };
}
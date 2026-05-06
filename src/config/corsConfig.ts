import type { CorsOptions } from "cors";

function parseAllowedOrigins(rawOrigins: string | undefined): string[] {
  if (rawOrigins === undefined) {
    return [];
  }

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function getCorsOptions(): CorsOptions | undefined {
  const allowedOrigins = parseAllowedOrigins(process.env.MAPLECARD_CORS_ORIGINS);

  if (allowedOrigins.length === 0) {
    return undefined;
  }

  const allowedOriginSet = new Set(allowedOrigins);

  return {
    origin(origin, callback) {
      if (origin === undefined || allowedOriginSet.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  };
}
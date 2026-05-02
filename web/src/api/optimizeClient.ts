import { getFixtureOptimizeResponse } from "../fixtures/optimizeFixtures";
import type { ApiErrorResponse, OptimizeRequest, OptimizeResponse } from "../types/api";

export type ApiMode = "fixture" | "backend";

export type FrontendConfig = {
  apiMode: ApiMode;
  apiBaseUrl: string;
};

export type OptimizeShoppingClient = (request: OptimizeRequest) => Promise<OptimizeResponse>;

const VALIDATION_ERROR_CODES = new Set([
  "missing_raw_input",
  "invalid_raw_input_type",
  "empty_raw_input",
  "raw_input_too_long",
  "too_many_lines",
  "line_too_long",
  "invalid_clarification_answers_type",
  "too_many_clarification_answers",
  "invalid_clarification_answer",
]);

function getSafeApiErrorMessage(statusCode: number, errorCode?: string): string {
  if (statusCode >= 400 && statusCode < 500 && errorCode && VALIDATION_ERROR_CODES.has(errorCode)) {
    return "Please check your shopping list and clarification answers, then try again.";
  }

  return "MapleCard could not complete this request right now. Please try again in a moment.";
}

async function parseApiError(response: Response): Promise<Error> {
  let errorBody: ApiErrorResponse | null = null;

  try {
    errorBody = (await response.json()) as ApiErrorResponse;
  } catch {
    errorBody = null;
  }

  const safeMessage = getSafeApiErrorMessage(response.status, errorBody?.error?.code);
  return new Error(safeMessage);
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

export function resolveFrontendConfig(
  env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>
): FrontendConfig {
  const explicitApiMode = env.VITE_MAPLECARD_API_MODE as ApiMode | undefined;
  const derivedApiMode = env.MODE === "backend" ? "backend" : "fixture";

  return {
    apiMode: explicitApiMode ?? derivedApiMode,
    apiBaseUrl: env.VITE_MAPLECARD_API_BASE_URL ?? "http://localhost:3000",
  };
}

export const frontendConfig = resolveFrontendConfig();

export function createOptimizeShoppingClient(config: FrontendConfig = frontendConfig): OptimizeShoppingClient {
  return async function optimizeShopping(request: OptimizeRequest): Promise<OptimizeResponse> {
    if (config.apiMode === "fixture") {
      return Promise.resolve(getFixtureOptimizeResponse(request));
    }

    let response: Response;
    const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);

    try {
      response = await fetch(`${apiBaseUrl}/api/optimize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
    } catch {
      throw new Error("MapleCard could not reach the local backend. Confirm the API server is running, then try again.");
    }

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return (await response.json()) as OptimizeResponse;
  };
}

export const optimizeShopping = createOptimizeShoppingClient(frontendConfig);
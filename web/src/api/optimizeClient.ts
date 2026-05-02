import { getFixtureOptimizeResponse } from "../fixtures/optimizeFixtures";
import type { ApiErrorResponse, OptimizeRequest, OptimizeResponse } from "../types/api";

export type ApiMode = "fixture" | "backend";

export type OptimizeShoppingClient = (request: OptimizeRequest) => Promise<OptimizeResponse>;

export const frontendConfig = {
  apiMode: ((import.meta.env.VITE_MAPLECARD_API_MODE as ApiMode | undefined) ?? "fixture") as ApiMode,
  apiBaseUrl: (import.meta.env.VITE_MAPLECARD_API_BASE_URL as string | undefined) ?? "http://localhost:3000",
};

export async function optimizeShopping(request: OptimizeRequest): Promise<OptimizeResponse> {
  if (frontendConfig.apiMode === "fixture") {
    return Promise.resolve(getFixtureOptimizeResponse(request));
  }

  const response = await fetch(`${frontendConfig.apiBaseUrl}/api/optimize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as ApiErrorResponse;
    throw new Error(errorBody.error.message);
  }

  return (await response.json()) as OptimizeResponse;
}
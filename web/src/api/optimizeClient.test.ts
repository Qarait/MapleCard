import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, createOptimizeShoppingClient, getOptimizeResponseRequestId } from "./optimizeClient";

function createBackendSuccessResponse() {
  return {
    ok: true,
    headers: new Headers(),
    json: async () => ({
      items: [],
      winner: {
        provider: "synthetic",
        retailerKey: "freshmart",
        subtotal: 12,
        etaMin: 25,
        coverageRatio: 1,
        avgMatchConfidence: 1,
        score: 0.9,
        reason: "Best overall score",
      },
      alternatives: [],
      clarifications: [],
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("optimize client", () => {
  it("keeps fixture mode as the default-friendly path", async () => {
    const client = createOptimizeShoppingClient({
      apiMode: "fixture",
      apiBaseUrl: "http://localhost:3000",
    });

    const response = await client({ rawInput: "yogurt" });

    expect(response.clarifications[0].id).toMatch(/^cq_line-0-yogurt-exact-item/);
    expect(response.clarifications[0].lineId).toBe("line_0_yogurt_exact-item");
  });

  it("backend mode sends POST /api/optimize", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createBackendSuccessResponse());

    vi.stubGlobal("fetch", fetchMock);

    const client = createOptimizeShoppingClient({
      apiMode: "backend",
      apiBaseUrl: "http://localhost:3000",
    });

    await client({ rawInput: "milk" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/optimize",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backend mode keeps a base URL without a trailing slash unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createBackendSuccessResponse());

    vi.stubGlobal("fetch", fetchMock);

    const client = createOptimizeShoppingClient({
      apiMode: "backend",
      apiBaseUrl: "https://backend.example.com",
    });

    await client({ rawInput: "milk" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example.com/api/optimize",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backend mode trims a trailing slash from the base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createBackendSuccessResponse());

    vi.stubGlobal("fetch", fetchMock);

    const client = createOptimizeShoppingClient({
      apiMode: "backend",
      apiBaseUrl: "https://backend.example.com/",
    });

    await client({ rawInput: "milk" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example.com/api/optimize",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backend mode includes clarificationAnswers in the request payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createBackendSuccessResponse());

    vi.stubGlobal("fetch", fetchMock);

    const client = createOptimizeShoppingClient({
      apiMode: "backend",
      apiBaseUrl: "http://localhost:3000",
    });

    await client({
      rawInput: "yogurt",
      clarificationAnswers: [
        {
          questionId: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
          lineId: "line_0_yogurt_exact-item",
          rawText: "yogurt",
          attributeKey: "type",
          value: "greek",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(requestInit.body as string)).toEqual({
      rawInput: "yogurt",
      clarificationAnswers: [
        {
          questionId: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
          lineId: "line_0_yogurt_exact-item",
          rawText: "yogurt",
          attributeKey: "type",
          value: "greek",
        },
      ],
    });
  });

  it("backend mode keeps the optimize response shape unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createBackendSuccessResponse());

    vi.stubGlobal("fetch", fetchMock);

    const client = createOptimizeShoppingClient({
      apiMode: "backend",
      apiBaseUrl: "https://backend.example.com",
    });

    const response = await client({ rawInput: "milk" });

    expect(response).toEqual({
      items: [],
      winner: {
        provider: "synthetic",
        retailerKey: "freshmart",
        subtotal: 12,
        etaMin: 25,
        coverageRatio: 1,
        avgMatchConfidence: 1,
        score: 0.9,
        reason: "Best overall score",
      },
      alternatives: [],
      clarifications: [],
    });
  });

  it("captures a success request id from the backend response header without changing the response payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ...createBackendSuccessResponse(),
      headers: new Headers({
        "x-request-id": "req_success_123",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createOptimizeShoppingClient({
      apiMode: "backend",
      apiBaseUrl: "https://backend.example.com",
    });

    const response = await client({ rawInput: "milk" });

    expect(response).toEqual({
      items: [],
      winner: {
        provider: "synthetic",
        retailerKey: "freshmart",
        subtotal: 12,
        etaMin: 25,
        coverageRatio: 1,
        avgMatchConfidence: 1,
        score: 0.9,
        reason: "Best overall score",
      },
      alternatives: [],
      clarifications: [],
    });
    expect(getOptimizeResponseRequestId(response)).toBe("req_success_123");
  });

  it("backend mode surfaces safe correlation ids from error responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({
        "x-request-id": "req_123",
        "x-error-id": "err_123",
      }),
      json: async () => ({
        error: {
          code: "catalog_provider_failed",
          message: "Catalog temporarily unavailable.",
          requestId: "req_123",
          errorId: "err_123",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createOptimizeShoppingClient({
      apiMode: "backend",
      apiBaseUrl: "https://backend.example.com",
    });

    await expect(client({ rawInput: "milk" })).rejects.toEqual(
      expect.objectContaining<ApiClientError>({
        name: "ApiClientError",
        message: "MapleCard could not complete this request right now. Please try again in a moment.",
        requestId: "req_123",
        errorId: "err_123",
      })
    );
  });
});
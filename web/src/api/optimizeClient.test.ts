import { afterEach, describe, expect, it, vi } from "vitest";
import { createOptimizeShoppingClient } from "./optimizeClient";

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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
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
    });

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
  });

  it("backend mode includes clarificationAnswers in the request payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
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
    });

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
});
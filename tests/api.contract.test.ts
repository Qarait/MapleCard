import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app, createApp } from "../src/app";
import { resetOptimizeRateLimitState } from "../src/middleware/rateLimit";
import type { OptimizeResponse } from "../src/services/optimizeService";
import * as optimizeService from "../src/services/optimizeService";
import { OptimizeServiceError } from "../src/services/optimizeServiceError";
import {
  coffeeWithAnswerFixture,
  duplicateYogurtLinesFixture,
  invalidClarificationAnswerFixture,
  normalGroceryListFixture,
  rawYogurtRequestFixture,
  yogurtWithAnswerFixture,
} from "./fixtures/optimize";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetOptimizeRateLimitState();
  vi.restoreAllMocks();
});

describe("public API contract", () => {
  it("rate limiting stays disabled by default so local and test traffic still works", async () => {
    process.env.MAPLECARD_RATE_LIMIT_ENABLED = "false";
    process.env.MAPLECARD_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.MAPLECARD_RATE_LIMIT_WINDOW_MS = "60000";

    const scopedApp = createApp();
    const firstResponse = await request(scopedApp).post("/api/optimize").send({ rawInput: "milk" });
    const secondResponse = await request(scopedApp).post("/api/optimize").send({ rawInput: "milk" });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
  });

  it("rate limiting allows optimize requests under the configured limit", async () => {
    process.env.MAPLECARD_RATE_LIMIT_ENABLED = "true";
    process.env.MAPLECARD_RATE_LIMIT_MAX_REQUESTS = "2";
    process.env.MAPLECARD_RATE_LIMIT_WINDOW_MS = "60000";

    const scopedApp = createApp();
    const firstResponse = await request(scopedApp).post("/api/optimize").send({ rawInput: "milk" });
    const secondResponse = await request(scopedApp).post("/api/optimize").send({ rawInput: "eggs" });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
  });

  it("rate limiting returns a structured 429 after the configured limit", async () => {
    process.env.MAPLECARD_RATE_LIMIT_ENABLED = "true";
    process.env.MAPLECARD_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.MAPLECARD_RATE_LIMIT_WINDOW_MS = "60000";

    const scopedApp = createApp();
    const firstResponse = await request(scopedApp).post("/api/optimize").send({ rawInput: "milk" });
    const secondResponse = await request(scopedApp).post("/api/optimize").send({ rawInput: "eggs" });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(429);
    expect(secondResponse.headers["x-request-id"]).toEqual(expect.any(String));
    expect(secondResponse.headers["x-error-id"]).toMatch(/^err_/);
    expect(secondResponse.headers["retry-after"]).toEqual(expect.any(String));
    expect(secondResponse.body.error).toEqual(
      expect.objectContaining({
        code: "rate_limited",
        message: "Too many requests. Please try again shortly.",
        requestId: secondResponse.headers["x-request-id"],
        errorId: secondResponse.headers["x-error-id"],
      })
    );
  });

  it("healthz is not affected by optimize rate limiting", async () => {
    process.env.MAPLECARD_RATE_LIMIT_ENABLED = "true";
    process.env.MAPLECARD_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.MAPLECARD_RATE_LIMIT_WINDOW_MS = "60000";

    const scopedApp = createApp();
    const optimizeResponse = await request(scopedApp).post("/api/optimize").send({ rawInput: "milk" });
    const limitedOptimizeResponse = await request(scopedApp).post("/api/optimize").send({ rawInput: "eggs" });
    const healthResponse = await request(scopedApp).get("/healthz");

    expect(optimizeResponse.status).toBe(200);
    expect(limitedOptimizeResponse.status).toBe(429);
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body).toEqual(expect.objectContaining({ ok: true }));
  });

  it("GET /healthz remains backward-compatible while exposing release metadata", async () => {
    process.env.NODE_ENV = "production";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";

    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        service: "maplecard-api",
        environment: "production",
        catalogSource: "seed_bridge",
        parserMode: "deterministic_only",
      })
    );
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
  });

  it("preserves a safe incoming X-Request-Id header", async () => {
    const response = await request(createApp())
      .get("/healthz")
      .set("X-Request-Id", "client-request-123");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("client-request-123");
  });

  it("generates X-Request-Id when the client does not send one", async () => {
    const response = await request(createApp()).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers["x-request-id"].length).toBeGreaterThan(0);
  });

  it("GET /healthz and /healthz/ stay consistent", async () => {
    process.env.NODE_ENV = "production";

    const scopedApp = createApp();
    const healthzResponse = await request(scopedApp).get("/healthz");
    const trailingSlashResponse = await request(scopedApp).get("/healthz/");

    expect(healthzResponse.status).toBe(200);
    expect(trailingSlashResponse.status).toBe(200);
    expect(trailingSlashResponse.body).toEqual(healthzResponse.body);
  });

  it("GET /healthz does not expose secrets in release metadata", async () => {
    process.env.NODE_ENV = "production";
    process.env.MAPLECARD_PARSER_MODE = "llm_assisted";
    process.env.OPENAI_API_KEY = "super-secret-key";
    process.env.MAPLECARD_CORS_ORIGINS = "https://maple-card.vercel.app";

    const response = await request(createApp()).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        parserMode: "llm_assisted",
      })
    );
    expect(response.body).not.toHaveProperty("OPENAI_API_KEY");
    expect(JSON.stringify(response.body)).not.toContain("super-secret-key");
    expect(JSON.stringify(response.body)).not.toContain("https://maple-card.vercel.app");
  });

  it("CORS allowlist allows a configured origin", async () => {
    process.env.MAPLECARD_CORS_ORIGINS = "https://maple-card.vercel.app";

    const response = await request(createApp())
      .get("/healthz")
      .set("Origin", "https://maple-card.vercel.app");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://maple-card.vercel.app");
    expect(response.headers["access-control-expose-headers"]).toContain("X-Request-Id");
  });

  it("CORS allowlist omits CORS headers for unknown origins", async () => {
    process.env.MAPLECARD_CORS_ORIGINS = "https://maple-card.vercel.app";

    const response = await request(createApp())
      .get("/healthz")
      .set("Origin", "https://unknown.example.com");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("CORS stays permissive when no allowlist is configured", async () => {
    delete process.env.MAPLECARD_CORS_ORIGINS;

    const response = await request(createApp())
      .get("/healthz")
      .set("Origin", "http://localhost:5173");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-expose-headers"]).toContain("X-Request-Id");
    expect(response.headers["access-control-expose-headers"]).toContain("X-Error-Id");
  });

  it("invalid optimize requests return safe request and error correlation ids", async () => {
    const response = await request(createApp())
      .post("/api/optimize")
      .send({ rawInput: "milk", clarificationAnswers: [{ questionId: "", rawText: "milk", value: "whole" }] });

    expect(response.status).toBe(400);
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers["x-error-id"]).toMatch(/^err_/);
    expect(response.body.error).toEqual(
      expect.objectContaining({
        code: "invalid_clarification_answer",
        requestId: response.headers["x-request-id"],
        errorId: response.headers["x-error-id"],
      })
    );
  });

  it("controlled optimize errors return safe correlation ids", async () => {
    vi.spyOn(optimizeService, "optimizeShopping").mockRejectedValue(
      new OptimizeServiceError("catalog_provider_failed", "Catalog temporarily unavailable.", 503)
    );

    const response = await request(createApp())
      .post("/api/optimize")
      .send({ rawInput: "milk" });

    expect(response.status).toBe(503);
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers["x-error-id"]).toMatch(/^err_/);
    expect(response.body.error).toEqual(
      expect.objectContaining({
        code: "catalog_provider_failed",
        requestId: response.headers["x-request-id"],
        errorId: response.headers["x-error-id"],
      })
    );
  });

  it("unexpected server errors are sanitized and include requestId and errorId", async () => {
    vi.spyOn(optimizeService, "optimizeShopping").mockRejectedValue(
      new Error("OPENAI_API_KEY leaked at C:\\secret\\config.txt")
    );

    const response = await request(createApp())
      .post("/api/optimize")
      .send({ rawInput: "milk" });

    expect(response.status).toBe(500);
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers["x-error-id"]).toMatch(/^err_/);
    expect(response.body.error).toEqual(
      expect.objectContaining({
        code: "optimization_failed",
        message: "Optimization failed.",
        requestId: response.headers["x-request-id"],
        errorId: response.headers["x-error-id"],
      })
    );
    expect(JSON.stringify(response.body)).not.toContain("OPENAI_API_KEY");
    expect(JSON.stringify(response.body)).not.toContain("secret");
    expect(JSON.stringify(response.body)).not.toContain("config.txt");
  });

  it("rawInput-only request returns items, winner, alternatives, and clarifications", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";

    const response = await request(app)
      .post("/api/optimize")
      .send(normalGroceryListFixture);

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(Object.keys(response.body)).toEqual(["items", "winner", "alternatives", "clarifications"]);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(Array.isArray(response.body.alternatives)).toBe(true);
    expect(Array.isArray(response.body.clarifications)).toBe(true);
    expect(response.body.winner).toEqual(
      expect.objectContaining({
        provider: expect.any(String),
        retailerKey: expect.any(String),
        subtotal: expect.any(Number),
        etaMin: expect.any(Number),
      })
    );
  });

  it("clarification objects include stable id and lineId", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send(rawYogurtRequestFixture);

    expect(response.status).toBe(200);
    expect(response.body.clarifications.length).toBeGreaterThan(0);
    for (const clarification of response.body.clarifications) {
      expect(clarification).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          lineId: expect.any(String),
          rawText: expect.any(String),
          question: expect.any(String),
          options: expect.any(Array),
        })
      );
    }
  });

  it("answerResults appears when clarificationAnswers are submitted", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send(yogurtWithAnswerFixture);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("answerResults");
    expect(Array.isArray(response.body.answerResults)).toBe(true);
    expect(response.body.answerResults[0]).toEqual(
      expect.objectContaining({
        questionId: yogurtWithAnswerFixture.clarificationAnswers[0].questionId,
        lineId: yogurtWithAnswerFixture.clarificationAnswers[0].lineId,
        rawText: yogurtWithAnswerFixture.clarificationAnswers[0].rawText,
        attributeKey: yogurtWithAnswerFixture.clarificationAnswers[0].attributeKey,
        value: yogurtWithAnswerFixture.clarificationAnswers[0].value,
        status: expect.any(String),
        message: expect.any(String),
      })
    );
  });

  it("duplicate-line clarifications have distinct lineIds", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send(duplicateYogurtLinesFixture);

    expect(response.status).toBe(200);

    const typeQuestions = response.body.clarifications.filter(
      (clarification: { attributeKey?: string }) => clarification.attributeKey === "type"
    );

    expect(typeQuestions).toHaveLength(2);
    expect(typeQuestions[0].lineId).not.toBe(typeQuestions[1].lineId);
    expect(typeQuestions[0].id).not.toBe(typeQuestions[1].id);
  });

  it("invalid clarificationAnswers return structured 400", async () => {
    const response = await request(app)
      .post("/api/optimize")
      .send(invalidClarificationAnswerFixture);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: expect.objectContaining({
        code: "invalid_clarification_answer",
        message: "Each clarification answer must include a non-empty `questionId`.",
        details: { index: 0, field: "questionId" },
      }),
    });
  });

  it("supports etaMin as number or null in the public store contract", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";

    const liveResponse = await request(app)
      .post("/api/optimize")
      .send(coffeeWithAnswerFixture);

    expect(liveResponse.status).toBe(200);
    expect(typeof liveResponse.body.winner.etaMin === "number" || liveResponse.body.winner.etaMin === null).toBe(true);
    expect(liveResponse.body.alternatives.every((store: { etaMin: number | null }) => typeof store.etaMin === "number" || store.etaMin === null)).toBe(true);

    const mockedResponse: OptimizeResponse = {
      items: [],
      winner: {
        provider: "synthetic",
        retailerKey: "freshmart",
        subtotal: 12.34,
        etaMin: null,
        coverageRatio: 1,
        avgMatchConfidence: 1,
        score: 0.9,
        reason: "ETA unknown but contract still valid",
      },
      alternatives: [
        {
          provider: "synthetic",
          retailerKey: "budgetfoods",
          subtotal: 13.45,
          etaMin: 35,
          coverageRatio: 1,
          avgMatchConfidence: 1,
          score: 0.8,
          reason: "Alternative example",
        },
      ],
      clarifications: [],
    };

    vi.spyOn(optimizeService, "optimizeShopping").mockResolvedValue(mockedResponse);

    const nullEtaResponse = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "milk" });

    expect(nullEtaResponse.status).toBe(200);
    expect(nullEtaResponse.body.winner.etaMin).toBeNull();
    expect(nullEtaResponse.body.alternatives[0].etaMin).toBe(35);
  });
});
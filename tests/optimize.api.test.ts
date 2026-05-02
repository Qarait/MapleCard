import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { OptimizeServiceError } from "../src/services/optimizeServiceError";
import * as optimizeService from "../src/services/optimizeService";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("optimize API validation", () => {
  it("accepts a valid optimize request", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";

    const response = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "2% milk\neggs" });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("items");
    expect(response.body).toHaveProperty("winner");
    expect(response.body).toHaveProperty("alternatives");
    expect(response.body).toHaveProperty("clarifications");
  });

  it("keeps the optimize success response shape unchanged in seed_bridge mode", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "milk\neggs\nbanana\nchicken\nrice" });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["items", "winner", "alternatives", "clarifications"]);
    expect(response.body.items).toHaveLength(5);
  });

  it("rejects a missing rawInput", async () => {
    const response = await request(app).post("/api/optimize").send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "missing_raw_input",
        message: "Request body must include `rawInput`.",
      },
    });
  });

  it("rejects an empty rawInput", async () => {
    const response = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "   \n\t" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("empty_raw_input");
  });

  it("rejects an overly long rawInput", async () => {
    const response = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "x".repeat(10001) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("raw_input_too_long");
    expect(response.body.error.details.actualLength).toBe(10001);
  });

  it("returns a controlled provider error without leaking internal details", async () => {
    const optimizeShoppingSpy = vi
      .spyOn(optimizeService, "optimizeShopping")
      .mockRejectedValue(
        new OptimizeServiceError("catalog_provider_failed", "Catalog provider is currently unavailable.", 503)
      );

    const response = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "milk" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "catalog_provider_failed",
        message: "Catalog provider is currently unavailable.",
      },
    });

    optimizeShoppingSpy.mockRestore();
  });
});
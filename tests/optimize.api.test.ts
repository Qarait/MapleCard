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

  it("rejects a non-array clarificationAnswers payload", async () => {
    const response = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "milk", clarificationAnswers: { questionId: "x" } });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "invalid_clarification_answers_type",
        message: "`clarificationAnswers` must be an array when provided.",
      },
    });
  });

  it("rejects malformed clarification answer payloads", async () => {
    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "yogurt",
        clarificationAnswers: [
          {
            questionId: "",
            rawText: "yogurt",
            value: "greek",
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "invalid_clarification_answer",
        message: "Each clarification answer must include a non-empty `questionId`.",
        details: { index: 0, field: "questionId" },
      },
    });
  });

  it("exposes stable public clarification ids while keeping the top-level optimize shape unchanged", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const firstResponse = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "yogurt\ncoffee" });
    const secondResponse = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "yogurt\ncoffee" });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(Object.keys(firstResponse.body)).toEqual(["items", "winner", "alternatives", "clarifications"]);
    expect(firstResponse.body.clarifications).toEqual(secondResponse.body.clarifications);
    expect(firstResponse.body.clarifications).toEqual([
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt type do you want?",
        options: ["regular", "greek", "drinkable"],
        attributeKey: "type",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt flavor do you want?",
        options: ["plain", "vanilla", "strawberry"],
        attributeKey: "flavor",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt fat do you want?",
        options: ["non-fat", "low-fat", "whole"],
        attributeKey: "fat",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt size do you want?",
        options: ["cup", "tub", "multi-pack"],
        attributeKey: "size",
      },
      {
        id: "cq_coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        rawText: "coffee",
        question: "Which coffee format do you want?",
        options: ["ground", "whole-bean", "pods"],
        attributeKey: "format",
      },
      {
        id: "cq_coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
        rawText: "coffee",
        question: "Which coffee roast do you want?",
        options: ["light", "medium", "dark"],
        attributeKey: "roast",
      },
    ]);
  });

  it("exposes yogurt and coffee clarification ids in seed_bridge mode", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "yogurt\ncoffee" });

    expect(response.status).toBe(200);
    expect(response.body.clarifications).toEqual([
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt type do you want?",
        options: ["regular", "greek", "drinkable"],
        attributeKey: "type",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt flavor do you want?",
        options: ["plain", "vanilla", "strawberry"],
        attributeKey: "flavor",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt fat do you want?",
        options: ["non-fat", "low-fat", "whole"],
        attributeKey: "fat",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt size do you want?",
        options: ["cup", "tub", "multi-pack"],
        attributeKey: "size",
      },
      {
        id: "cq_coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        rawText: "coffee",
        question: "Which coffee format do you want?",
        options: ["ground", "whole-bean", "pods"],
        attributeKey: "format",
      },
      {
        id: "cq_coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
        rawText: "coffee",
        question: "Which coffee roast do you want?",
        options: ["light", "medium", "dark"],
        attributeKey: "roast",
      },
    ]);
  });

  it("applies a valid yogurt type answer and returns only the remaining clarification ids", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "yogurt",
        clarificationAnswers: [
          {
            questionId: "cq_yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
            rawText: "yogurt",
            attributeKey: "type",
            value: "greek",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["items", "winner", "alternatives", "clarifications"]);
    expect(response.body.items[0].attributes.type).toBe("greek");
    expect(response.body.items[0].match.requestedAttributes.type).toBe("greek");
    expect(response.body.clarifications).toEqual([
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt flavor do you want?",
        options: ["plain", "vanilla", "strawberry"],
        attributeKey: "flavor",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt fat do you want?",
        options: ["non-fat", "low-fat", "whole"],
        attributeKey: "fat",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt size do you want?",
        options: ["cup", "tub", "multi-pack"],
        attributeKey: "size",
      },
    ]);
  });

  it("applies a valid coffee format answer and removes only the matching question", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "coffee",
        clarificationAnswers: [
          {
            questionId: "cq_coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
            rawText: "coffee",
            attributeKey: "format",
            value: "pods",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.items[0].attributes.format).toBe("pods");
    expect(response.body.items[0].match.requestedAttributes.format).toBe("pods");
    expect(response.body.clarifications).toEqual([
      {
        id: "cq_coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
        rawText: "coffee",
        question: "Which coffee roast do you want?",
        options: ["light", "medium", "dark"],
        attributeKey: "roast",
      },
    ]);
  });

  it("ignores an invalid answer value without corrupting attributes", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "coffee",
        clarificationAnswers: [
          {
            questionId: "cq_coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
            rawText: "coffee",
            attributeKey: "format",
            value: "capsules",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.items[0].attributes.format).toBe("ground");
    expect(response.body.items[0].match.requestedAttributes.format).toBe("ground");
    expect(response.body.clarifications).toEqual([
      {
        id: "cq_coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        rawText: "coffee",
        question: "Which coffee format do you want?",
        options: ["ground", "whole-bean", "pods"],
        attributeKey: "format",
      },
      {
        id: "cq_coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
        rawText: "coffee",
        question: "Which coffee roast do you want?",
        options: ["light", "medium", "dark"],
        attributeKey: "roast",
      },
    ]);
  });

  it("ignores an answer with the wrong question id", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "yogurt",
        clarificationAnswers: [
          {
            questionId: "cq_wrong",
            rawText: "yogurt",
            attributeKey: "type",
            value: "greek",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.items[0].attributes.type).toBe("regular");
    expect(response.body.items[0].match.requestedAttributes.type).toBe("regular");
    expect(response.body.clarifications).toEqual([
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt type do you want?",
        options: ["regular", "greek", "drinkable"],
        attributeKey: "type",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt flavor do you want?",
        options: ["plain", "vanilla", "strawberry"],
        attributeKey: "flavor",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt fat do you want?",
        options: ["non-fat", "low-fat", "whole"],
        attributeKey: "fat",
      },
      {
        id: "cq_yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
        rawText: "yogurt",
        question: "Which yogurt size do you want?",
        options: ["cup", "tub", "multi-pack"],
        attributeKey: "size",
      },
    ]);
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
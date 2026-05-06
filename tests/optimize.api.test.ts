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
    expect(response.body).not.toHaveProperty("answerResults");
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
      error: expect.objectContaining({
        code: "invalid_clarification_answers_type",
        message: "`clarificationAnswers` must be an array when provided.",
      }),
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
      error: expect.objectContaining({
        code: "invalid_clarification_answer",
        message: "Each clarification answer must include a non-empty `questionId`.",
        details: { index: 0, field: "questionId" },
      }),
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
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt type do you want?",
        options: ["regular", "greek", "drinkable"],
        attributeKey: "type",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt flavor do you want?",
        options: ["plain", "vanilla", "strawberry"],
        attributeKey: "flavor",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt fat do you want?",
        options: ["non-fat", "low-fat", "whole"],
        attributeKey: "fat",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt size do you want?",
        options: ["cup", "tub", "multi-pack"],
        attributeKey: "size",
      },
      {
        id: "cq_line-1-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        lineId: "line_1_coffee_exact-item",
        rawText: "coffee",
        question: "Which coffee format do you want?",
        options: ["ground", "whole-bean", "pods"],
        attributeKey: "format",
      },
      {
        id: "cq_line-1-coffee-exact-item__coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
        lineId: "line_1_coffee_exact-item",
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
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt type do you want?",
        options: ["regular", "greek", "drinkable"],
        attributeKey: "type",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt flavor do you want?",
        options: ["plain", "vanilla", "strawberry"],
        attributeKey: "flavor",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt fat do you want?",
        options: ["non-fat", "low-fat", "whole"],
        attributeKey: "fat",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt size do you want?",
        options: ["cup", "tub", "multi-pack"],
        attributeKey: "size",
      },
      {
        id: "cq_line-1-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        lineId: "line_1_coffee_exact-item",
        rawText: "coffee",
        question: "Which coffee format do you want?",
        options: ["ground", "whole-bean", "pods"],
        attributeKey: "format",
      },
      {
        id: "cq_line-1-coffee-exact-item__coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
        lineId: "line_1_coffee_exact-item",
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
            questionId: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
            lineId: "line_0_yogurt_exact-item",
            rawText: "yogurt",
            attributeKey: "type",
            value: "greek",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["items", "winner", "alternatives", "clarifications", "answerResults"]);
    expect(response.body.items[0].attributes.type).toBe("greek");
    expect(response.body.items[0].match.requestedAttributes.type).toBe("greek");
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        attributeKey: "type",
        value: "greek",
        status: "applied",
        message: "Answer was applied to the optimization request.",
      },
    ]);
    expect(response.body.clarifications).toEqual([
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt flavor do you want?",
        options: ["plain", "vanilla", "strawberry"],
        attributeKey: "flavor",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt fat do you want?",
        options: ["non-fat", "low-fat", "whole"],
        attributeKey: "fat",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
        lineId: "line_0_yogurt_exact-item",
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
            questionId: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
            lineId: "line_0_coffee_exact-item",
            rawText: "coffee",
            attributeKey: "format",
            value: "pods",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.items[0].attributes.format).toBe("pods");
    expect(response.body.items[0].match.requestedAttributes.format).toBe("pods");
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        lineId: "line_0_coffee_exact-item",
        rawText: "coffee",
        attributeKey: "format",
        value: "pods",
        status: "applied",
        message: "Answer was applied to the optimization request.",
      },
    ]);
    expect(response.body.clarifications).toEqual([
      {
        id: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
        lineId: "line_0_coffee_exact-item",
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
            questionId: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
            rawText: "coffee",
            attributeKey: "format",
            value: "capsules",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.items[0].attributes.format).toBe("ground");
    expect(response.body.items[0].match.requestedAttributes.format).toBe("ground");
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        lineId: "line_0_coffee_exact-item",
        rawText: "coffee",
        attributeKey: "format",
        value: "capsules",
        status: "ignored_invalid_option",
        message: "Answer was ignored because the selected value is not a valid option for this clarification.",
      },
    ]);
    expect(response.body.clarifications).toEqual([
      {
        id: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        lineId: "line_0_coffee_exact-item",
        rawText: "coffee",
        question: "Which coffee format do you want?",
        options: ["ground", "whole-bean", "pods"],
        attributeKey: "format",
      },
      {
        id: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
        lineId: "line_0_coffee_exact-item",
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
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_wrong",
        rawText: "yogurt",
        attributeKey: "type",
        value: "greek",
        status: "ignored_unknown_question",
        message: "Answer was ignored because the clarification question was not recognized.",
      },
    ]);
    expect(response.body.clarifications).toEqual([
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt type do you want?",
        options: ["regular", "greek", "drinkable"],
        attributeKey: "type",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt flavor do you want?",
        options: ["plain", "vanilla", "strawberry"],
        attributeKey: "flavor",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt fat do you want?",
        options: ["non-fat", "low-fat", "whole"],
        attributeKey: "fat",
      },
      {
        id: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        question: "Which yogurt size do you want?",
        options: ["cup", "tub", "multi-pack"],
        attributeKey: "size",
      },
    ]);
  });

  it("returns ignored_raw_text_mismatch when the answer rawText does not match the question", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "coffee",
        clarificationAnswers: [
          {
            questionId: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
            rawText: "espresso",
            attributeKey: "format",
            value: "pods",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        lineId: "line_0_coffee_exact-item",
        rawText: "espresso",
        attributeKey: "format",
        value: "pods",
        status: "ignored_raw_text_mismatch",
        message: "Answer was ignored because it did not match the requested shopping-list line.",
      },
    ]);
    expect(response.body.items[0].attributes.format).toBe("ground");
  });

  it("returns ignored_attribute_mismatch when the answer attribute does not match the question", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "coffee",
        clarificationAnswers: [
          {
            questionId: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
            rawText: "coffee",
            attributeKey: "roast",
            value: "pods",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
        lineId: "line_0_coffee_exact-item",
        rawText: "coffee",
        attributeKey: "roast",
        value: "pods",
        status: "ignored_attribute_mismatch",
        message: "Answer was ignored because it targeted a different attribute than the clarification question.",
      },
    ]);
    expect(response.body.items[0].attributes.format).toBe("ground");
  });

  it("gives duplicate yogurt lines different lineIds and clarification ids", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({ rawInput: "yogurt\nyogurt" });

    expect(response.status).toBe(200);
    expect(response.body.clarifications).toHaveLength(8);
    expect(response.body.clarifications[0].lineId).toBe("line_0_yogurt_exact-item");
    expect(response.body.clarifications[4].lineId).toBe("line_1_yogurt_exact-item");
    expect(response.body.clarifications[0].id).toBe("cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want");
    expect(response.body.clarifications[4].id).toBe("cq_line-1-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want");
    expect(response.body.clarifications[0].id).not.toBe(response.body.clarifications[4].id);
  });

  it("answering line 0 does not resolve line 1", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "yogurt\nyogurt",
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

    expect(response.status).toBe(200);
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        attributeKey: "type",
        value: "greek",
        status: "applied",
        message: "Answer was applied to the optimization request.",
      },
    ]);
    expect(response.body.clarifications.some((question: any) => question.id === "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want")).toBe(false);
    expect(response.body.clarifications.some((question: any) => question.id === "cq_line-1-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want")).toBe(true);
  });

  it("answering line 1 does not resolve line 0", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "yogurt\nyogurt",
        clarificationAnswers: [
          {
            questionId: "cq_line-1-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
            lineId: "line_1_yogurt_exact-item",
            rawText: "yogurt",
            attributeKey: "type",
            value: "drinkable",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_line-1-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        lineId: "line_1_yogurt_exact-item",
        rawText: "yogurt",
        attributeKey: "type",
        value: "drinkable",
        status: "applied",
        message: "Answer was applied to the optimization request.",
      },
    ]);
    expect(response.body.clarifications.some((question: any) => question.id === "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want")).toBe(true);
    expect(response.body.clarifications.some((question: any) => question.id === "cq_line-1-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want")).toBe(false);
  });

  it("returns ignored_line_mismatch when lineId points at a different duplicate line", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "yogurt\nyogurt",
        clarificationAnswers: [
          {
            questionId: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
            lineId: "line_1_yogurt_exact-item",
            rawText: "yogurt",
            attributeKey: "type",
            value: "greek",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        lineId: "line_1_yogurt_exact-item",
        rawText: "yogurt",
        attributeKey: "type",
        value: "greek",
        status: "ignored_line_mismatch",
        message: "Answer was ignored because it targeted a different shopping-list line.",
      },
    ]);
  });

  it("old answers without lineId still work for duplicate lines via questionId", async () => {
    process.env.MAPLECARD_PARSER_MODE = "deterministic_only";
    process.env.MAPLECARD_CATALOG_SOURCE = "seed_bridge";

    const response = await request(app)
      .post("/api/optimize")
      .send({
        rawInput: "yogurt\nyogurt",
        clarificationAnswers: [
          {
            questionId: "cq_line-1-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
            rawText: "yogurt",
            attributeKey: "type",
            value: "greek",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.answerResults).toEqual([
      {
        questionId: "cq_line-1-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
        lineId: "line_1_yogurt_exact-item",
        rawText: "yogurt",
        attributeKey: "type",
        value: "greek",
        status: "applied",
        message: "Answer was applied to the optimization request.",
      },
    ]);
    expect(response.body.clarifications.some((question: any) => question.id === "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want")).toBe(true);
    expect(response.body.clarifications.some((question: any) => question.id === "cq_line-1-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want")).toBe(false);
  });

  it("rejects a missing rawInput", async () => {
    const response = await request(app).post("/api/optimize").send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: expect.objectContaining({
        code: "missing_raw_input",
        message: "Request body must include `rawInput`.",
      }),
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
      error: expect.objectContaining({
        code: "catalog_provider_failed",
        message: "Catalog provider is currently unavailable.",
      }),
    });

    optimizeShoppingSpy.mockRestore();
  });
});
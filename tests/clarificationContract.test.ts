import { describe, expect, it } from "vitest";
import {
  applyClarificationAnswer,
  buildInternalClarificationQuestion,
  generateClarificationQuestionId,
} from "../src/clarifications/clarificationContract";
import { generateClarificationQuestions, generateInternalClarificationQuestions } from "../src/generateClarificationQuestions";

describe("clarification contract", () => {
  it("generates deterministic question ids", () => {
    const firstId = generateClarificationQuestionId({
      lineId: "line_0_yogurt_exact-item",
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "type",
      question: "Which yogurt type do you want?",
    });
    const secondId = generateClarificationQuestionId({
      lineId: "line_0_yogurt_exact-item",
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "type",
      question: "Which yogurt type do you want?",
    });

    expect(firstId).toBe(secondId);
  });

  it("generates different ids for different attributes or questions", () => {
    const typeId = generateClarificationQuestionId({
      lineId: "line_0_yogurt_exact-item",
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "type",
      question: "Which yogurt type do you want?",
    });
    const flavorId = generateClarificationQuestionId({
      lineId: "line_0_yogurt_exact-item",
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "flavor",
      question: "Which yogurt flavor do you want?",
    });

    expect(typeId).not.toBe(flavorId);
  });

  it("builds stable internal ids for catalog-derived yogurt and coffee questions", () => {
    const questions = generateInternalClarificationQuestions([
      {
        lineId: "line_0_yogurt_exact-item",
        rawText: "yogurt",
        canonicalItemId: "seed-dairy-007",
        resolvedName: "Yogurt",
        matchConfidence: 0.78,
        usedDefault: true,
        lowConfidence: false,
        needsClarification: false,
        clarificationSuggestions: ["regular", "greek", "drinkable", "plain", "vanilla", "strawberry"],
        requestedAttributes: {},
        needsUserChoice: true,
      },
      {
        lineId: "line_1_coffee_exact-item",
        rawText: "coffee",
        canonicalItemId: "seed-beverages-001",
        resolvedName: "Coffee",
        matchConfidence: 0.78,
        usedDefault: true,
        lowConfidence: false,
        needsClarification: false,
        clarificationSuggestions: ["ground", "whole-bean", "pods", "light", "medium", "dark"],
        requestedAttributes: {},
        needsUserChoice: true,
      },
    ]);

    expect(questions.map((question) => question.id)).toEqual([
      "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
      "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
      "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
      "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
      "cq_line-1-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
      "cq_line-1-coffee-exact-item__coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
    ]);
  });

  it("applies a valid answer safely to requested attributes", () => {
    const question = buildInternalClarificationQuestion({
      lineId: "line_1_coffee_exact-item",
      rawText: "coffee",
      canonicalItemId: "seed-beverages-001",
      slug: "coffee",
      attributeKey: "format",
      question: "Which coffee format do you want?",
      options: ["ground", "whole-bean", "pods"],
    });

    const updated = applyClarificationAnswer(
      {
        lineId: "line_1_coffee_exact-item",
        rawText: "coffee",
        canonicalItemId: "seed-beverages-001",
        slug: "coffee",
        requestedAttributes: {},
        needsUserChoice: true,
      },
      question,
      {
        questionId: question.id,
        lineId: "line_1_coffee_exact-item",
        rawText: "coffee",
        canonicalItemId: "seed-beverages-001",
        slug: "coffee",
        attributeKey: "format",
        value: "pods",
      }
    );

    expect(updated).toEqual({
      lineId: "line_1_coffee_exact-item",
      rawText: "coffee",
      canonicalItemId: "seed-beverages-001",
      slug: "coffee",
      requestedAttributes: { format: "pods" },
      needsUserChoice: false,
    });
  });

  it("ignores invalid answers without corrupting requested attributes", () => {
    const question = buildInternalClarificationQuestion({
      lineId: "line_0_yogurt_exact-item",
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "type",
      question: "Which yogurt type do you want?",
      options: ["regular", "greek", "drinkable"],
    });

    const originalTarget = {
      lineId: "line_0_yogurt_exact-item",
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      requestedAttributes: { flavor: "plain" },
      needsUserChoice: true,
    };

    const updated = applyClarificationAnswer(originalTarget, question, {
      questionId: question.id,
      lineId: "line_0_yogurt_exact-item",
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "type",
      value: "alien",
    });

    expect(updated).toEqual(originalTarget);
  });

  it("exposes deterministic public clarification ids and stable legacy fields", () => {
    const questions = generateClarificationQuestions([
      {
        lineId: "line_0_coffee_exact-item",
        rawText: "coffee",
        canonicalItemId: "seed-beverages-001",
        resolvedName: "Coffee",
        matchConfidence: 0.78,
        usedDefault: true,
        lowConfidence: false,
        needsClarification: false,
        clarificationSuggestions: ["ground", "whole-bean", "pods", "light", "medium", "dark"],
        requestedAttributes: {},
        needsUserChoice: true,
      },
    ]);

    expect(questions).toEqual([
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
    expect(Object.keys(questions[0])).toEqual(["id", "lineId", "rawText", "question", "options", "attributeKey"]);
  });

  it("builds stable public ids for fallback clarifications", () => {
    const firstQuestions = generateClarificationQuestions([
      {
        lineId: "line_0_milk_exact-item",
        rawText: "milk",
        canonicalItemId: "item-1",
        resolvedName: "Milk",
        matchConfidence: 0.5,
        usedDefault: false,
        lowConfidence: true,
        needsClarification: true,
        clarificationSuggestions: ["fat must be one of: skim, 1%, 2%, whole"],
        requestedAttributes: {},
      },
    ]);
    const secondQuestions = generateClarificationQuestions([
      {
        lineId: "line_0_milk_exact-item",
        rawText: "milk",
        canonicalItemId: "item-1",
        resolvedName: "Milk",
        matchConfidence: 0.5,
        usedDefault: false,
        lowConfidence: true,
        needsClarification: true,
        clarificationSuggestions: ["fat must be one of: skim, 1%, 2%, whole"],
        requestedAttributes: {},
      },
    ]);

    expect(firstQuestions).toEqual(secondQuestions);
    expect(firstQuestions).toEqual([
      {
        id: "cq_line-0-milk-exact-item__milk__item-1__na__fat__which-milk-fat-level-do-you-want",
        lineId: "line_0_milk_exact-item",
        rawText: "milk",
        question: "Which milk fat level do you want?",
        options: ["skim", "1%", "2%", "whole"],
        attributeKey: "fat",
      },
    ]);
  });
});

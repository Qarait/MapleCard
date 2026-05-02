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
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "type",
      question: "Which yogurt type do you want?",
    });
    const secondId = generateClarificationQuestionId({
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
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "type",
      question: "Which yogurt type do you want?",
    });
    const flavorId = generateClarificationQuestionId({
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
      "cq_yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
      "cq_yogurt__seed-dairy-007__yogurt__flavor__which-yogurt-flavor-do-you-want",
      "cq_yogurt__seed-dairy-007__yogurt__fat__which-yogurt-fat-do-you-want",
      "cq_yogurt__seed-dairy-007__yogurt__size__which-yogurt-size-do-you-want",
      "cq_coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
      "cq_coffee__seed-beverages-001__coffee__roast__which-coffee-roast-do-you-want",
    ]);
  });

  it("applies a valid answer safely to requested attributes", () => {
    const question = buildInternalClarificationQuestion({
      rawText: "coffee",
      canonicalItemId: "seed-beverages-001",
      slug: "coffee",
      attributeKey: "format",
      question: "Which coffee format do you want?",
      options: ["ground", "whole-bean", "pods"],
    });

    const updated = applyClarificationAnswer(
      {
        rawText: "coffee",
        canonicalItemId: "seed-beverages-001",
        slug: "coffee",
        requestedAttributes: {},
        needsUserChoice: true,
      },
      question,
      {
        questionId: question.id,
        rawText: "coffee",
        canonicalItemId: "seed-beverages-001",
        slug: "coffee",
        attributeKey: "format",
        value: "pods",
      }
    );

    expect(updated).toEqual({
      rawText: "coffee",
      canonicalItemId: "seed-beverages-001",
      slug: "coffee",
      requestedAttributes: { format: "pods" },
      needsUserChoice: false,
    });
  });

  it("ignores invalid answers without corrupting requested attributes", () => {
    const question = buildInternalClarificationQuestion({
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "type",
      question: "Which yogurt type do you want?",
      options: ["regular", "greek", "drinkable"],
    });

    const originalTarget = {
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      requestedAttributes: { flavor: "plain" },
      needsUserChoice: true,
    };

    const updated = applyClarificationAnswer(originalTarget, question, {
      questionId: question.id,
      rawText: "yogurt",
      canonicalItemId: "seed-dairy-007",
      slug: "yogurt",
      attributeKey: "type",
      value: "alien",
    });

    expect(updated).toEqual(originalTarget);
  });

  it("keeps the public clarification shape unchanged", () => {
    const questions = generateClarificationQuestions([
      {
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
      { rawText: "coffee", question: "Which coffee format do you want?", options: ["ground", "whole-bean", "pods"] },
      { rawText: "coffee", question: "Which coffee roast do you want?", options: ["light", "medium", "dark"] },
    ]);
    expect(Object.keys(questions[0])).toEqual(["rawText", "question", "options"]);
  });
});

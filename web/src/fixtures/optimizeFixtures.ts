import type {
  ClarificationAnswer,
  ClarificationQuestion,
  OptimizeRequest,
  OptimizeResponse,
  ParsedItem,
  StoreSelection,
} from "../types/api";

function createStore(retailerKey: string, subtotal: number, etaMin: number | null, score: number, reason: string): StoreSelection {
  return {
    provider: "synthetic",
    retailerKey,
    subtotal,
    etaMin,
    coverageRatio: 1,
    avgMatchConfidence: 0.96,
    score,
    reason,
  };
}

function createItem(args: {
  rawText: string;
  canonicalQuery: string;
  canonicalItemId: string;
  canonicalName: string;
  attributes?: Record<string, unknown>;
  needsUserChoice?: boolean;
}): ParsedItem {
  const attributes = args.attributes ?? {};

  return {
    rawText: args.rawText,
    lineType: "exact_item",
    canonicalQuery: args.canonicalQuery,
    attributes,
    suggestions: [],
    needsUserChoice: args.needsUserChoice ?? false,
    confidence: 0.95,
    match: {
      canonicalItemId: args.canonicalItemId,
      canonicalName: args.canonicalName,
      requestedAttributes: attributes,
    },
  };
}

function createYogurtClarifications(lineIndex: number): ClarificationQuestion[] {
  const lineId = `line_${lineIndex}_yogurt_exact-item`;
  const idPrefix = `cq_line-${lineIndex}-yogurt-exact-item__yogurt__seed-dairy-007__yogurt`;

  return [
    {
      id: `${idPrefix}__type__which-yogurt-type-do-you-want`,
      lineId,
      rawText: "yogurt",
      question: "Which yogurt type do you want?",
      options: ["regular", "greek", "drinkable"],
      attributeKey: "type",
    },
    {
      id: `${idPrefix}__flavor__which-yogurt-flavor-do-you-want`,
      lineId,
      rawText: "yogurt",
      question: "Which yogurt flavor do you want?",
      options: ["plain", "vanilla", "strawberry"],
      attributeKey: "flavor",
    },
    {
      id: `${idPrefix}__fat__which-yogurt-fat-do-you-want`,
      lineId,
      rawText: "yogurt",
      question: "Which yogurt fat do you want?",
      options: ["non-fat", "low-fat", "whole"],
      attributeKey: "fat",
    },
    {
      id: `${idPrefix}__size__which-yogurt-size-do-you-want`,
      lineId,
      rawText: "yogurt",
      question: "Which yogurt size do you want?",
      options: ["cup", "tub", "multi-pack"],
      attributeKey: "size",
    },
  ];
}

function createCoffeeClarifications(): ClarificationQuestion[] {
  return [
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
  ];
}

function matchesAnswer(answer: ClarificationAnswer | undefined, expected: Partial<ClarificationAnswer>): boolean {
  if (!answer) return false;
  return Object.entries(expected).every(([key, value]) => (answer as Record<string, unknown>)[key] === value);
}

const winner = createStore("freshmart", 18.25, 25, 0.91, "Best overall score");
const alternative = createStore("budgetfoods", 19.6, 35, 0.81, "Lower score because of price and ETA");

export const optimizeFixtures = {
  rawYogurtRequest: {
    request: { rawInput: "yogurt" } satisfies OptimizeRequest,
    response: {
      items: [createItem({ rawText: "yogurt", canonicalQuery: "yogurt", canonicalItemId: "seed-dairy-007", canonicalName: "yogurt", needsUserChoice: true })],
      winner,
      alternatives: [alternative],
      clarifications: createYogurtClarifications(0),
    } satisfies OptimizeResponse,
  },
  yogurtWithAnswer: {
    request: {
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
    } satisfies OptimizeRequest,
    response: {
      items: [createItem({ rawText: "yogurt", canonicalQuery: "yogurt", canonicalItemId: "seed-dairy-007", canonicalName: "yogurt", attributes: { type: "greek" }, needsUserChoice: true })],
      winner,
      alternatives: [alternative],
      clarifications: createYogurtClarifications(0).filter((question) => question.attributeKey !== "type"),
      answerResults: [
        {
          questionId: "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
          lineId: "line_0_yogurt_exact-item",
          rawText: "yogurt",
          attributeKey: "type",
          value: "greek",
          status: "applied",
          message: "Answer was applied to the optimization request.",
        },
      ],
    } satisfies OptimizeResponse,
  },
  duplicateYogurtLines: {
    request: { rawInput: "yogurt\nyogurt" } satisfies OptimizeRequest,
    response: {
      items: [
        createItem({ rawText: "yogurt", canonicalQuery: "yogurt", canonicalItemId: "seed-dairy-007", canonicalName: "yogurt", needsUserChoice: true }),
        createItem({ rawText: "yogurt", canonicalQuery: "yogurt", canonicalItemId: "seed-dairy-007", canonicalName: "yogurt", needsUserChoice: true }),
      ],
      winner,
      alternatives: [alternative],
      clarifications: [...createYogurtClarifications(0), ...createYogurtClarifications(1)],
    } satisfies OptimizeResponse,
  },
  coffeeWithAnswer: {
    request: {
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
    } satisfies OptimizeRequest,
    response: {
      items: [createItem({ rawText: "coffee", canonicalQuery: "coffee", canonicalItemId: "seed-beverages-001", canonicalName: "coffee", attributes: { format: "pods" }, needsUserChoice: true })],
      winner,
      alternatives: [alternative],
      clarifications: createCoffeeClarifications().filter((question) => question.attributeKey !== "format"),
      answerResults: [
        {
          questionId: "cq_line-0-coffee-exact-item__coffee__seed-beverages-001__coffee__format__which-coffee-format-do-you-want",
          lineId: "line_0_coffee_exact-item",
          rawText: "coffee",
          attributeKey: "format",
          value: "pods",
          status: "applied",
          message: "Answer was applied to the optimization request.",
        },
      ],
    } satisfies OptimizeResponse,
  },
  normalGroceryList: {
    request: { rawInput: "2% milk\neggs\nbanana\nrice" } satisfies OptimizeRequest,
    response: {
      items: [
        createItem({ rawText: "2% milk", canonicalQuery: "milk", canonicalItemId: "milk-001", canonicalName: "milk", attributes: { fat: "2%" } }),
        createItem({ rawText: "eggs", canonicalQuery: "eggs", canonicalItemId: "eggs-001", canonicalName: "eggs" }),
        createItem({ rawText: "banana", canonicalQuery: "banana", canonicalItemId: "banana-001", canonicalName: "banana" }),
        createItem({ rawText: "rice", canonicalQuery: "rice", canonicalItemId: "rice-001", canonicalName: "rice" }),
      ],
      winner,
      alternatives: [alternative],
      clarifications: [],
    } satisfies OptimizeResponse,
  },
};

export function getFixtureOptimizeResponse(request: OptimizeRequest): OptimizeResponse {
  const normalizedInput = request.rawInput.trim();
  const firstAnswer = request.clarificationAnswers?.[0];

  if (normalizedInput === optimizeFixtures.normalGroceryList.request.rawInput) {
    return optimizeFixtures.normalGroceryList.response;
  }

  if (normalizedInput === optimizeFixtures.duplicateYogurtLines.request.rawInput) {
    return optimizeFixtures.duplicateYogurtLines.response;
  }

  if (normalizedInput === "yogurt") {
    if (
      matchesAnswer(firstAnswer, {
        questionId: optimizeFixtures.yogurtWithAnswer.request.clarificationAnswers?.[0].questionId,
        lineId: optimizeFixtures.yogurtWithAnswer.request.clarificationAnswers?.[0].lineId,
        rawText: "yogurt",
        attributeKey: "type",
        value: "greek",
      })
    ) {
      return optimizeFixtures.yogurtWithAnswer.response;
    }

    return optimizeFixtures.rawYogurtRequest.response;
  }

  if (normalizedInput === "coffee") {
    if (
      matchesAnswer(firstAnswer, {
        questionId: optimizeFixtures.coffeeWithAnswer.request.clarificationAnswers?.[0].questionId,
        lineId: optimizeFixtures.coffeeWithAnswer.request.clarificationAnswers?.[0].lineId,
        rawText: "coffee",
        attributeKey: "format",
        value: "pods",
      })
    ) {
      return optimizeFixtures.coffeeWithAnswer.response;
    }

    return {
      items: [createItem({ rawText: "coffee", canonicalQuery: "coffee", canonicalItemId: "seed-beverages-001", canonicalName: "coffee", needsUserChoice: true })],
      winner,
      alternatives: [alternative],
      clarifications: createCoffeeClarifications(),
    } satisfies OptimizeResponse;
  }

  return {
    items: [],
    winner,
    alternatives: [alternative],
    clarifications: [],
    answerResults: request.clarificationAnswers?.map((answer) => ({
      ...answer,
      status: "ignored_unknown_question" as const,
      message: "Fixture mode did not recognize this clarification payload.",
    })),
  } satisfies OptimizeResponse;
}
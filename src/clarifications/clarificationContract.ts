import type { CatalogClarificationQuestionCandidate } from "../catalog/catalogLookup";

export type ClarificationQuestionId = string;

export type InternalClarificationQuestion = {
  id: ClarificationQuestionId;
  lineId: string;
  rawText: string;
  canonicalItemId?: string;
  slug?: string;
  attributeKey?: string;
  question: string;
  options: string[];
};

export type ClarificationAnswerValue = string | number | boolean;

export type ClarificationAnswerPayload = {
  questionId: ClarificationQuestionId;
  lineId?: string;
  rawText: string;
  canonicalItemId?: string;
  slug?: string;
  attributeKey?: string;
  value: ClarificationAnswerValue;
};

export type ClarificationAnswerStatus =
  | "applied"
  | "ignored_unknown_question"
  | "ignored_line_mismatch"
  | "ignored_raw_text_mismatch"
  | "ignored_attribute_mismatch"
  | "ignored_invalid_option"
  | "ignored_unsupported_attribute";

export type ClarificationAnswerResult = {
  questionId: ClarificationQuestionId;
  lineId?: string;
  rawText: string;
  attributeKey?: string;
  value: string;
  status: ClarificationAnswerStatus;
  message: string;
};

export type ClarificationAnswerTarget = {
  lineId: string;
  rawText: string;
  canonicalItemId?: string;
  slug?: string;
  requestedAttributes: Record<string, unknown>;
  needsUserChoice: boolean;
};

function normalizeQuestionIdPart(value: string | undefined): string {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "na";
}

function normalizeAnswerValue(value: ClarificationAnswerValue): string {
  return String(value).trim().toLowerCase();
}

function buildClarificationAnswerResult(args: {
  questionId: ClarificationQuestionId;
  lineId?: string;
  rawText: string;
  attributeKey?: string;
  value: ClarificationAnswerValue;
  status: ClarificationAnswerStatus;
  message: string;
}): ClarificationAnswerResult {
  return {
    questionId: args.questionId,
    ...(args.lineId ? { lineId: args.lineId } : {}),
    rawText: args.rawText,
    ...(args.attributeKey ? { attributeKey: args.attributeKey } : {}),
    value: String(args.value),
    status: args.status,
    message: args.message,
  };
}

export function generateClarificationQuestionId(args: {
  lineId: string;
  rawText: string;
  canonicalItemId?: string;
  slug?: string;
  attributeKey?: string;
  question: string;
}): ClarificationQuestionId {
  const parts = [
    normalizeQuestionIdPart(args.lineId),
    normalizeQuestionIdPart(args.rawText),
    normalizeQuestionIdPart(args.canonicalItemId),
    normalizeQuestionIdPart(args.slug),
    normalizeQuestionIdPart(args.attributeKey),
    normalizeQuestionIdPart(args.question),
  ];

  return `cq_${parts.join("__")}`;
}

export function buildInternalClarificationQuestion(args: {
  lineId: string;
  rawText: string;
  canonicalItemId?: string;
  slug?: string;
  attributeKey?: string;
  question: string;
  options: string[];
}): InternalClarificationQuestion {
  return {
    id: generateClarificationQuestionId(args),
    lineId: args.lineId,
    rawText: args.rawText,
    canonicalItemId: args.canonicalItemId,
    slug: args.slug,
    attributeKey: args.attributeKey,
    question: args.question,
    options: args.options,
  };
}

export function buildInternalCatalogClarificationQuestions(args: {
  lineId: string;
  rawText: string;
  canonicalItemId?: string;
  candidates: CatalogClarificationQuestionCandidate[];
}): InternalClarificationQuestion[] {
  return args.candidates.map((candidate) =>
    buildInternalClarificationQuestion({
      lineId: args.lineId,
      rawText: args.rawText,
      canonicalItemId: args.canonicalItemId ?? candidate.canonicalItemId,
      slug: candidate.slug,
      attributeKey: candidate.attributeKey,
      question: candidate.question,
      options: candidate.options,
    })
  );
}

export function applyClarificationAnswer(
  target: ClarificationAnswerTarget,
  question: InternalClarificationQuestion,
  answer: ClarificationAnswerPayload
): ClarificationAnswerTarget {
  return applyClarificationAnswerWithStatus(target, question, answer).target;
}

export function applyClarificationAnswerWithStatus(
  target: ClarificationAnswerTarget,
  question: InternalClarificationQuestion,
  answer: ClarificationAnswerPayload
): { target: ClarificationAnswerTarget; result: ClarificationAnswerResult } {
  if (!question.attributeKey) {
    return {
      target,
      result: buildClarificationAnswerResult({
        questionId: answer.questionId,
        lineId: answer.lineId,
        rawText: answer.rawText,
        attributeKey: answer.attributeKey,
        value: answer.value,
        status: "ignored_unsupported_attribute",
        message: "Answer was ignored because this clarification does not support attribute updates.",
      }),
    };
  }
  if (answer.questionId !== question.id) {
    return {
      target,
      result: buildClarificationAnswerResult({
        questionId: answer.questionId,
        lineId: answer.lineId ?? question.lineId,
        rawText: answer.rawText,
        attributeKey: answer.attributeKey ?? question.attributeKey,
        value: answer.value,
        status: "ignored_unknown_question",
        message: "Answer was ignored because the clarification question was not recognized.",
      }),
    };
  }
  if (answer.lineId && answer.lineId !== question.lineId) {
    return {
      target,
      result: buildClarificationAnswerResult({
        questionId: answer.questionId,
        lineId: answer.lineId,
        rawText: answer.rawText,
        attributeKey: answer.attributeKey ?? question.attributeKey,
        value: answer.value,
        status: "ignored_line_mismatch",
        message: "Answer was ignored because it targeted a different shopping-list line.",
      }),
    };
  }
  if (answer.rawText !== question.rawText || target.rawText !== question.rawText) {
    return {
      target,
      result: buildClarificationAnswerResult({
        questionId: answer.questionId,
        lineId: answer.lineId ?? question.lineId,
        rawText: answer.rawText,
        attributeKey: answer.attributeKey ?? question.attributeKey,
        value: answer.value,
        status: "ignored_raw_text_mismatch",
        message: "Answer was ignored because it did not match the requested shopping-list line.",
      }),
    };
  }

  if (answer.attributeKey && answer.attributeKey !== question.attributeKey) {
    return {
      target,
      result: buildClarificationAnswerResult({
        questionId: answer.questionId,
        lineId: answer.lineId ?? question.lineId,
        rawText: answer.rawText,
        attributeKey: answer.attributeKey,
        value: answer.value,
        status: "ignored_attribute_mismatch",
        message: "Answer was ignored because it targeted a different attribute than the clarification question.",
      }),
    };
  }
  if (answer.canonicalItemId && question.canonicalItemId && answer.canonicalItemId !== question.canonicalItemId) {
    return {
      target,
      result: buildClarificationAnswerResult({
        questionId: answer.questionId,
        lineId: answer.lineId ?? question.lineId,
        rawText: answer.rawText,
        attributeKey: answer.attributeKey ?? question.attributeKey,
        value: answer.value,
        status: "ignored_unknown_question",
        message: "Answer was ignored because the clarification question was not recognized.",
      }),
    };
  }
  if (answer.slug && question.slug && answer.slug !== question.slug) {
    return {
      target,
      result: buildClarificationAnswerResult({
        questionId: answer.questionId,
        lineId: answer.lineId ?? question.lineId,
        rawText: answer.rawText,
        attributeKey: answer.attributeKey ?? question.attributeKey,
        value: answer.value,
        status: "ignored_unknown_question",
        message: "Answer was ignored because the clarification question was not recognized.",
      }),
    };
  }

  const normalizedValue = normalizeAnswerValue(answer.value);
  const optionAllowed = question.options.some((option) => normalizeAnswerValue(option) === normalizedValue);
  if (!optionAllowed) {
    return {
      target,
      result: buildClarificationAnswerResult({
        questionId: answer.questionId,
        lineId: answer.lineId ?? question.lineId,
        rawText: answer.rawText,
        attributeKey: answer.attributeKey ?? question.attributeKey,
        value: answer.value,
        status: "ignored_invalid_option",
        message: "Answer was ignored because the selected value is not a valid option for this clarification.",
      }),
    };
  }

  return {
    target: {
      ...target,
      canonicalItemId: target.canonicalItemId ?? question.canonicalItemId,
      slug: target.slug ?? question.slug,
      requestedAttributes: {
        ...target.requestedAttributes,
        [question.attributeKey]: answer.value,
      },
      needsUserChoice: false,
    },
    result: buildClarificationAnswerResult({
      questionId: answer.questionId,
      lineId: question.lineId,
      rawText: answer.rawText,
      attributeKey: question.attributeKey,
      value: answer.value,
      status: "applied",
      message: "Answer was applied to the optimization request.",
    }),
  };
}

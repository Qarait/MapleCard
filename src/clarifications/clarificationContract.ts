import type { CatalogClarificationQuestionCandidate } from "../catalog/catalogLookup";

export type ClarificationQuestionId = string;

export type InternalClarificationQuestion = {
  id: ClarificationQuestionId;
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
  rawText: string;
  canonicalItemId?: string;
  slug?: string;
  attributeKey?: string;
  value: ClarificationAnswerValue;
};

export type ClarificationAnswerTarget = {
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

export function generateClarificationQuestionId(args: {
  rawText: string;
  canonicalItemId?: string;
  slug?: string;
  attributeKey?: string;
  question: string;
}): ClarificationQuestionId {
  const parts = [
    normalizeQuestionIdPart(args.rawText),
    normalizeQuestionIdPart(args.canonicalItemId),
    normalizeQuestionIdPart(args.slug),
    normalizeQuestionIdPart(args.attributeKey),
    normalizeQuestionIdPart(args.question),
  ];

  return `cq_${parts.join("__")}`;
}

export function buildInternalClarificationQuestion(args: {
  rawText: string;
  canonicalItemId?: string;
  slug?: string;
  attributeKey?: string;
  question: string;
  options: string[];
}): InternalClarificationQuestion {
  return {
    id: generateClarificationQuestionId(args),
    rawText: args.rawText,
    canonicalItemId: args.canonicalItemId,
    slug: args.slug,
    attributeKey: args.attributeKey,
    question: args.question,
    options: args.options,
  };
}

export function buildInternalCatalogClarificationQuestions(args: {
  rawText: string;
  canonicalItemId?: string;
  candidates: CatalogClarificationQuestionCandidate[];
}): InternalClarificationQuestion[] {
  return args.candidates.map((candidate) =>
    buildInternalClarificationQuestion({
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
  if (!question.attributeKey) return target;
  if (answer.questionId !== question.id) return target;
  if (answer.rawText !== question.rawText || target.rawText !== question.rawText) return target;

  if (answer.attributeKey && answer.attributeKey !== question.attributeKey) return target;
  if (answer.canonicalItemId && question.canonicalItemId && answer.canonicalItemId !== question.canonicalItemId) return target;
  if (answer.slug && question.slug && answer.slug !== question.slug) return target;

  const normalizedValue = normalizeAnswerValue(answer.value);
  const optionAllowed = question.options.some((option) => normalizeAnswerValue(option) === normalizedValue);
  if (!optionAllowed) return target;

  return {
    ...target,
    canonicalItemId: target.canonicalItemId ?? question.canonicalItemId,
    slug: target.slug ?? question.slug,
    requestedAttributes: {
      ...target.requestedAttributes,
      [question.attributeKey]: answer.value,
    },
    needsUserChoice: false,
  };
}

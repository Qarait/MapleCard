export type ClarificationAnswer = {
  questionId: string;
  lineId?: string;
  rawText: string;
  attributeKey?: string;
  value: string;
};

export type OptimizeRequest = {
  rawInput: string;
  clarificationAnswers?: ClarificationAnswer[];
};

export type ClarificationQuestion = {
  id: string;
  lineId: string;
  rawText: string;
  question: string;
  options: string[];
  attributeKey?: string;
};

export type AnswerResult = {
  questionId: string;
  lineId?: string;
  rawText: string;
  attributeKey?: string;
  value: string;
  status:
    | "applied"
    | "ignored_unknown_question"
    | "ignored_line_mismatch"
    | "ignored_raw_text_mismatch"
    | "ignored_attribute_mismatch"
    | "ignored_invalid_option"
    | "ignored_unsupported_attribute";
  message: string;
};

export type StoreSelection = {
  provider: string;
  retailerKey: string;
  subtotal: number;
  etaMin: number | null;
  coverageRatio: number;
  avgMatchConfidence: number;
  score: number;
  reason: string;
};

export type ParsedItem = {
  rawText: string;
  lineType: "exact_item" | "category_request" | "meal_intent" | "unknown";
  canonicalQuery: string;
  quantity?: { value?: number; unit?: string };
  attributes: Record<string, unknown>;
  suggestions: string[];
  needsUserChoice: boolean;
  confidence: number;
  match: {
    canonicalItemId: string;
    canonicalName?: string;
    requestedAttributes: Record<string, unknown>;
  };
};

export type OptimizeResponse = {
  items: ParsedItem[];
  winner: StoreSelection;
  alternatives: StoreSelection[];
  clarifications: ClarificationQuestion[];
  answerResults?: AnswerResult[];
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
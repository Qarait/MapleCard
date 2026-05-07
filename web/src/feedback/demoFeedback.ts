import type { ApiMode } from "../api/optimizeClient";
import type { AnswerResult, ClarificationAnswer, ClarificationQuestion, OptimizeResponse } from "../types/api";

export type DemoFeedbackOptions = {
  includeRawInput?: boolean;
};

export type DemoFeedbackContext = {
  rawInput: string;
  frontendMode: ApiMode;
  backendBaseUrl?: string;
  response: OptimizeResponse | null;
  clarificationAnswers: ClarificationAnswer[];
  currentVisibleErrorMessage?: string;
  requestId?: string;
  errorId?: string;
  appName?: string;
  environmentLabel?: string;
  currentUrl?: string;
  browserUserAgent?: string;
};

export type DemoFeedbackPayload = {
  generatedAt: string;
  appName: string;
  environmentLabel: string;
  frontendMode: ApiMode;
  backendBaseUrlOrigin?: string;
  requestId?: string;
  errorId?: string;
  answerResultStatuses?: AnswerResult["status"][];
  parsedItemCount: number;
  clarificationQuestionCount: number;
  duplicateLineIdsPresent: boolean;
  lastSafeFrontendErrorMessage?: string;
  browserUserAgent?: string;
  currentUrl?: string;
  rawInputIncluded: boolean;
  rawInputLineCount?: number;
  rawInputCharCount?: number;
  rawInput?: string;
};

function getSafeBrowserUserAgent(explicitUserAgent?: string): string | undefined {
  if (explicitUserAgent) {
    return explicitUserAgent;
  }

  return typeof navigator !== "undefined" ? navigator.userAgent : undefined;
}

function getSafeCurrentUrl(explicitCurrentUrl?: string): string | undefined {
  if (explicitCurrentUrl) {
    return explicitCurrentUrl;
  }

  return typeof window !== "undefined" ? window.location.href : undefined;
}

function getSafeBaseUrlOrigin(backendBaseUrl?: string): string | undefined {
  if (!backendBaseUrl) {
    return undefined;
  }

  try {
    return new URL(backendBaseUrl).origin;
  } catch {
    return undefined;
  }
}

function getRawInputLineCount(rawInput: string): number {
  const trimmedInput = rawInput.trim();
  return trimmedInput.length === 0 ? 0 : trimmedInput.split(/\r?\n/).length;
}

function collectLineIdPresence(
  rawTextToLineIds: Map<string, Set<string>>,
  entries: Array<Pick<ClarificationQuestion, "rawText" | "lineId"> | Pick<ClarificationAnswer, "rawText" | "lineId">>
): void {
  for (const entry of entries) {
    if (!entry.lineId) {
      continue;
    }

    const existingLineIds = rawTextToLineIds.get(entry.rawText) ?? new Set<string>();
    existingLineIds.add(entry.lineId);
    rawTextToLineIds.set(entry.rawText, existingLineIds);
  }
}

function hasDuplicateLineIds(
  response: OptimizeResponse | null,
  clarificationAnswers: ClarificationAnswer[]
): boolean {
  const rawTextToLineIds = new Map<string, Set<string>>();

  collectLineIdPresence(rawTextToLineIds, response?.clarifications ?? []);
  collectLineIdPresence(rawTextToLineIds, response?.answerResults ?? []);
  collectLineIdPresence(rawTextToLineIds, clarificationAnswers);

  return Array.from(rawTextToLineIds.values()).some((lineIds) => lineIds.size > 1);
}

export function buildDemoFeedbackPayload(
  context: DemoFeedbackContext,
  options: DemoFeedbackOptions = {}
): DemoFeedbackPayload {
  const includeRawInput = options.includeRawInput ?? false;

  const payload: DemoFeedbackPayload = {
    generatedAt: new Date().toISOString(),
    appName: context.appName ?? "MapleCard",
    environmentLabel: context.environmentLabel ?? "staging-demo",
    frontendMode: context.frontendMode,
    ...(getSafeBaseUrlOrigin(context.backendBaseUrl) ? { backendBaseUrlOrigin: getSafeBaseUrlOrigin(context.backendBaseUrl) } : {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.errorId ? { errorId: context.errorId } : {}),
    ...(context.response?.answerResults?.length
      ? { answerResultStatuses: context.response.answerResults.map((result) => result.status) }
      : {}),
    parsedItemCount: context.response?.items.length ?? 0,
    clarificationQuestionCount: context.response?.clarifications.length ?? 0,
    duplicateLineIdsPresent: hasDuplicateLineIds(context.response, context.clarificationAnswers),
    ...(context.currentVisibleErrorMessage
      ? { lastSafeFrontendErrorMessage: context.currentVisibleErrorMessage }
      : {}),
    ...(getSafeBrowserUserAgent(context.browserUserAgent)
      ? { browserUserAgent: getSafeBrowserUserAgent(context.browserUserAgent) }
      : {}),
    ...(getSafeCurrentUrl(context.currentUrl) ? { currentUrl: getSafeCurrentUrl(context.currentUrl) } : {}),
    rawInputIncluded: includeRawInput,
  };

  if (includeRawInput) {
    payload.rawInput = context.rawInput;
    return payload;
  }

  payload.rawInputLineCount = getRawInputLineCount(context.rawInput);
  payload.rawInputCharCount = context.rawInput.length;
  return payload;
}

export function formatDemoFeedbackReport(payload: DemoFeedbackPayload): string {
  return ["MapleCard Demo Feedback Report", JSON.stringify(payload, null, 2)].join("\n\n");
}
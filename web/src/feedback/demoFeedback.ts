import type { ApiMode } from "../api/optimizeClient";
import type { AnswerResult, ClarificationAnswer, OptimizeResponse } from "../types/api";

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
  duplicateRawLinesPresent: boolean;
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

function hasDuplicateShoppingListLines(rawInput: string): boolean {
  const normalizedLines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0);

  const seenLines = new Set<string>();

  for (const line of normalizedLines) {
    if (seenLines.has(line)) {
      return true;
    }

    seenLines.add(line);
  }

  return false;
}

function getNormalizedDuplicateRawLines(rawInput: string): Map<string, number> {
  const duplicateCounts = new Map<string, number>();

  for (const line of rawInput.split(/\r?\n/)) {
    const normalizedLine = line.trim().toLowerCase();

    if (!normalizedLine) {
      continue;
    }

    duplicateCounts.set(normalizedLine, (duplicateCounts.get(normalizedLine) ?? 0) + 1);
  }

  for (const [line, count] of duplicateCounts.entries()) {
    if (count < 2) {
      duplicateCounts.delete(line);
    }
  }

  return duplicateCounts;
}

function collectDistinctLineIdsByRawText(
  rawTextToLineIds: Map<string, Set<string>>,
  entries: Array<Pick<ClarificationAnswer, "rawText" | "lineId">>
): void {
  for (const entry of entries) {
    const normalizedRawText = entry.rawText.trim().toLowerCase();

    if (!normalizedRawText || !entry.lineId) {
      continue;
    }

    const lineIds = rawTextToLineIds.get(normalizedRawText) ?? new Set<string>();
    lineIds.add(entry.lineId);
    rawTextToLineIds.set(normalizedRawText, lineIds);
  }
}

function hasDuplicateLineIds(response: OptimizeResponse | null, clarificationAnswers: ClarificationAnswer[], rawInput: string): boolean {
  const duplicateRawLines = getNormalizedDuplicateRawLines(rawInput);

  if (duplicateRawLines.size === 0) {
    return false;
  }

  const rawTextToLineIds = new Map<string, Set<string>>();

  collectDistinctLineIdsByRawText(rawTextToLineIds, response?.clarifications ?? []);
  collectDistinctLineIdsByRawText(rawTextToLineIds, response?.answerResults ?? []);
  collectDistinctLineIdsByRawText(rawTextToLineIds, clarificationAnswers);

  for (const [normalizedRawText, duplicateCount] of duplicateRawLines.entries()) {
    const distinctLineIdCount = rawTextToLineIds.get(normalizedRawText)?.size ?? 0;

    if (distinctLineIdCount > 0 && distinctLineIdCount < duplicateCount) {
      return true;
    }
  }

  return false;
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
    duplicateRawLinesPresent: hasDuplicateShoppingListLines(context.rawInput),
    duplicateLineIdsPresent: hasDuplicateLineIds(context.response, context.clarificationAnswers, context.rawInput),
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
import { describe, expect, it } from "vitest";
import { buildDemoFeedbackPayload, formatDemoFeedbackReport } from "./demoFeedback";

describe("demo feedback helper", () => {
  it("excludes raw shopping text by default while keeping safe counts", () => {
    const payload = buildDemoFeedbackPayload({
      rawInput: "milk\neggs",
      frontendMode: "backend",
      backendBaseUrl: "https://maplecard-production.up.railway.app/api",
      response: {
        items: [],
        winner: {
          provider: "synthetic",
          retailerKey: "freshmart",
          subtotal: 12,
          etaMin: 20,
          coverageRatio: 1,
          avgMatchConfidence: 1,
          score: 0.91,
          reason: "best fit",
        },
        alternatives: [],
        clarifications: [],
      },
      clarificationAnswers: [],
      currentVisibleErrorMessage: "Temporary issue",
      requestId: "req_123",
      errorId: "err_123",
      currentUrl: "https://maple-card.vercel.app/",
      browserUserAgent: "unit-test-agent",
    });

    expect(payload.rawInputIncluded).toBe(false);
    expect(payload).not.toHaveProperty("rawInput");
    expect(payload.rawInputLineCount).toBe(2);
    expect(payload.rawInputCharCount).toBe(9);
    expect(payload.backendBaseUrlOrigin).toBe("https://maplecard-production.up.railway.app");
    expect(payload.requestId).toBe("req_123");
    expect(payload.errorId).toBe("err_123");
    expect(payload.lastSafeFrontendErrorMessage).toBe("Temporary issue");
  });

  it("includes raw shopping text only when explicitly requested", () => {
    const payload = buildDemoFeedbackPayload(
      {
        rawInput: "yogurt\nyogurt",
        frontendMode: "fixture",
        backendBaseUrl: "http://localhost:3000",
        response: {
          items: [],
          winner: {
            provider: "synthetic",
            retailerKey: "freshmart",
            subtotal: 12,
            etaMin: 20,
            coverageRatio: 1,
            avgMatchConfidence: 1,
            score: 0.91,
            reason: "best fit",
          },
          alternatives: [],
          clarifications: [
            {
              id: "q1",
              lineId: "line_0_yogurt_exact-item",
              rawText: "yogurt",
              question: "Which yogurt type do you want?",
              options: ["regular", "greek"],
              attributeKey: "type",
            },
            {
              id: "q2",
              lineId: "line_1_yogurt_exact-item",
              rawText: "yogurt",
              question: "Which yogurt flavor do you want?",
              options: ["plain", "vanilla"],
              attributeKey: "flavor",
            },
          ],
          answerResults: [
            {
              questionId: "q1",
              lineId: "line_0_yogurt_exact-item",
              rawText: "yogurt",
              attributeKey: "type",
              value: "greek",
              status: "applied",
              message: "Applied.",
            },
          ],
        },
        clarificationAnswers: [
          {
            questionId: "q1",
            lineId: "line_0_yogurt_exact-item",
            rawText: "yogurt",
            attributeKey: "type",
            value: "greek",
          },
        ],
        currentUrl: "https://maple-card.vercel.app/",
        browserUserAgent: "unit-test-agent",
      },
      { includeRawInput: true }
    );

    expect(payload.rawInputIncluded).toBe(true);
    expect(payload.rawInput).toBe("yogurt\nyogurt");
    expect(payload).not.toHaveProperty("rawInputLineCount");
    expect(payload.duplicateRawLinesPresent).toBe(true);
    expect(payload.duplicateLineIdsPresent).toBe(false);
    expect(payload.answerResultStatuses).toEqual(["applied"]);
  });

  it("reports duplicate shopping-list lines with the clearer field name", () => {
    const payload = buildDemoFeedbackPayload({
      rawInput: "yogurt\nYOGURT\ncoffee",
      frontendMode: "backend",
      response: null,
      clarificationAnswers: [],
      currentUrl: "https://maple-card.vercel.app/",
      browserUserAgent: "unit-test-agent",
    });

    expect(payload.duplicateRawLinesPresent).toBe(true);
    expect(payload.duplicateLineIdsPresent).toBe(false);
  });

  it("flags duplicate line ids only when duplicate raw lines collapse onto too few line ids", () => {
    const payload = buildDemoFeedbackPayload({
      rawInput: "yogurt\nyogurt",
      frontendMode: "backend",
      response: {
        items: [],
        winner: {
          provider: "synthetic",
          retailerKey: "freshmart",
          subtotal: 12,
          etaMin: 20,
          coverageRatio: 1,
          avgMatchConfidence: 1,
          score: 0.91,
          reason: "best fit",
        },
        alternatives: [],
        clarifications: [
          {
            id: "q1",
            lineId: "line_0_yogurt_exact-item",
            rawText: "yogurt",
            question: "Which yogurt type do you want?",
            options: ["regular", "greek"],
            attributeKey: "type",
          },
          {
            id: "q2",
            lineId: "line_0_yogurt_exact-item",
            rawText: "yogurt",
            question: "Which yogurt flavor do you want?",
            options: ["plain", "vanilla"],
            attributeKey: "flavor",
          },
        ],
      },
      clarificationAnswers: [],
      currentUrl: "https://maple-card.vercel.app/",
      browserUserAgent: "unit-test-agent",
    });

    expect(payload.duplicateRawLinesPresent).toBe(true);
    expect(payload.duplicateLineIdsPresent).toBe(true);
  });

  it("formats a readable copy report with the clearer duplicate raw lines field", () => {
    const report = formatDemoFeedbackReport(
      buildDemoFeedbackPayload({
        rawInput: "yogurt\nyogurt",
        frontendMode: "fixture",
        response: null,
        clarificationAnswers: [],
        currentUrl: "https://maple-card.vercel.app/",
        browserUserAgent: "unit-test-agent",
      })
    );

    expect(report).toContain('"duplicateRawLinesPresent": true');
    expect(report).toContain('"duplicateLineIdsPresent": false');
  });

  it("formats a readable copy report", () => {
    const report = formatDemoFeedbackReport(
      buildDemoFeedbackPayload({
        rawInput: "milk",
        frontendMode: "fixture",
        response: null,
        clarificationAnswers: [],
        currentUrl: "https://maple-card.vercel.app/",
        browserUserAgent: "unit-test-agent",
      })
    );

    expect(report).toContain("MapleCard Demo Feedback Report");
    expect(report).toContain('"rawInputIncluded": false');
  });
});
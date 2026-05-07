import { useMemo, useState } from "react";
import { ApiClientError, optimizeShopping, type OptimizeShoppingClient, frontendConfig } from "./api/optimizeClient";
import { buildDemoFeedbackPayload, formatDemoFeedbackReport } from "./feedback/demoFeedback";
import type { AnswerResult, ClarificationAnswer, ClarificationQuestion, OptimizeRequest, OptimizeResponse } from "./types/api";

type AppProps = {
  optimizeClient?: OptimizeShoppingClient;
};

type ClarificationGroupView = {
  lineId: string;
  rawText: string;
  questions: ClarificationQuestion[];
  duplicateIndex: number;
  duplicateCount: number;
};

type ErrorDisplayState = {
  message: string;
  requestId?: string;
  errorId?: string;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function formatEta(etaMin: number | null): string {
  return etaMin == null ? "ETA unknown" : `${etaMin} min`;
}

function formatAttributeLabel(attributeKey?: string): string {
  if (!attributeKey) return "Choice";

  const withSpaces = attributeKey.replace(/[_-]+/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function formatFriendlyLineLabel(lineId?: string): string {
  if (!lineId) return "Targeted list line";

  const match = /^line_(\d+)_/.exec(lineId);
  if (!match) return "Targeted list line";

  return `List line ${Number(match[1]) + 1}`;
}

function formatAnswerStatusLabel(status: AnswerResult["status"]): string {
  switch (status) {
    case "applied":
      return "Saved answer";
    case "ignored_unknown_question":
      return "Question changed";
    case "ignored_line_mismatch":
      return "Wrong list line";
    case "ignored_raw_text_mismatch":
      return "Item text changed";
    case "ignored_attribute_mismatch":
      return "Different attribute";
    case "ignored_invalid_option":
      return "Option not available";
    case "ignored_unsupported_attribute":
      return "Attribute unsupported";
    default:
      return "Answer update";
  }
}

function formatSelectedAnswerSummary(answer: ClarificationAnswer): string {
  return `${formatAttributeLabel(answer.attributeKey)}: ${answer.value}`;
}

function upsertAnswer(existingAnswers: ClarificationAnswer[], nextAnswer: ClarificationAnswer): ClarificationAnswer[] {
  const withoutSameQuestion = existingAnswers.filter(
    (answer) => !(answer.questionId === nextAnswer.questionId && answer.lineId === nextAnswer.lineId)
  );
  return [...withoutSameQuestion, nextAnswer];
}

function buildClarificationGroupViews(clarifications: ClarificationQuestion[]): ClarificationGroupView[] {
  const groups = new Map<string, { lineId: string; rawText: string; questions: ClarificationQuestion[] }>();

  for (const question of clarifications) {
    const existingGroup = groups.get(question.lineId);
    if (existingGroup) {
      existingGroup.questions.push(question);
      continue;
    }

    groups.set(question.lineId, {
      lineId: question.lineId,
      rawText: question.rawText,
      questions: [question],
    });
  }

  const baseGroups = Array.from(groups.values());
  const rawTextCounts = new Map<string, number>();
  const rawTextIndexes = new Map<string, number>();

  for (const group of baseGroups) {
    rawTextCounts.set(group.rawText, (rawTextCounts.get(group.rawText) ?? 0) + 1);
  }

  return baseGroups.map((group) => {
    const nextIndex = (rawTextIndexes.get(group.rawText) ?? 0) + 1;
    rawTextIndexes.set(group.rawText, nextIndex);

    return {
      ...group,
      duplicateIndex: nextIndex,
      duplicateCount: rawTextCounts.get(group.rawText) ?? 1,
    };
  });
}

export default function App({ optimizeClient = optimizeShopping }: AppProps) {
  const [rawInput, setRawInput] = useState("2% milk\neggs\nbanana\nrice");
  const [submittedRawInput, setSubmittedRawInput] = useState("");
  const [response, setResponse] = useState<OptimizeResponse | null>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<ClarificationAnswer[]>([]);
  const [lastRequest, setLastRequest] = useState<OptimizeRequest | null>(null);
  const [errorState, setErrorState] = useState<ErrorDisplayState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [includeRawInputInFeedback, setIncludeRawInputInFeedback] = useState(false);
  const [feedbackCopyStatus, setFeedbackCopyStatus] = useState<"idle" | "copied" | "manual-copy">("idle");
  const [manualFeedbackReport, setManualFeedbackReport] = useState("");
  const hasInput = rawInput.trim().length > 0;

  const groupedClarifications = useMemo(
    () => buildClarificationGroupViews(response?.clarifications ?? []),
    [response?.clarifications]
  );

  const selectedAnswersByQuestionId = useMemo(
    () => new Map(clarificationAnswers.map((answer) => [answer.questionId, answer])),
    [clarificationAnswers]
  );

  const answerResultsByQuestionId = useMemo(
    () => new Map((response?.answerResults ?? []).map((result) => [result.questionId, result])),
    [response?.answerResults]
  );

  const appliedAnswerCount = response?.answerResults?.filter((result) => result.status === "applied").length ?? 0;
  const remainingQuestionCount = response?.clarifications.length ?? 0;

  function getFeedbackReport(): string {
    return formatDemoFeedbackReport(
      buildDemoFeedbackPayload(
        {
          rawInput,
          frontendMode: frontendConfig.apiMode,
          backendBaseUrl: frontendConfig.apiBaseUrl,
          response,
          clarificationAnswers,
          currentVisibleErrorMessage: errorState?.message,
          requestId: errorState?.requestId,
          errorId: errorState?.errorId,
        },
        { includeRawInput: includeRawInputInFeedback }
      )
    );
  }

  async function handleCopyFeedbackReport() {
    const report = getFeedbackReport();

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(report);
      setManualFeedbackReport("");
      setFeedbackCopyStatus("copied");
      return;
    } catch {
      setManualFeedbackReport(report);
      setFeedbackCopyStatus("manual-copy");
    }
  }

  async function submitRequest(nextRequest: OptimizeRequest, nextSubmittedInput: string) {
    setIsLoading(true);
    setErrorState(null);
    setLastRequest(nextRequest);

    try {
      const nextResponse = await optimizeClient(nextRequest);
      setResponse(nextResponse);
      setSubmittedRawInput(nextSubmittedInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MapleCard could not complete this request right now. Please try again in a moment.";
      setErrorState(
        error instanceof ApiClientError
          ? {
              message,
              requestId: error.requestId,
              errorId: error.errorId,
            }
          : { message }
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit() {
    const trimmedInput = rawInput.trim();
    if (!trimmedInput) return;

    setClarificationAnswers([]);
    await submitRequest({ rawInput: trimmedInput }, trimmedInput);
  }

  async function handleClarificationSelect(question: ClarificationQuestion, value: string) {
    const nextAnswer: ClarificationAnswer = {
      questionId: question.id,
      lineId: question.lineId,
      rawText: question.rawText,
      ...(question.attributeKey ? { attributeKey: question.attributeKey } : {}),
      value,
    };

    const nextAnswers = upsertAnswer(clarificationAnswers, nextAnswer);
    setClarificationAnswers(nextAnswers);

    const nextRequest: OptimizeRequest = {
      rawInput: submittedRawInput,
      clarificationAnswers: nextAnswers,
    };

    await submitRequest(nextRequest, submittedRawInput);
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">MapleCard mobile-first shopping assistant</p>
        <p className="staging-banner">MapleCard staging demo - uses synthetic inventory and seed catalog data.</p>
        <h1>Build a quick grocery plan that still feels usable on your phone.</h1>
        <p className="hero-copy">
          Fixture mode stays the default for UI work and tests. Backend mode is still available for local smoke testing against MapleCard on port 3000, but the UX here now focuses on a cleaner tap-first shopping flow.
        </p>
        <p className="hero-copy staging-copy">
          Inventory and pricing are not real yet, checkout is not available, and this demo is for validating the shopping-intelligence flow.
        </p>
        <div className="mode-pill-row">
          <span className="mode-pill">Mode: {frontendConfig.apiMode}</span>
          <span className="mode-pill">Endpoint: {frontendConfig.apiBaseUrl}/api/optimize</span>
        </div>
        <div className="hero-highlights" aria-label="Shopping flow highlights">
          <span className="highlight-pill">Touch-friendly clarifications</span>
          <span className="highlight-pill">Duplicate lines stay separate</span>
          <span className="highlight-pill">PWA install metadata scaffolded</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <span className="panel-step">Screen 1</span>
          <h2>Shopping list input</h2>
        </div>
        <p className="panel-copy">Paste one item per line. MapleCard keeps fixture mode as the default so you can refine the mobile flow without a live backend.</p>
        <label className="field-label" htmlFor="rawInput">Raw shopping list</label>
        <textarea
          id="rawInput"
          className="shopping-input"
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          rows={7}
          placeholder="yogurt&#10;coffee"
        />
        <div className="example-row" aria-label="Suggested shopping list examples">
          <span className="example-chip">yogurt</span>
          <span className="example-chip">coffee</span>
          <span className="example-chip">2% milk</span>
          <span className="example-chip">rice</span>
        </div>
        <button className="primary-button" onClick={handleSubmit} disabled={isLoading || rawInput.trim().length === 0}>
          {isLoading ? "Optimizing..." : "Optimize shopping list"}
        </button>
        {!hasInput ? (
          <div className="inline-state" role="status">
            <h3>Start with at least one grocery line.</h3>
            <p>Add a short list like yogurt, coffee, or a few weekly staples to see stores, clarifications, and answer feedback.</p>
          </div>
        ) : null}
        {errorState ? (
          <div className="error-banner" role="alert">
            <p>{errorState.message}</p>
            {errorState.requestId || errorState.errorId ? (
              <p className="error-correlation">
                {errorState.requestId ? `Request ID: ${errorState.requestId}` : ""}
                {errorState.requestId && errorState.errorId ? " · " : ""}
                {errorState.errorId ? `Error ID: ${errorState.errorId}` : ""}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="demo-feedback-panel" aria-label="Demo feedback helper">
          <div>
            <p className="card-label">Demo feedback</p>
            <p className="muted-copy">This copies a report you can paste into a message. It is not sent automatically.</p>
          </div>
          <label className="feedback-checkbox">
            <input
              type="checkbox"
              checked={includeRawInputInFeedback}
              onChange={(event) => setIncludeRawInputInFeedback(event.target.checked)}
            />
            <span>Include my shopping-list text in this report</span>
          </label>
          <button type="button" className="secondary-button" onClick={handleCopyFeedbackReport}>
            Copy feedback report
          </button>
          {feedbackCopyStatus === "copied" ? (
            <p className="feedback-copy-status" role="status">Feedback report copied to clipboard.</p>
          ) : null}
          {feedbackCopyStatus === "manual-copy" ? (
            <div className="manual-feedback-block">
              <p className="feedback-copy-status" role="status">Clipboard unavailable. Copy the report below manually.</p>
              <textarea
                aria-label="Feedback report"
                className="payload-preview feedback-report-preview"
                readOnly
                rows={10}
                value={manualFeedbackReport}
              />
            </div>
          ) : null}
        </div>
      </section>

      {isLoading ? (
        <section className="panel loading-panel" role="status" aria-live="polite">
          <div className="loading-orb" aria-hidden="true" />
          <div>
            <h2>{response ? "Refreshing your plan" : "Building your shopping plan"}</h2>
            <p className="muted-copy">Checking the winner store, alternatives, and any clarifications that still need a choice.</p>
          </div>
        </section>
      ) : null}

      {response ? (
        <>
          <section className="panel">
            <div className="panel-heading">
              <span className="panel-step">Screen 2</span>
              <h2>Optimized result summary</h2>
            </div>
            <div className="summary-strip" aria-label="Optimization status summary">
              <div className="summary-pill"><strong>{response.items.length}</strong><span>items reviewed</span></div>
              <div className="summary-pill"><strong>{appliedAnswerCount}</strong><span>answers resolved</span></div>
              <div className="summary-pill"><strong>{remainingQuestionCount}</strong><span>questions left</span></div>
            </div>
            <div className="result-grid">
              <article className="winner-card">
                <div className="store-card-heading">
                  <div>
                    <p className="card-label">Winner store</p>
                    <h3>{response.winner.retailerKey}</h3>
                  </div>
                  <span className="winner-badge">Best overall fit</span>
                </div>
                <dl className="metric-list">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{formatCurrency(response.winner.subtotal)}</dd>
                  </div>
                  <div>
                    <dt>ETA</dt>
                    <dd>{formatEta(response.winner.etaMin)}</dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>{response.winner.reason}</dd>
                  </div>
                </dl>
              </article>

              <article className="secondary-card">
                <p className="card-label">Alternatives</p>
                <ul className="store-list enhanced-store-list">
                  {response.alternatives.map((store) => (
                    <li key={store.retailerKey} className="store-list-item">
                      <div className="store-list-topline">
                        <strong>{store.retailerKey}</strong>
                        <span className="store-score">Score {store.score.toFixed(2)}</span>
                      </div>
                      <div className="store-meta-row">
                        <span>{formatCurrency(store.subtotal)}</span>
                        <span>{formatEta(store.etaMin)}</span>
                      </div>
                      <p className="store-reason">{store.reason}</p>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <article className="secondary-card">
              <p className="card-label">Parsed items</p>
              <ul className="item-list">
                {response.items.map((item, index) => (
                  <li key={`${item.rawText}-${index}`} className="item-list-item">
                    <div>
                      <strong>{item.rawText}</strong>
                      <p>{item.canonicalQuery} · {item.lineType}</p>
                    </div>
                    <code>{JSON.stringify(item.attributes)}</code>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <span className="panel-step">Screen 3</span>
              <h2>Clarify what still needs a choice</h2>
            </div>
            <p className="panel-copy">Resolved answers stay visible below. Remaining questions stay grouped by shopping-list line so duplicate items are still easy to tell apart.</p>
            {groupedClarifications.length === 0 ? (
              <div className="inline-state success-state" role="status">
                <h3>No remaining clarification questions.</h3>
                <p>Your current shopping list is specific enough for MapleCard to finish the comparison without more taps.</p>
              </div>
            ) : (
              <div className="clarification-groups">
                {groupedClarifications.map((group) => (
                  <article key={group.lineId} className="clarification-group">
                    <div className="group-header">
                      <div>
                        <p className="group-title">
                          {group.duplicateCount > 1
                            ? `${group.rawText} request ${group.duplicateIndex} of ${group.duplicateCount}`
                            : group.rawText}
                        </p>
                        <p className="group-subtitle">
                          {group.duplicateCount > 1
                            ? `${formatFriendlyLineLabel(group.lineId)} keeps this duplicate item separate from the others.`
                            : `${formatFriendlyLineLabel(group.lineId)} still needs a couple of quick choices.`}
                        </p>
                        <p className="group-key">Target key: {group.lineId}</p>
                      </div>
                      <span className="line-badge">{group.questions.length} remaining</span>
                    </div>

                    {group.questions.map((question) => (
                      <div key={question.id} className="question-card">
                        <div className="question-topline">
                          <p className="question-id">{formatAttributeLabel(question.attributeKey)}</p>
                          {selectedAnswersByQuestionId.get(question.id) ? (
                            <span className="selection-badge">Selected</span>
                          ) : null}
                        </div>
                        <h3>{question.question}</h3>
                        <div className="chip-row">
                          {question.options.map((option) => (
                            <button
                              key={`${question.id}-${option}`}
                              className={`chip-button${selectedAnswersByQuestionId.get(question.id)?.value === option ? " is-selected" : ""}`}
                              onClick={() => handleClarificationSelect(question, option)}
                              disabled={isLoading}
                              aria-pressed={selectedAnswersByQuestionId.get(question.id)?.value === option}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <span className="panel-step">Screen 4</span>
              <h2>Selected answers and feedback</h2>
            </div>
            <div className="feedback-grid">
              <article className="secondary-card">
                <p className="card-label">Selected answers</p>
                {clarificationAnswers.length ? (
                  <ul className="selected-answer-list">
                    {clarificationAnswers.map((answer) => {
                      const result = answerResultsByQuestionId.get(answer.questionId);

                      return (
                        <li key={`${answer.questionId}-${answer.value}`} className="selected-answer-card">
                          <div className="selected-answer-topline">
                            <strong>{answer.rawText}</strong>
                            <span className={`status-pill${result?.status === "applied" ? " is-success" : ""}`}>
                              {result ? formatAnswerStatusLabel(result.status) : "Selected"}
                            </span>
                          </div>
                          <p className="selected-answer-summary">{formatSelectedAnswerSummary(answer)}</p>
                          <p className="answer-meta">{formatFriendlyLineLabel(answer.lineId)} · Target key: {answer.lineId ?? "not provided"}</p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="muted-copy">No answers selected yet. Tap a clarification option to keep refining the request.</p>
                )}
              </article>

              <article className="secondary-card">
                <p className="card-label">Answer feedback</p>
                {response.answerResults?.length ? (
                  <ul className="answer-results-list">
                    {response.answerResults.map((result) => (
                      <li key={`${result.questionId}-${result.value}`} className="answer-result-card">
                        <div className="selected-answer-topline">
                          <p className="answer-status">{formatAnswerStatusLabel(result.status)}</p>
                          <span className={`status-pill${result.status === "applied" ? " is-success" : ""}`}>
                            {formatSelectedAnswerSummary(result)}
                          </span>
                        </div>
                        <p>{result.message}</p>
                        <p className="answer-meta">{result.rawText} · {formatFriendlyLineLabel(result.lineId)} · Target key: {result.lineId ?? "not provided"}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-copy">Answer feedback appears here after you answer a clarification.</p>
                )}
              </article>
            </div>

            <details className="payload-details">
              <summary>Submitted request payload</summary>
              <pre className="payload-preview">{JSON.stringify(lastRequest ?? { rawInput: submittedRawInput || rawInput }, null, 2)}</pre>
            </details>
          </section>
        </>
      ) : null}
    </main>
  );
}
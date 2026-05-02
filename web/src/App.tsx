import { useMemo, useState } from "react";
import { optimizeShopping, type OptimizeShoppingClient, frontendConfig } from "./api/optimizeClient";
import type { ClarificationAnswer, ClarificationQuestion, OptimizeRequest, OptimizeResponse } from "./types/api";

type AppProps = {
  optimizeClient?: OptimizeShoppingClient;
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

function upsertAnswer(existingAnswers: ClarificationAnswer[], nextAnswer: ClarificationAnswer): ClarificationAnswer[] {
  const withoutSameQuestion = existingAnswers.filter((answer) => answer.questionId !== nextAnswer.questionId);
  return [...withoutSameQuestion, nextAnswer];
}

function groupClarificationsByLine(clarifications: ClarificationQuestion[]): Array<{ lineId: string; rawText: string; questions: ClarificationQuestion[] }> {
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

  return Array.from(groups.values());
}

export default function App({ optimizeClient = optimizeShopping }: AppProps) {
  const [rawInput, setRawInput] = useState("2% milk\neggs\nbanana\nrice");
  const [submittedRawInput, setSubmittedRawInput] = useState("");
  const [response, setResponse] = useState<OptimizeResponse | null>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<ClarificationAnswer[]>([]);
  const [lastRequest, setLastRequest] = useState<OptimizeRequest | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const groupedClarifications = useMemo(
    () => groupClarificationsByLine(response?.clarifications ?? []),
    [response?.clarifications]
  );

  async function submitRequest(nextRequest: OptimizeRequest, nextSubmittedInput: string) {
    setIsLoading(true);
    setErrorMessage(null);
    setLastRequest(nextRequest);

    try {
      const nextResponse = await optimizeClient(nextRequest);
      setResponse(nextResponse);
      setSubmittedRawInput(nextSubmittedInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MapleCard could not complete this request right now. Please try again in a moment.";
      setErrorMessage(message);
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
        <p className="eyebrow">MapleCard mobile-first web scaffold</p>
        <h1>Plan a grocery run before the backend is live.</h1>
        <p className="hero-copy">
          Fixture mode is the default, so this client can exercise the public API contract and duplicate-line clarification flow without requiring a running backend. Backend mode is available for local smoke testing against MapleCard on port 3000.
        </p>
        <div className="mode-pill-row">
          <span className="mode-pill">Mode: {frontendConfig.apiMode}</span>
          <span className="mode-pill">Endpoint: {frontendConfig.apiBaseUrl}/api/optimize</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <span className="panel-step">Screen 1</span>
          <h2>Shopping list input</h2>
        </div>
        <label className="field-label" htmlFor="rawInput">Raw shopping list</label>
        <textarea
          id="rawInput"
          className="shopping-input"
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          rows={7}
          placeholder="yogurt&#10;coffee"
        />
        <button className="primary-button" onClick={handleSubmit} disabled={isLoading || rawInput.trim().length === 0}>
          {isLoading ? "Optimizing..." : "Optimize shopping list"}
        </button>
        {errorMessage ? <p className="error-banner" role="alert">{errorMessage}</p> : null}
      </section>

      {response ? (
        <>
          <section className="panel">
            <div className="panel-heading">
              <span className="panel-step">Screen 2</span>
              <h2>Optimized result summary</h2>
            </div>
            <div className="result-grid">
              <article className="winner-card">
                <p className="card-label">Winner store</p>
                <h3>{response.winner.retailerKey}</h3>
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
                <ul className="store-list">
                  {response.alternatives.map((store) => (
                    <li key={store.retailerKey} className="store-list-item">
                      <strong>{store.retailerKey}</strong>
                      <span>{formatCurrency(store.subtotal)}</span>
                      <span>{formatEta(store.etaMin)}</span>
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
              <h2>Clarification questions</h2>
            </div>
            {groupedClarifications.length === 0 ? (
              <p className="muted-copy">No remaining clarification questions.</p>
            ) : (
              <div className="clarification-groups">
                {groupedClarifications.map((group) => (
                  <article key={group.lineId} className="clarification-group">
                    <div className="group-header">
                      <div>
                        <p className="group-title">{group.rawText}</p>
                        <p className="group-subtitle">lineId: {group.lineId}</p>
                      </div>
                      <span className="line-badge">{group.questions.length} questions</span>
                    </div>

                    {group.questions.map((question) => (
                      <div key={question.id} className="question-card">
                        <p className="question-id">id: {question.id}</p>
                        <h3>{question.question}</h3>
                        <div className="chip-row">
                          {question.options.map((option) => (
                            <button
                              key={`${question.id}-${option}`}
                              className="chip-button"
                              onClick={() => handleClarificationSelect(question, option)}
                              disabled={isLoading}
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
              <h2>Answer feedback and remaining questions</h2>
            </div>
            {response.answerResults?.length ? (
              <ul className="answer-results-list">
                {response.answerResults.map((result) => (
                  <li key={`${result.questionId}-${result.value}`} className="answer-result-card">
                    <p className="answer-status">{result.status}</p>
                    <p>{result.message}</p>
                    <p className="answer-meta">{result.rawText} · {result.lineId ?? "no lineId"}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">No answer results yet. Select a clarification option to continue the flow.</p>
            )}

            <article className="secondary-card">
              <p className="card-label">Submitted request payload</p>
              <pre className="payload-preview">{JSON.stringify(lastRequest ?? { rawInput: submittedRawInput || rawInput }, null, 2)}</pre>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
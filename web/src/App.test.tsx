import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createOptimizeShoppingClient } from "./api/optimizeClient";
import { getFixtureOptimizeResponse } from "./fixtures/optimizeFixtures";
import type { OptimizeRequest, OptimizeResponse } from "./types/api";

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  vi.unstubAllGlobals();
});

describe("MapleCard mobile web scaffold", () => {
  it("renders the staging demo banner", () => {
    render(<App optimizeClient={vi.fn()} />);

    expect(screen.getByText(/maplecard staging demo - uses synthetic inventory and seed catalog data/i)).toBeInTheDocument();
    expect(screen.getByText(/inventory and pricing are not real yet, checkout is not available/i)).toBeInTheDocument();
  });

  it("renders the raw input screen", () => {
    render(<App optimizeClient={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /shopping list input/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/raw shopping list/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /optimize shopping list/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy feedback report/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/include my shopping-list text in this report/i)).not.toBeChecked();
    expect(screen.getByText(/paste this report into a maplecard demo feedback issue/i)).toBeInTheDocument();
    expect(screen.getByText(/running a tester session\? use the tester packet and copy a feedback report after each flow/i)).toBeInTheDocument();
  });

  it("renders fixture-specific helper text in fixture mode", () => {
    render(<App optimizeClient={vi.fn()} frontendMode="fixture" />);

    expect(screen.getAllByText(/fixture mode is active for local ui development/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/backend mode is active\. requests are sent to the maplecard staging api/i)).not.toBeInTheDocument();
  });

  it("renders backend-specific helper text in backend mode", () => {
    render(<App optimizeClient={vi.fn()} frontendMode="backend" />);

    expect(screen.getAllByText(/backend mode is active\. requests are sent to the maplecard staging api/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/fixture mode is active for local ui development/i)).not.toBeInTheDocument();
  });

  it("copies a privacy-safe feedback report by default", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<App optimizeClient={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /copy feedback report/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('"rawInputIncluded": false');
    expect(writeText.mock.calls[0][0]).toContain('"rawInputLineCount": 4');
    expect(writeText.mock.calls[0][0]).not.toContain('"rawInput":');
    expect(screen.getByRole("status")).toHaveTextContent(/feedback report copied to clipboard/i);
  });

  it("shows a manual-copy report when the clipboard API is unavailable", async () => {
    const user = userEvent.setup();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<App optimizeClient={vi.fn()} />);

    await user.click(screen.getByLabelText(/include my shopping-list text in this report/i));
    await user.click(screen.getByRole("button", { name: /copy feedback report/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/clipboard unavailable/i);
    const manualReport = screen.getByRole("textbox", { name: /feedback report/i });
    expect((manualReport as HTMLTextAreaElement).value).toContain('"rawInputIncluded": true');
    expect((manualReport as HTMLTextAreaElement).value).toContain("2% milk");
  });

  it("renders an empty input helper state and disables submit", async () => {
    const user = userEvent.setup();

    render(<App optimizeClient={vi.fn()} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);

    expect(screen.getByRole("status")).toHaveTextContent(/start with at least one grocery line/i);
    expect(screen.getByRole("button", { name: /optimize shopping list/i })).toBeDisabled();
  });

  it("renders a loading state while optimizeShopping is running", async () => {
    const user = userEvent.setup();

    let resolveRequest: ((response: OptimizeResponse) => void) | undefined;
    const client = vi.fn(
      () =>
        new Promise<OptimizeResponse>((resolve) => {
          resolveRequest = resolve;
        })
    );

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "yogurt");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/building your shopping plan/i);

    resolveRequest?.(getFixtureOptimizeResponse({ rawInput: "yogurt" }));

    expect(await screen.findByRole("heading", { name: /optimized result summary/i })).toBeInTheDocument();
  });

  it("renders a fixture optimize result", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest) => getFixtureOptimizeResponse(request));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "2% milk{enter}eggs{enter}banana{enter}rice");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    expect(await screen.findByRole("heading", { name: /optimized result summary/i })).toBeInTheDocument();
    expect(screen.getByText(/winner store/i)).toBeInTheDocument();
    expect(screen.getByText(/freshmart/i)).toBeInTheDocument();
    expect(screen.getByText(/parsed items/i)).toBeInTheDocument();
  });

  it("shows comma-separated input guidance without blocking submission", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest) => ({
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
    }));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "milk, eggs, bread, yogurt, cheese");

    expect(screen.getByText(/tip: put each item on a new line\. comma-separated lists are not fully supported yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    await screen.findByRole("heading", { name: /optimized result summary/i });
    expect(client).toHaveBeenCalledWith({ rawInput: "milk, eggs, bread, yogurt, cheese" });
    expect(screen.getByText(/maplecard did not split that list into separate items/i)).toBeInTheDocument();
  });

  it("does not show comma-separated guidance for normal multiline input", async () => {
    const user = userEvent.setup();

    render(<App optimizeClient={vi.fn(async (request: OptimizeRequest) => getFixtureOptimizeResponse(request))} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "milk{enter}eggs{enter}bread");

    expect(screen.queryByText(/comma-separated lists are not fully supported yet/i)).not.toBeInTheDocument();
  });

  it("renders clarification questions with user-friendly duplicate-line labels", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest) => getFixtureOptimizeResponse(request));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "yogurt");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    expect(await screen.findByText(/which yogurt type do you want/i)).toBeInTheDocument();
    expect(screen.getByText(/list line 1 still needs a couple of quick choices/i)).toBeInTheDocument();
    expect(screen.getByText(/target key: line_0_yogurt_exact-item/i)).toBeInTheDocument();
  });

  it("selecting an answer builds the correct clarificationAnswers payload", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest): Promise<OptimizeResponse> => getFixtureOptimizeResponse(request));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "yogurt");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    await screen.findByText(/which yogurt type do you want/i);
    await user.click(screen.getByRole("button", { name: /^greek$/i }));

    await waitFor(() => expect(client).toHaveBeenCalledTimes(2));
    expect(client.mock.calls[1][0]).toEqual({
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
    });
  });

  it("renders selected answers and answerResults in a user-friendly form", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest) => getFixtureOptimizeResponse(request));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "yogurt");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));
    await screen.findByText(/which yogurt type do you want/i);
    await user.click(screen.getByRole("button", { name: /^greek$/i }));

    expect((await screen.findAllByText(/saved answer/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/type: greek/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/answer was applied to the optimization request/i)).toBeInTheDocument();
    expect(screen.getByText(/which yogurt flavor do you want/i)).toBeInTheDocument();
  });

  it("keeps duplicate yogurt line questions distinguishable by lineId", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest) => getFixtureOptimizeResponse(request));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "yogurt{enter}yogurt");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    expect(await screen.findByText(/yogurt request 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/yogurt request 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/target key: line_0_yogurt_exact-item/i)).toBeInTheDocument();
    expect(screen.getByText(/target key: line_1_yogurt_exact-item/i)).toBeInTheDocument();
  });

  it("renders a no-clarifications state for specific lists", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest) => getFixtureOptimizeResponse(request));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "2% milk{enter}eggs{enter}banana{enter}rice");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    expect(await screen.findByText(/no remaining clarification questions/i)).toBeInTheDocument();
  });

  it("renders a safe validation error message from backend mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({
        "x-request-id": "req_validation_123",
        "x-error-id": "err_validation_123",
      }),
      json: async () => ({
        error: {
          code: "invalid_clarification_answer",
          message: "Each clarification answer must include a non-empty `questionId`.",
          requestId: "req_validation_123",
          errorId: "err_validation_123",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <App
        optimizeClient={createOptimizeShoppingClient({
          apiMode: "backend",
          apiBaseUrl: "http://localhost:3000",
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /please check your shopping list and clarification answers, then try again/i
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/request id: req_validation_123/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/error id: err_validation_123/i);
  });

  it("copies request and error correlation details into the feedback report when available", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({
        "x-request-id": "req_validation_123",
        "x-error-id": "err_validation_123",
      }),
      json: async () => ({
        error: {
          code: "invalid_clarification_answer",
          message: "Each clarification answer must include a non-empty `questionId`.",
          requestId: "req_validation_123",
          errorId: "err_validation_123",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <App
        optimizeClient={createOptimizeShoppingClient({
          apiMode: "backend",
          apiBaseUrl: "http://localhost:3000",
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: /copy feedback report/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('"requestId": "req_validation_123"');
    expect(writeText.mock.calls[0][0]).toContain('"errorId": "err_validation_123"');
    expect(writeText.mock.calls[0][0]).toContain(
      '"lastSafeFrontendErrorMessage": "Please check your shopping list and clarification answers, then try again."'
    );
  });

  it("copies the backend request id from a successful response into the feedback report", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "x-request-id": "req_success_123",
      }),
      json: async () => ({
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
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <App
        optimizeClient={createOptimizeShoppingClient({
          apiMode: "backend",
          apiBaseUrl: "https://backend.example.com",
        })}
        frontendMode="backend"
        backendBaseUrl="https://backend.example.com"
      />
    );

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "milk");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));
    await screen.findByRole("heading", { name: /optimized result summary/i });
    await user.click(screen.getByRole("button", { name: /copy feedback report/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('"requestId": "req_success_123"');
  });

  it("renders a safe network failure message from backend mode", async () => {
    const user = userEvent.setup();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connect ECONNREFUSED 127.0.0.1")));

    render(
      <App
        optimizeClient={createOptimizeShoppingClient({
          apiMode: "backend",
          apiBaseUrl: "http://localhost:3000",
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /maplecard could not reach the local backend/i
    );
  });
});
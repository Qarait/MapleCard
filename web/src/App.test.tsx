import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { getFixtureOptimizeResponse } from "./fixtures/optimizeFixtures";
import type { OptimizeRequest, OptimizeResponse } from "./types/api";

describe("MapleCard mobile web scaffold", () => {
  it("renders the raw input screen", () => {
    render(<App optimizeClient={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /shopping list input/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/raw shopping list/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /optimize shopping list/i })).toBeInTheDocument();
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

  it("renders clarification questions with id and lineId", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest) => getFixtureOptimizeResponse(request));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "yogurt");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    expect(await screen.findByText(/which yogurt type do you want/i)).toBeInTheDocument();
    expect(screen.getByText(/lineId: line_0_yogurt_exact-item/i)).toBeInTheDocument();
    expect(screen.getByText(/id: cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want/i)).toBeInTheDocument();
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

  it("renders answerResults feedback", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest) => getFixtureOptimizeResponse(request));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "yogurt");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));
    await screen.findByText(/which yogurt type do you want/i);
    await user.click(screen.getByRole("button", { name: /^greek$/i }));

    expect(await screen.findByText(/answer was applied to the optimization request/i)).toBeInTheDocument();
    expect(screen.getByText(/^applied$/i)).toBeInTheDocument();
  });

  it("keeps duplicate yogurt line questions distinguishable by lineId", async () => {
    const user = userEvent.setup();
    const client = vi.fn(async (request: OptimizeRequest) => getFixtureOptimizeResponse(request));

    render(<App optimizeClient={client} />);

    const input = screen.getByLabelText(/raw shopping list/i);
    await user.clear(input);
    await user.type(input, "yogurt{enter}yogurt");
    await user.click(screen.getByRole("button", { name: /optimize shopping list/i }));

    expect(await screen.findByText(/lineId: line_0_yogurt_exact-item/i)).toBeInTheDocument();
    expect(screen.getByText(/lineId: line_1_yogurt_exact-item/i)).toBeInTheDocument();
    expect(screen.getByText(/id: cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want/i)).toBeInTheDocument();
    expect(screen.getByText(/id: cq_line-1-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want/i)).toBeInTheDocument();
  });
});
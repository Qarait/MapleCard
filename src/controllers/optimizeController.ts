import type { Request, Response } from "express";
import { OptimizeServiceError } from "../services/optimizeServiceError";
import { optimizeShopping, type OptimizeClarificationAnswer } from "../services/optimizeService";

type ValidationError = {
  code:
    | "missing_raw_input"
    | "invalid_raw_input_type"
    | "empty_raw_input"
    | "raw_input_too_long"
    | "too_many_lines"
    | "line_too_long"
    | "invalid_clarification_answers_type"
    | "too_many_clarification_answers"
    | "invalid_clarification_answer";
  message: string;
  details?: Record<string, any>;
};

type RequestValidationResult = {
  rawInput: string;
  clarificationAnswers: OptimizeClarificationAnswer[];
};

function validateRawInput(body: any): ValidationError | null {
  if (body == null || typeof body !== "object" || !("rawInput" in body)) {
    return {
      code: "missing_raw_input",
      message: "Request body must include `rawInput`.",
    };
  }

  const rawInput = body.rawInput;
  if (typeof rawInput !== "string") {
    return {
      code: "invalid_raw_input_type",
      message: "`rawInput` must be a string.",
    };
  }

  if (rawInput.trim().length === 0) {
    return {
      code: "empty_raw_input",
      message: "`rawInput` must not be empty or whitespace-only.",
    };
  }

  if (rawInput.length > 10000) {
    return {
      code: "raw_input_too_long",
      message: "`rawInput` must be 10000 characters or fewer.",
      details: { maxLength: 10000, actualLength: rawInput.length },
    };
  }

  const lines = rawInput.split(/\r?\n/);
  if (lines.length > 100) {
    return {
      code: "too_many_lines",
      message: "`rawInput` must contain 100 lines or fewer.",
      details: { maxLines: 100, actualLines: lines.length },
    };
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 300) {
      return {
        code: "line_too_long",
        message: "Each input line must be 300 characters or fewer.",
        details: { maxLineLength: 300, lineNumber: i + 1, actualLength: lines[i].length },
      };
    }
  }

  return null;
}

function validateClarificationAnswers(body: any): ValidationError | null {
  if (body == null || typeof body !== "object" || !("clarificationAnswers" in body) || body.clarificationAnswers == null) {
    return null;
  }

  if (!Array.isArray(body.clarificationAnswers)) {
    return {
      code: "invalid_clarification_answers_type",
      message: "`clarificationAnswers` must be an array when provided.",
    };
  }

  if (body.clarificationAnswers.length > 50) {
    return {
      code: "too_many_clarification_answers",
      message: "`clarificationAnswers` must contain 50 answers or fewer.",
      details: { maxAnswers: 50, actualCount: body.clarificationAnswers.length },
    };
  }

  for (let index = 0; index < body.clarificationAnswers.length; index++) {
    const answer = body.clarificationAnswers[index];
    if (answer == null || typeof answer !== "object" || Array.isArray(answer)) {
      return {
        code: "invalid_clarification_answer",
        message: "Each clarification answer must be an object.",
        details: { index },
      };
    }

    if (typeof answer.questionId !== "string" || answer.questionId.trim().length === 0) {
      return {
        code: "invalid_clarification_answer",
        message: "Each clarification answer must include a non-empty `questionId`.",
        details: { index, field: "questionId" },
      };
    }

    if (typeof answer.rawText !== "string" || answer.rawText.trim().length === 0) {
      return {
        code: "invalid_clarification_answer",
        message: "Each clarification answer must include a non-empty `rawText`.",
        details: { index, field: "rawText" },
      };
    }

    if (typeof answer.value !== "string" || answer.value.trim().length === 0) {
      return {
        code: "invalid_clarification_answer",
        message: "Each clarification answer must include a non-empty `value`.",
        details: { index, field: "value" },
      };
    }

    if (answer.attributeKey != null && typeof answer.attributeKey !== "string") {
      return {
        code: "invalid_clarification_answer",
        message: "`attributeKey` must be a string when provided.",
        details: { index, field: "attributeKey" },
      };
    }

    if (answer.lineId != null && typeof answer.lineId !== "string") {
      return {
        code: "invalid_clarification_answer",
        message: "`lineId` must be a string when provided.",
        details: { index, field: "lineId" },
      };
    }
  }

  return null;
}

function validateOptimizeRequest(body: any): { error: ValidationError | null; value?: RequestValidationResult } {
  const rawInputError = validateRawInput(body);
  if (rawInputError) return { error: rawInputError };

  const clarificationError = validateClarificationAnswers(body);
  if (clarificationError) return { error: clarificationError };

  const clarificationAnswers = Array.isArray(body?.clarificationAnswers)
    ? body.clarificationAnswers.map((answer: any) => ({
        questionId: answer.questionId.trim(),
        rawText: answer.rawText.trim(),
        ...(answer.lineId != null ? { lineId: answer.lineId.trim() } : {}),
        ...(answer.attributeKey != null ? { attributeKey: answer.attributeKey.trim() } : {}),
        value: answer.value.trim(),
      }))
    : [];

  return {
    error: null,
    value: {
      rawInput: body.rawInput,
      clarificationAnswers,
    },
  };
}

export async function optimizeController(req: Request, res: Response) {
  try {
    const validation = validateOptimizeRequest(req.body);
    if (validation.error) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = await optimizeShopping(validation.value!.rawInput, undefined, validation.value!.clarificationAnswers);
    res.json(result);
  } catch (err: any) {
    if (err instanceof OptimizeServiceError) {
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: "optimization_failed",
        message: "Optimization failed.",
      },
    });
  }
}


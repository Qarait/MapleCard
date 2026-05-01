import type { Request, Response } from "express";
import { optimizeShopping } from "../services/optimizeService";

type ValidationError = {
  code:
    | "missing_raw_input"
    | "invalid_raw_input_type"
    | "empty_raw_input"
    | "raw_input_too_long"
    | "too_many_lines"
    | "line_too_long";
  message: string;
  details?: Record<string, any>;
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

export async function optimizeController(req: Request, res: Response) {
  try {
    const validationError = validateRawInput(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const rawInput = req.body.rawInput as string;
    const result = await optimizeShopping(rawInput);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Optimization failed", details: String(err?.message ?? err) });
  }
}


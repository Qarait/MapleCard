import type { Request, Response } from "express";
import { optimizeShopping } from "../services/optimizeService";

export async function optimizeController(req: Request, res: Response) {
  try {
    const rawInput = req.body?.rawInput;
    if (typeof rawInput !== "string") {
      res.status(400).json({ error: "`rawInput` must be a string" });
      return;
    }

    const result = await optimizeShopping(rawInput);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Optimization failed", details: String(err?.message ?? err) });
  }
}


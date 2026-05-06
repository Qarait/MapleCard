import { Router } from "express";
import { optimizeRateLimitMiddleware } from "../middleware/rateLimit";
import { optimizeController } from "../controllers/optimizeController";

export const optimizeRouter = Router();

optimizeRouter.post("/", optimizeRateLimitMiddleware, optimizeController);


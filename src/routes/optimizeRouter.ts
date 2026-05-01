import { Router } from "express";
import { optimizeController } from "../controllers/optimizeController";

export const optimizeRouter = Router();

optimizeRouter.post("/", optimizeController);


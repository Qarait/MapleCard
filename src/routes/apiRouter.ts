import { Router } from "express";
import { optimizeRouter } from "./optimizeRouter";

export const apiRouter = Router();

apiRouter.use("/optimize", optimizeRouter);


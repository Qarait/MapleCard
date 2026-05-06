import express from "express";
import cors from "cors";
import { getCorsOptions } from "./config/corsConfig";
import { getHealthMetadata } from "./config/runtimeMetadata";
import { apiRouter } from "./routes/apiRouter";

export function createApp() {
  const app = express();

  app.use(cors(getCorsOptions()));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", apiRouter);

  app.get("/healthz", (_req, res) => {
    res.json(getHealthMetadata());
  });

  return app;
}

export const app = createApp();


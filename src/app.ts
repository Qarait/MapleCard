import express from "express";
import cors from "cors";
import { getCorsOptions } from "./config/corsConfig";
import { getHealthMetadata } from "./config/runtimeMetadata";
import { createRequestId, getRequestContext, setRequestContext } from "./middleware/requestContext";
import { apiRouter } from "./routes/apiRouter";
import { logger } from "./utils/logger";

export function createApp() {
  const app = express();

  app.use(cors(getCorsOptions()));
  app.use((req, res, next) => {
    const requestId = createRequestId(req.header("x-request-id") ?? undefined);
    const requestPath = req.originalUrl;

    setRequestContext(res, {
      requestId,
      requestStartedAt: Date.now(),
    });

    res.setHeader("X-Request-Id", requestId);

    res.on("finish", () => {
      const requestContext = getRequestContext(res);

      logger.info("[MapleCard request] Completed request.", {
        requestId: requestContext.requestId,
        method: req.method,
        path: requestPath,
        statusCode: res.statusCode,
        durationMs: Date.now() - requestContext.requestStartedAt,
        origin: req.header("origin") ?? null,
      });
    });

    next();
  });
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", apiRouter);

  app.get(["/healthz", "/healthz/"], (_req, res) => {
    res.json(getHealthMetadata());
  });

  return app;
}

export const app = createApp();


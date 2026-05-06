import type { Request, Response, NextFunction } from "express";
import { getRateLimitConfig } from "../config/rateLimitConfig";
import { createErrorId, getRequestContext } from "./requestContext";
import { logger } from "../utils/logger";

type RateLimitBucket = {
  windowStartedAt: number;
  requestCount: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export function resetOptimizeRateLimitState(): void {
  rateLimitBuckets.clear();
}

function getClientKey(req: Request): string {
  const forwardedFor = req.header("x-forwarded-for");
  const forwardedClient = forwardedFor?.split(",")[0]?.trim();

  return forwardedClient || req.ip || "unknown_client";
}

function getOrCreateBucket(clientKey: string, now: number, windowMs: number): RateLimitBucket {
  const existingBucket = rateLimitBuckets.get(clientKey);

  if (!existingBucket || now - existingBucket.windowStartedAt >= windowMs) {
    const nextBucket: RateLimitBucket = {
      windowStartedAt: now,
      requestCount: 0,
    };

    rateLimitBuckets.set(clientKey, nextBucket);
    return nextBucket;
  }

  return existingBucket;
}

export function optimizeRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = getRateLimitConfig();

  if (!config.enabled) {
    next();
    return;
  }

  const now = Date.now();
  const clientKey = getClientKey(req);
  const bucket = getOrCreateBucket(clientKey, now, config.windowMs);

  bucket.requestCount += 1;

  if (bucket.requestCount <= config.maxRequests) {
    next();
    return;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStartedAt + config.windowMs - now) / 1000));
  const { requestId } = getRequestContext(res);
  const errorId = createErrorId();

  res.setHeader("X-Error-Id", errorId);
  res.setHeader("Retry-After", String(retryAfterSeconds));

  logger.warn("[MapleCard rate-limit] Optimize request rejected.", {
    requestId,
    errorId,
    event: "rate_limit_rejected",
    method: req.method,
    path: req.originalUrl,
    statusCode: 429,
    clientKey,
  });

  res.status(429).json({
    error: {
      code: "rate_limited",
      message: "Too many requests. Please try again shortly.",
      requestId,
      errorId,
    },
  });
}
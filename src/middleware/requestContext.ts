import type { Response } from "express";
import { randomUUID } from "crypto";

type RequestContext = {
  requestId: string;
  requestStartedAt: number;
};

const DEFAULT_REQUEST_CONTEXT: RequestContext = {
  requestId: "unknown_request",
  requestStartedAt: 0,
};

function sanitizeIncomingRequestId(rawValue: string | undefined): string | null {
  if (!rawValue) {
    return null;
  }

  const trimmedValue = rawValue.trim();

  if (trimmedValue.length === 0 || trimmedValue.length > 128) {
    return null;
  }

  if (!/^[A-Za-z0-9._:-]+$/.test(trimmedValue)) {
    return null;
  }

  return trimmedValue;
}

export function createRequestId(incomingRequestId?: string): string {
  return sanitizeIncomingRequestId(incomingRequestId) ?? randomUUID();
}

export function createErrorId(): string {
  return `err_${randomUUID()}`;
}

export function setRequestContext(res: Response, requestContext: RequestContext): void {
  res.locals.requestContext = requestContext;
}

export function getRequestContext(res: Response): RequestContext {
  return (res.locals.requestContext as RequestContext | undefined) ?? DEFAULT_REQUEST_CONTEXT;
}
type LogLevel = "info" | "warn" | "error";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serializeLogEntry(level: LogLevel, message: string, args: unknown[]): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (args.length === 1 && isPlainObject(args[0])) {
    Object.assign(entry, args[0]);
  } else if (args.length > 0) {
    entry.data = args;
  }

  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, ...args: unknown[]) {
    console.info(serializeLogEntry("info", message, args));
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(serializeLogEntry("warn", message, args));
  },
  error(message: string, ...args: unknown[]) {
    console.error(serializeLogEntry("error", message, args));
  },
};
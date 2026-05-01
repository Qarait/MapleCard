export const logger = {
  warn(message: string, ...args: unknown[]) {
    console.warn(message, ...args);
  },
};
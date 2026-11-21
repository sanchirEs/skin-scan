/** Structured logger. Never pass secrets or image bytes in meta. */
export interface Logger {
  info(event: string, meta?: Record<string, unknown>): void;
  warn(event: string, meta?: Record<string, unknown>): void;
  error(event: string, meta?: Record<string, unknown>): void;
}

const line =
  (level: "info" | "warn" | "error") =>
  (event: string, meta: Record<string, unknown> = {}) => {
    const out = level === "info" ? console.log : level === "warn" ? console.warn : console.error;
    out(JSON.stringify({ level, event, ...meta }));
  };

/** One JSON object per line, which Railway's log viewer parses. */
export const consoleLogger: Logger = { info: line("info"), warn: line("warn"), error: line("error") };

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

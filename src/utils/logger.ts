/**
 * Structured logging utility with log levels and namespacing
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export interface LogContext {
  [key: string]: unknown;
}

export interface LoggerOptions {
  level?: LogLevel;
  namespace?: string;
  timestamps?: boolean;
}

/**
 * Get the current log level from environment or default to 'info'
 */
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  return "info";
}

/**
 * Format a context object for logging
 */
function formatContext(context: LogContext): string {
  const entries = Object.entries(context);
  if (entries.length === 0) return "";

  const formatted = entries
    .map(([key, value]) => {
      if (typeof value === "string") return `${key}=${value}`;
      if (typeof value === "number" || typeof value === "boolean")
        return `${key}=${value}`;
      return `${key}=${JSON.stringify(value)}`;
    })
    .join(" ");

  return ` ${formatted}`;
}

/**
 * Format timestamp for log output
 */
function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().slice(11, 23); // HH:MM:SS.mmm
}

/**
 * Logger class with support for levels, namespaces, and structured context
 */
export class Logger {
  private level: LogLevel;
  private namespace: string;
  private timestamps: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? getLogLevelFromEnv();
    this.namespace = options.namespace ?? "";
    this.timestamps = options.timestamps ?? false;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatPrefix(level: LogLevel): string {
    const parts: string[] = [];

    if (this.timestamps) {
      parts.push(formatTimestamp());
    }

    if (this.namespace) {
      parts.push(`[${this.namespace}]`);
    }

    return parts.length > 0 ? parts.join(" ") + " " : "";
  }

  /**
   * Log a debug message (only shown when LOG_LEVEL=debug)
   */
  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog("debug")) return;
    const prefix = this.formatPrefix("debug");
    const contextStr = context ? formatContext(context) : "";
    console.log(`${prefix}[debug] ${message}${contextStr}`);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    if (!this.shouldLog("info")) return;
    const prefix = this.formatPrefix("info");
    const contextStr = context ? formatContext(context) : "";
    console.log(`${prefix}${message}${contextStr}`);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog("warn")) return;
    const prefix = this.formatPrefix("warn");
    const contextStr = context ? formatContext(context) : "";
    console.warn(`${prefix}[warn] ${message}${contextStr}`);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    if (!this.shouldLog("error")) return;
    const prefix = this.formatPrefix("error");
    const contextStr = context ? formatContext(context) : "";
    console.error(`${prefix}[error] ${message}${contextStr}`);

    if (error) {
      if (error instanceof Error) {
        console.error(`   ${error.message}`);
        if (this.level === "debug" && error.stack) {
          console.error(error.stack);
        }
      } else {
        console.error(`   ${String(error)}`);
      }
    }
  }

  /**
   * Log a success message (info level with checkmark prefix)
   */
  success(message: string, context?: LogContext): void {
    if (!this.shouldLog("info")) return;
    const prefix = this.formatPrefix("info");
    const contextStr = context ? formatContext(context) : "";
    console.log(`${prefix}[ok] ${message}${contextStr}`);
  }

  /**
   * Log a progress/status message
   */
  status(tag: string, message: string, context?: LogContext): void {
    if (!this.shouldLog("info")) return;
    const prefix = this.formatPrefix("info");
    const contextStr = context ? formatContext(context) : "";
    console.log(`${prefix}[${tag}] ${message}${contextStr}`);
  }

  /**
   * Log structured data (for JSON output mode)
   */
  data(data: unknown): void {
    if (!this.shouldLog("info")) return;
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * Create a child logger with a specific namespace
   */
  child(namespace: string): Logger {
    const childNamespace = this.namespace
      ? `${this.namespace}:${namespace}`
      : namespace;
    return new Logger({
      level: this.level,
      namespace: childNamespace,
      timestamps: this.timestamps,
    });
  }

  /**
   * Set the log level dynamically
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }
}

const registeredLoggers = new Set<Logger>();

function registerLogger(loggerInstance: Logger): void {
  registeredLoggers.add(loggerInstance);
}

/**
 * Set log level for all registered logger instances.
 */
export function setGlobalLogLevel(level: LogLevel): void {
  registeredLoggers.forEach((loggerInstance) => {
    loggerInstance.setLevel(level);
  });
}

/**
 * Create a logger instance with optional namespace
 */
export function createLogger(
  namespaceOrOptions?: string | LoggerOptions,
): Logger {
  const loggerInstance =
    typeof namespaceOrOptions === "string"
      ? new Logger({ namespace: namespaceOrOptions })
      : new Logger(namespaceOrOptions);
  registerLogger(loggerInstance);
  return loggerInstance;
}

// Default logger instance
export const logger = createLogger();

// Pre-configured loggers for common modules
export const loggers = {
  jobs: createLogger("jobs"),
  scrape: createLogger("scrape"),
  search: createLogger("search"),
  discover: createLogger("discover"),
  embed: createLogger("embed"),
  ask: createLogger("ask"),
  db: createLogger("db"),
  api: createLogger("api"),
  config: createLogger("config"),
  rateLimit: createLogger("rate"),
  cli: createLogger("cli"),
};

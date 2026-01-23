import type { CommandResult } from "../types/common.js";
import { ErrorCategory } from "../errors/types.js";
import type { RecoveryAction } from "../errors/types.js";
import { getOutputFormat } from "./scriptMode.js";

export interface ScriptWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ScriptError {
  type: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  actions?: RecoveryAction[];
}

export interface ScriptMeta {
  schemaVersion: number;
  timestamp: string;
  durationMs?: number;
  version?: string;
  sessionId?: number;
}

export interface ScriptEnvelope<T = unknown> {
  success: boolean;
  command: string;
  data?: T;
  warnings?: ScriptWarning[];
  error?: ScriptError;
  meta: ScriptMeta;
}

export function mapExitCode(result: CommandResult): number {
  if (result.success) return 0;

  const category = (result.data as { category?: ErrorCategory } | undefined)
    ?.category;

  switch (category) {
    case ErrorCategory.USER_INPUT:
    case ErrorCategory.COMMAND_USAGE:
    case ErrorCategory.DATA_VALIDATION:
      return 2;
    case ErrorCategory.AUTHENTICATION:
      return 3;
    case ErrorCategory.RATE_LIMIT:
      return 4;
    default:
      return 1;
  }
}

function resolveErrorType(category?: ErrorCategory, code?: string): string {
  if (category === ErrorCategory.AUTHENTICATION) return "AuthenticationError";
  if (category === ErrorCategory.RATE_LIMIT) return "RateLimitError";
  if (category === ErrorCategory.DATABASE) return "DatabaseError";
  if (category === ErrorCategory.NETWORK) return "NetworkError";
  if (category === ErrorCategory.USER_INPUT) return "ValidationError";
  if (category === ErrorCategory.CONFIGURATION) return "ConfigurationError";
  if (code) return code;
  return "UnknownError";
}

function buildScriptError(result: CommandResult): ScriptError | undefined {
  if (result.success) return undefined;

  const data = result.data as
    | {
        errorCode?: string;
        category?: ErrorCategory;
        severity?: string;
        recoveryActions?: RecoveryAction[];
      }
    | undefined;

  const code = data?.errorCode || "UNKNOWN_ERROR";
  const category = data?.category;
  const type = resolveErrorType(category, code);

  const details: Record<string, unknown> = {};
  if (category) details.category = category;
  if (data?.severity) details.severity = data.severity;

  return {
    type,
    code,
    message: result.error || result.message,
    details: Object.keys(details).length > 0 ? details : undefined,
    actions: data?.recoveryActions,
  };
}

function extractSessionId(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  const sessionId = record.sessionId;
  if (typeof sessionId === "number") return sessionId;
  const nestedSession = record.session as Record<string, unknown> | undefined;
  if (nestedSession && typeof nestedSession.id === "number") {
    return nestedSession.id;
  }
  return undefined;
}

export function buildScriptEnvelope<T>(options: {
  command: string;
  result: CommandResult<T>;
  durationMs?: number;
  version?: string;
  warnings?: ScriptWarning[];
}): ScriptEnvelope<T> {
  const { command, result, durationMs, version, warnings } = options;
  const meta: ScriptMeta = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    durationMs,
    version,
    sessionId: extractSessionId(result.data),
  };

  const error = buildScriptError(result);

  return {
    success: result.success,
    command,
    data: result.success ? result.data : undefined,
    warnings: warnings && warnings.length > 0 ? warnings : undefined,
    error,
    meta,
  };
}

export function writeScriptOutput<T>(options: {
  command: string;
  result: CommandResult<T>;
  durationMs?: number;
  version?: string;
}): void {
  const outputFormat = getOutputFormat();
  const warnings: ScriptWarning[] = [];
  let resolvedFormat = outputFormat;

  if (outputFormat !== "json" && outputFormat !== "jsonl") {
    warnings.push({
      code: "UNSUPPORTED_FORMAT",
      message: `Output format ${outputFormat} is not supported in script mode. Falling back to json.`,
    });
    resolvedFormat = "json";
  }

  const envelope = buildScriptEnvelope({
    command: options.command,
    result: options.result,
    durationMs: options.durationMs,
    version: options.version,
    warnings,
  });

  if (resolvedFormat === "jsonl") {
    const line = JSON.stringify({ event: "end", ...envelope });
    process.stdout.write(line + "\n");
    return;
  }

  process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
}

export function writeScriptStart(options: {
  command: string;
  version?: string;
}): void {
  if (getOutputFormat() !== "jsonl") return;

  const line = JSON.stringify({
    event: "start",
    command: options.command,
    meta: {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      version: options.version,
    },
  });
  process.stdout.write(line + "\n");
}

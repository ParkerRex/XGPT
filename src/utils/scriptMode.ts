import type { UserConfig } from "../config/schema.js";
import { createLogger, setGlobalLogLevel } from "./logger.js";
import { format } from "util";

export type OutputFormat = "json" | "jsonl" | "csv" | "markdown" | "txt";

export interface ScriptModeState {
  enabled: boolean;
  outputFormat: OutputFormat;
  quiet: boolean;
  noColor: boolean;
  noProgress: boolean;
}

const DEFAULT_STATE: ScriptModeState = {
  enabled: false,
  outputFormat: "json",
  quiet: false,
  noColor: false,
  noProgress: false,
};

let state: ScriptModeState = { ...DEFAULT_STATE };
let consolePatched = false;

function isTruthy(value?: string): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeOutputFormat(value?: string): OutputFormat | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (
    normalized === "json" ||
    normalized === "jsonl" ||
    normalized === "csv" ||
    normalized === "markdown" ||
    normalized === "txt"
  ) {
    return normalized as OutputFormat;
  }
  return undefined;
}

function patchConsoleForScriptMode(): void {
  if (consolePatched) return;

  const logToStderr = (...args: unknown[]) => {
    const message = format(...args);
    process.stderr.write(message + "\n");
  };

  console.log = logToStderr;
  console.info = logToStderr;

  consolePatched = true;
}

export function configureScriptMode(options: {
  enabled?: boolean;
  outputFormat?: string;
  quiet?: boolean;
  noColor?: boolean;
  noProgress?: boolean;
  config?: UserConfig | null;
  jsonFlag?: boolean;
}): ScriptModeState {
  const envEnabled = isTruthy(process.env.XGPT_SCRIPT_MODE);
  const envFormat = normalizeOutputFormat(process.env.XGPT_OUTPUT);

  const enabled = Boolean(options.enabled || envEnabled || options.jsonFlag);
  const configFormat = options.config?.output?.format;
  const resolvedFormat =
    normalizeOutputFormat(options.outputFormat) ||
    envFormat ||
    (enabled && configFormat ? normalizeOutputFormat(configFormat) : undefined) ||
    (enabled ? "json" : "json");

  const noProgress =
    enabled || Boolean(options.noProgress) || options.config?.ui?.showProgressBars === false;
  const noColor = enabled || Boolean(options.noColor) || options.config?.ui?.colorOutput === false;
  const quiet = Boolean(options.quiet);

  state = {
    enabled,
    outputFormat: resolvedFormat || "json",
    quiet,
    noColor,
    noProgress,
  };

  if (state.enabled) {
    patchConsoleForScriptMode();
    setGlobalLogLevel("warn");
  }

  if (state.quiet) {
    console.warn = () => {};
  }

  if (state.enabled || state.quiet) {
    const log = createLogger("script");
    log.debug("Script mode configured", { state });
  }

  return state;
}

export function getScriptModeState(): ScriptModeState {
  return state;
}

export function isScriptMode(): boolean {
  return state.enabled;
}

export function getOutputFormat(): OutputFormat {
  return state.outputFormat;
}

export function shouldShowProgress(): boolean {
  return !state.noProgress;
}

export function shouldUseColor(): boolean {
  return !state.noColor;
}

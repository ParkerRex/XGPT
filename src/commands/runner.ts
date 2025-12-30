/**
 * CommandRunner - Standardized command execution wrapper
 * Provides consistent execution, logging, error handling, and job tracking
 */

import type { CommandResult } from "../types/common.js";
import { handleCommandError } from "../errors/index.js";
import type { ErrorContext } from "../errors/types.js";
import { jobTracker } from "../jobs/index.js";

export interface CommandRunnerOptions {
  /** Name of the command for logging */
  name: string;
  /** Additional context for error handling */
  context?: Omit<ErrorContext, "command">;
  /** Track this command as a job in the job tracker */
  trackAsJob?: boolean;
  /** Job metadata (only used if trackAsJob is true) */
  jobMetadata?: Record<string, unknown>;
  /** Enable verbose logging */
  verbose?: boolean;
}

export interface CommandRunnerResult extends CommandResult {
  /** Duration of command execution in milliseconds */
  duration?: number;
  /** Job ID if trackAsJob was enabled */
  jobId?: string;
}

/**
 * Run a command with standardized execution handling
 */
export async function runCommand<T extends CommandResult>(
  commandFn: (jobId?: string) => Promise<T>,
  options: CommandRunnerOptions,
): Promise<CommandRunnerResult> {
  const { name, context, trackAsJob, jobMetadata, verbose } = options;
  const startTime = Date.now();
  let jobId: string | undefined;

  // Create job if tracking is enabled
  if (trackAsJob) {
    jobId = jobTracker.createJob(name, jobMetadata || {});
  }

  if (verbose) {
    console.log(`[${name}] Starting command execution...`);
  }

  try {
    // Execute the command
    const result = await commandFn(jobId);
    const duration = Date.now() - startTime;

    // Complete job if tracking
    if (jobId) {
      jobTracker.completeJob(jobId, result.success);
    }

    if (verbose) {
      console.log(
        `[${name}] Command ${result.success ? "succeeded" : "failed"} in ${duration}ms`,
      );
    }

    return {
      ...result,
      duration,
      jobId,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Complete job as failed
    if (jobId) {
      jobTracker.completeJob(jobId, false);
    }

    if (verbose) {
      console.error(`[${name}] Command failed after ${duration}ms`);
    }

    // Handle error with context
    const errorContext: ErrorContext = {
      command: name,
      ...context,
    };

    const errorResult = handleCommandError(error, errorContext);
    return {
      ...errorResult,
      duration,
      jobId,
    };
  }
}

/**
 * Create a wrapped command function with consistent execution handling
 */
export function createCommand<TOptions, TResult extends CommandResult>(
  name: string,
  handler: (options: TOptions, jobId?: string) => Promise<TResult>,
  defaultRunnerOptions?: Partial<CommandRunnerOptions>,
): (
  options: TOptions,
  runnerOptions?: Partial<CommandRunnerOptions>,
) => Promise<CommandRunnerResult> {
  return async (options, runnerOptions) => {
    const mergedOptions: CommandRunnerOptions = {
      name,
      ...defaultRunnerOptions,
      ...runnerOptions,
    };

    return runCommand((jobId) => handler(options, jobId), mergedOptions);
  };
}

/**
 * Update job progress helper - safe wrapper around jobTracker
 */
export function updateJobProgress(
  jobId: string | undefined,
  current: number,
  total: number,
  message: string,
): void {
  if (jobId) {
    jobTracker.updateProgress(jobId, current, total, message);
  }
}

/**
 * Batch execution for running multiple commands in sequence or parallel
 */
export async function runBatch<T extends CommandResult>(
  commands: Array<{
    fn: () => Promise<T>;
    options: CommandRunnerOptions;
  }>,
  options?: {
    parallel?: boolean;
    stopOnError?: boolean;
  },
): Promise<CommandRunnerResult[]> {
  const { parallel = false, stopOnError = false } = options || {};

  if (parallel) {
    // Run all commands in parallel
    const promises = commands.map(({ fn, options: cmdOptions }) =>
      runCommand(fn, cmdOptions),
    );
    return Promise.all(promises);
  }

  // Run commands sequentially
  const results: CommandRunnerResult[] = [];
  for (const { fn, options: cmdOptions } of commands) {
    const result = await runCommand(fn, cmdOptions);
    results.push(result);

    if (stopOnError && !result.success) {
      break;
    }
  }

  return results;
}

/**
 * Retry wrapper for commands that may fail transiently
 */
export async function runWithRetry<T extends CommandResult>(
  commandFn: (jobId?: string) => Promise<T>,
  options: CommandRunnerOptions & {
    maxRetries?: number;
    retryDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  },
): Promise<CommandRunnerResult> {
  const {
    maxRetries = 3,
    retryDelayMs = 1000,
    shouldRetry = () => true,
    ...runnerOptions
  } = options;

  let lastResult: CommandRunnerResult | undefined;
  let attempts = 0;

  while (attempts <= maxRetries) {
    attempts++;

    try {
      const result = await runCommand(commandFn, {
        ...runnerOptions,
        verbose: runnerOptions.verbose && attempts === 1, // Only log on first attempt
      });

      // If successful, return immediately
      if (result.success) {
        return result;
      }

      lastResult = result;

      // If we've exhausted retries or shouldn't retry, return the failure
      if (attempts > maxRetries) {
        return lastResult;
      }

      // Wait before retrying
      if (runnerOptions.verbose) {
        console.log(
          `[${runnerOptions.name}] Retrying in ${retryDelayMs}ms (attempt ${attempts}/${maxRetries})...`,
        );
      }
      await sleep(retryDelayMs);
    } catch (error) {
      if (!shouldRetry(error) || attempts > maxRetries) {
        throw error;
      }

      if (runnerOptions.verbose) {
        console.log(
          `[${runnerOptions.name}] Retrying in ${retryDelayMs}ms (attempt ${attempts}/${maxRetries})...`,
        );
      }
      await sleep(retryDelayMs);
    }
  }

  return (
    lastResult || {
      success: false,
      message: "Command failed after all retries",
      error: "Max retries exceeded",
    }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

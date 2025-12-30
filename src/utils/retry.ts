/**
 * Twitter API retry utilities
 * Provides retry logic specifically designed for Twitter/X API operations
 */

import {
  withExponentialBackoff,
  retryWithStrategy,
  RetryStrategy,
  type BackoffConfig,
  type RetryConfig,
  formatDelay,
} from "./backoff.js";

/**
 * Error categories for retry decisions
 */
export enum RetryableErrorType {
  /** Network connectivity issues - always retry */
  NETWORK = "NETWORK",
  /** Rate limiting - retry with longer delays */
  RATE_LIMIT = "RATE_LIMIT",
  /** Temporary service issues - retry a few times */
  TEMPORARY = "TEMPORARY",
  /** Authentication issues - do not retry */
  AUTHENTICATION = "AUTHENTICATION",
  /** Invalid input - do not retry */
  VALIDATION = "VALIDATION",
  /** Unknown errors - retry with caution */
  UNKNOWN = "UNKNOWN",
}

/**
 * Result of error classification
 */
export interface ErrorClassification {
  type: RetryableErrorType;
  shouldRetry: boolean;
  suggestedDelay?: number;
  friendlyMessage: string;
}

/**
 * Error patterns for classification
 */
const ERROR_PATTERNS = {
  network: [
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /ENETUNREACH/i,
    /EHOSTUNREACH/i,
    /socket hang up/i,
    /network/i,
    /connection.*failed/i,
    /fetch failed/i,
    /request.*timeout/i,
    /dns.*lookup.*failed/i,
  ],
  rateLimit: [
    /rate.?limit/i,
    /too many requests/i,
    /429/,
    /quota.*exceeded/i,
    /temporarily.*unavailable/i,
    /try again later/i,
  ],
  temporary: [
    /500/,
    /502/,
    /503/,
    /504/,
    /internal.*server.*error/i,
    /service.*unavailable/i,
    /gateway.*timeout/i,
    /bad.*gateway/i,
    /temporarily/i,
  ],
  authentication: [
    /401/,
    /403/,
    /unauthorized/i,
    /forbidden/i,
    /invalid.*token/i,
    /auth.*token/i,
    /authentication/i,
    /not.*logged.*in/i,
    /session.*expired/i,
  ],
  validation: [
    /400/,
    /422/,
    /invalid.*input/i,
    /validation.*error/i,
    /required.*parameter/i,
    /missing.*argument/i,
    /invalid.*format/i,
    /user.*not.*found/i,
    /does.*not.*exist/i,
  ],
};

/**
 * Classify an error to determine if it should be retried
 */
export function classifyError(error: unknown): ErrorClassification {
  const errorMessage = extractErrorMessage(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Check network errors - always retry
  if (ERROR_PATTERNS.network.some((pattern) => pattern.test(errorMessage))) {
    return {
      type: RetryableErrorType.NETWORK,
      shouldRetry: true,
      suggestedDelay: 2000,
      friendlyMessage: "Network connection issue. Retrying...",
    };
  }

  // Check rate limit - retry with longer delay
  if (ERROR_PATTERNS.rateLimit.some((pattern) => pattern.test(errorMessage))) {
    return {
      type: RetryableErrorType.RATE_LIMIT,
      shouldRetry: true,
      suggestedDelay: 60000, // 1 minute minimum
      friendlyMessage: "Rate limited by Twitter. Waiting before retry...",
    };
  }

  // Check temporary server errors - retry a few times
  if (ERROR_PATTERNS.temporary.some((pattern) => pattern.test(errorMessage))) {
    return {
      type: RetryableErrorType.TEMPORARY,
      shouldRetry: true,
      suggestedDelay: 5000,
      friendlyMessage: "Twitter service temporarily unavailable. Retrying...",
    };
  }

  // Check authentication - do not retry
  if (
    ERROR_PATTERNS.authentication.some((pattern) => pattern.test(errorMessage))
  ) {
    return {
      type: RetryableErrorType.AUTHENTICATION,
      shouldRetry: false,
      friendlyMessage:
        "Authentication failed. Please check your Twitter credentials.",
    };
  }

  // Check validation - do not retry
  if (ERROR_PATTERNS.validation.some((pattern) => pattern.test(errorMessage))) {
    return {
      type: RetryableErrorType.VALIDATION,
      shouldRetry: false,
      friendlyMessage: "Invalid request. Please check your input.",
    };
  }

  // Unknown error - retry with caution (limited attempts)
  return {
    type: RetryableErrorType.UNKNOWN,
    shouldRetry: true,
    suggestedDelay: 3000,
    friendlyMessage: "An unexpected error occurred. Retrying...",
  };
}

/**
 * Extract error message from various error types
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

/**
 * Twitter-specific retry configuration presets
 */
export const TwitterRetryPresets = {
  /** Conservative - fewer retries, longer delays (for sensitive accounts) */
  conservative: {
    maxAttempts: 2,
    baseDelayMs: 5000,
    maxDelayMs: 120000,
    jitterPercent: 25,
  } as Partial<BackoffConfig>,

  /** Standard - balanced retry behavior */
  standard: {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    jitterPercent: 25,
  } as Partial<BackoffConfig>,

  /** Aggressive - more retries for important operations */
  aggressive: {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterPercent: 25,
  } as Partial<BackoffConfig>,

  /** Rate limit specific - long waits for rate limit recovery */
  rateLimit: {
    maxAttempts: 3,
    baseDelayMs: 60000, // Start at 1 minute
    maxDelayMs: 300000, // Max 5 minutes
    jitterPercent: 10,
  } as Partial<BackoffConfig>,
};

/**
 * Callback for retry events
 */
export interface RetryCallback {
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
  onSuccess?: () => void;
  onFinalFailure?: (error: unknown, attempts: number) => void;
}

/**
 * Retry a Twitter API operation with automatic error classification
 */
export async function withTwitterRetry<T>(
  operation: () => Promise<T>,
  options: {
    preset?: keyof typeof TwitterRetryPresets;
    config?: Partial<BackoffConfig>;
    callbacks?: RetryCallback;
    operationName?: string;
  } = {},
): Promise<T> {
  const {
    preset = "standard",
    config,
    callbacks,
    operationName = "Twitter API call",
  } = options;

  const retryConfig = { ...TwitterRetryPresets[preset], ...config };

  let attemptCount = 0;

  const shouldRetry = (error: unknown): boolean => {
    const classification = classifyError(error);
    return classification.shouldRetry;
  };

  const onRetry = (attempt: number, delay: number, error: unknown): void => {
    attemptCount = attempt;
    const classification = classifyError(error);

    // Log retry attempt
    console.log(
      `[retry] ${operationName} failed (attempt ${attempt}). ${classification.friendlyMessage}`,
    );
    console.log(`[retry] Waiting ${formatDelay(delay)} before retry...`);

    callbacks?.onRetry?.(attempt, delay, error);
  };

  try {
    const result = await withExponentialBackoff(
      operation,
      retryConfig,
      onRetry,
    );
    callbacks?.onSuccess?.();
    return result;
  } catch (error) {
    callbacks?.onFinalFailure?.(error, attemptCount + 1);
    throw error;
  }
}

/**
 * Retry an operation with a specific strategy based on error type
 */
export async function withSmartRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    operationName?: string;
    callbacks?: RetryCallback;
  } = {},
): Promise<T> {
  const { maxAttempts = 3, operationName = "operation", callbacks } = options;

  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts = attempt + 1;
    try {
      const result = await operation();
      callbacks?.onSuccess?.();
      return result;
    } catch (error) {
      lastError = error;
      const classification = classifyError(error);

      // Don't retry non-retryable errors
      if (!classification.shouldRetry) {
        callbacks?.onFinalFailure?.(error, attempts);
        throw error;
      }

      // Last attempt - don't wait, just throw
      if (attempt === maxAttempts - 1) {
        break;
      }

      // Calculate delay based on error type
      let delay = classification.suggestedDelay || 2000;

      // Use exponential backoff for repeated failures
      delay = delay * Math.pow(2, attempt);

      // Cap the delay
      delay = Math.min(delay, 300000); // Max 5 minutes

      console.log(
        `[retry] ${operationName} failed (attempt ${attempts}/${maxAttempts}). ${classification.friendlyMessage}`,
      );
      console.log(`[retry] Waiting ${formatDelay(delay)}...`);

      callbacks?.onRetry?.(attempts, delay, error);

      await sleep(delay);
    }
  }

  callbacks?.onFinalFailure?.(lastError, attempts);
  throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
export function isRetryable(error: unknown): boolean {
  return classifyError(error).shouldRetry;
}

/**
 * Get a user-friendly message for an error
 */
export function getFriendlyErrorMessage(error: unknown): string {
  return classifyError(error).friendlyMessage;
}

/**
 * Exponential backoff utilities for handling rate limits and failures
 */

export interface BackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterPercent: number;
  maxAttempts: number;
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelayMs: 1000, // Start with 1 second
  maxDelayMs: 300000, // Max 5 minutes
  multiplier: 2, // Double each time
  jitterPercent: 25, // ±25% randomization
  maxAttempts: 8, // Max 8 attempts
};

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Partial<BackoffConfig> = {},
): number {
  const fullConfig = { ...DEFAULT_BACKOFF_CONFIG, ...config };

  // Calculate base exponential delay
  const exponentialDelay =
    fullConfig.baseDelayMs * Math.pow(fullConfig.multiplier, attempt);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, fullConfig.maxDelayMs);

  // Add jitter to avoid thundering herd
  return addJitter(cappedDelay, fullConfig.jitterPercent);
}

/**
 * Add random jitter to a delay value
 */
export function addJitter(delayMs: number, jitterPercent: number = 25): number {
  const jitterRange = delayMs * (jitterPercent / 100);
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.max(100, Math.floor(delayMs + jitter)); // Minimum 100ms
}

/**
 * Exponential backoff retry wrapper
 */
export async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  config: Partial<BackoffConfig> = {},
  onRetry?: (attempt: number, delay: number, error: unknown) => void,
): Promise<T> {
  const fullConfig = { ...DEFAULT_BACKOFF_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on the last attempt
      if (attempt === fullConfig.maxAttempts - 1) {
        break;
      }

      const delay = calculateBackoffDelay(attempt, fullConfig);

      if (onRetry) {
        onRetry(attempt + 1, delay, error);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format delay time for human-readable display
 */
export function formatDelay(delayMs: number): string {
  if (delayMs < 1000) {
    return `${delayMs}ms`;
  } else if (delayMs < 60000) {
    return `${Math.round(delayMs / 1000)}s`;
  } else {
    const minutes = Math.floor(delayMs / 60000);
    const seconds = Math.round((delayMs % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
}

/**
 * Create a rate-limited function wrapper
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic function wrapper requires any
export function createRateLimitedFunction<
  T extends (...args: any[]) => Promise<any>,
>(fn: T, minDelayMs: number = 1000): T {
  let lastCallTime = 0;

  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall < minDelayMs) {
      const waitTime = minDelayMs - timeSinceLastCall;
      await sleep(waitTime);
    }

    lastCallTime = Date.now();
    return await fn(...args);
  }) as T;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private threshold: number = 3,
    private timeoutMs: number = 60000,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.timeoutMs) {
        this.state = "half-open";
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = "open";
    }
  }

  getState(): string {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}

/**
 * Retry with different strategies
 */
export enum RetryStrategy {
  EXPONENTIAL = "exponential",
  LINEAR = "linear",
  FIXED = "fixed",
}

export interface RetryConfig {
  strategy: RetryStrategy;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterPercent: number;
}

export async function retryWithStrategy<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  shouldRetry: (error: unknown) => boolean = () => true,
): Promise<T> {
  const fullConfig: RetryConfig = {
    strategy: RetryStrategy.EXPONENTIAL,
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterPercent: 25,
    ...config,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === fullConfig.maxAttempts - 1 || !shouldRetry(error)) {
        break;
      }

      let delay: number;
      switch (fullConfig.strategy) {
        case RetryStrategy.EXPONENTIAL:
          delay = fullConfig.baseDelayMs * Math.pow(2, attempt);
          break;
        case RetryStrategy.LINEAR:
          delay = fullConfig.baseDelayMs * (attempt + 1);
          break;
        case RetryStrategy.FIXED:
        default:
          delay = fullConfig.baseDelayMs;
          break;
      }

      delay = Math.min(delay, fullConfig.maxDelayMs);
      delay = addJitter(delay, fullConfig.jitterPercent);

      await sleep(delay);
    }
  }

  throw lastError;
}

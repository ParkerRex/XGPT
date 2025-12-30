/**
 * Rate limiting configuration for X/Twitter scraping
 * Protects user accounts from suspension by enforcing conservative limits
 */

export interface RateLimitProfile {
  name: string;
  description: string;
  requestsPerMinute: number;
  requestsPerHour: number;
  minDelayMs: number;
  maxDelayMs: number;
  burstCapacity: number;
  riskLevel: "low" | "medium" | "high";
}

export const RATE_LIMIT_PROFILES: Record<string, RateLimitProfile> = {
  conservative: {
    name: "Conservative",
    description: "Safest option - minimal risk of account suspension",
    requestsPerMinute: 2,
    requestsPerHour: 60,
    minDelayMs: 30000, // 30 seconds
    maxDelayMs: 60000, // 60 seconds
    burstCapacity: 3,
    riskLevel: "low",
  },

  moderate: {
    name: "Moderate",
    description: "Balanced speed and safety - some risk but faster",
    requestsPerMinute: 4,
    requestsPerHour: 120,
    minDelayMs: 15000, // 15 seconds
    maxDelayMs: 30000, // 30 seconds
    burstCapacity: 5,
    riskLevel: "medium",
  },

  aggressive: {
    name: "Aggressive",
    description: "Fastest option - higher risk of rate limiting",
    requestsPerMinute: 8,
    requestsPerHour: 240,
    minDelayMs: 7500, // 7.5 seconds
    maxDelayMs: 15000, // 15 seconds
    burstCapacity: 10,
    riskLevel: "high",
  },
};

export interface RateLimitConfig {
  profile: RateLimitProfile;
  enableBackoff: boolean;
  maxBackoffMs: number;
  backoffMultiplier: number;
  jitterPercent: number;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export const DEFAULT_CONFIG: RateLimitConfig = {
  profile: RATE_LIMIT_PROFILES.conservative!,
  enableBackoff: true,
  maxBackoffMs: 300000, // 5 minutes max backoff
  backoffMultiplier: 2,
  jitterPercent: 25,
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 3, // 3 consecutive failures
  circuitBreakerResetMs: 600000, // 10 minutes
};

export interface RequestLog {
  timestamp: number;
  success: boolean;
  responseCode?: number;
  errorType?: string;
  delayMs: number;
}

export interface RateLimitStatus {
  profile: string;
  requestsInLastMinute: number;
  requestsInLastHour: number;
  nextRequestAllowedAt: number;
  circuitBreakerOpen: boolean;
  consecutiveFailures: number;
  averageDelayMs: number;
  successRate: number;
}

/**
 * Error types that indicate rate limiting or account issues
 */
export const RATE_LIMIT_ERROR_CODES = [
  429, // Too Many Requests
  503, // Service Unavailable
  401, // Unauthorized (potential token issue)
  403, // Forbidden (potential account issue)
];

export const RATE_LIMIT_ERROR_MESSAGES = [
  "rate limit",
  "too many requests",
  "temporarily unavailable",
  "service unavailable",
  "unauthorized",
  "forbidden",
  "suspended",
  "locked",
];

/**
 * Get rate limit profile by name with fallback to conservative
 */
export function getRateLimitProfile(profileName: string): RateLimitProfile {
  return RATE_LIMIT_PROFILES[profileName] || RATE_LIMIT_PROFILES.conservative!;
}

/**
 * Validate if a profile name is valid
 */
export function isValidProfile(profileName: string): boolean {
  return profileName in RATE_LIMIT_PROFILES;
}

/**
 * Get all available profile names
 */
export function getAvailableProfiles(): string[] {
  return Object.keys(RATE_LIMIT_PROFILES);
}

/**
 * Calculate recommended max tweets based on rate limit profile and time constraints
 */
export function getRecommendedMaxTweets(
  profile: RateLimitProfile,
  maxTimeMinutes: number = 60,
): number {
  const tweetsPerMinute = profile.requestsPerMinute;
  const recommendedMax = Math.floor(tweetsPerMinute * maxTimeMinutes);

  // Cap at reasonable limits
  const caps = {
    conservative: 500,
    moderate: 1000,
    aggressive: 2000,
  };

  const profileCap =
    caps[profile.name.toLowerCase() as keyof typeof caps] || 500;
  return Math.min(recommendedMax, profileCap);
}

/**
 * Check if an error indicates rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;
    // Check response code
    if (
      typeof errorObj.status === "number" &&
      RATE_LIMIT_ERROR_CODES.includes(errorObj.status)
    ) {
      return true;
    }

    // Check error message
    const message = (
      typeof errorObj.message === "string" ? errorObj.message : String(error)
    ).toLowerCase();
    return RATE_LIMIT_ERROR_MESSAGES.some((pattern) =>
      message.includes(pattern),
    );
  }

  return false;
}

/**
 * Add jitter to delay to avoid thundering herd
 */
export function addJitter(delayMs: number, jitterPercent: number = 25): number {
  const jitterRange = delayMs * (jitterPercent / 100);
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.max(1000, Math.floor(delayMs + jitter)); // Minimum 1 second
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  multiplier: number = 2,
  maxDelayMs: number = 300000,
): number {
  const delay = baseDelayMs * Math.pow(multiplier, attempt);
  return Math.min(delay, maxDelayMs);
}

/**
 * Rate limiting manager for X/Twitter scraping
 * Implements token bucket algorithm with exponential backoff and circuit breaker
 */

import {
  type RateLimitConfig,
  type RateLimitProfile,
  type RequestLog,
  type RateLimitStatus,
  DEFAULT_CONFIG,
  isRateLimitError,
  addJitter,
  calculateBackoffDelay
} from './config.js';

export class RateLimitManager {
  private config: RateLimitConfig;
  private requestHistory: RequestLog[] = [];
  private tokens: number;
  private lastRefill: number;
  private consecutiveFailures: number = 0;
  private circuitBreakerOpenUntil: number = 0;
  private backoffAttempt: number = 0;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokens = this.config.profile.burstCapacity;
    this.lastRefill = Date.now();
  }

  /**
   * Wait for permission to make a request
   * Implements token bucket algorithm with rate limiting
   */
  async waitForPermission(): Promise<void> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      const waitTime = this.circuitBreakerOpenUntil - Date.now();
      if (waitTime > 0) {
        console.log(`[lock] Circuit breaker open. Waiting ${Math.ceil(waitTime / 1000)}s before retry...`);
        await this.sleep(waitTime);
        this.resetCircuitBreaker();
      }
    }

    // Refill tokens based on time elapsed
    this.refillTokens();

    // If no tokens available, wait for next refill
    if (this.tokens < 1) {
      const waitTime = this.calculateWaitTime();
      console.log(`[wait] Rate limit: Waiting ${Math.ceil(waitTime / 1000)}s before next request...`);
      await this.sleep(waitTime);
      this.refillTokens();
    }

    // Consume a token
    this.tokens = Math.max(0, this.tokens - 1);

    // Add base delay with jitter
    const baseDelay = this.config.profile.minDelayMs;
    const delayWithJitter = addJitter(baseDelay, this.config.jitterPercent);
    
    // Apply exponential backoff if we've had recent failures
    let finalDelay = delayWithJitter;
    if (this.consecutiveFailures > 0 && this.config.enableBackoff) {
      const backoffDelay = calculateBackoffDelay(
        this.backoffAttempt,
        baseDelay,
        this.config.backoffMultiplier,
        this.config.maxBackoffMs
      );
      finalDelay = Math.max(delayWithJitter, backoffDelay);
      console.log(`[warn] Applying backoff: ${Math.ceil(finalDelay / 1000)}s (attempt ${this.backoffAttempt + 1})`);
    }

    if (finalDelay > 1000) {
      console.log(`[slow] Delaying ${Math.ceil(finalDelay / 1000)}s to protect your account...`);
      await this.sleep(finalDelay);
    }
  }

  /**
   * Record the result of a request for monitoring and backoff calculation
   */
  recordRequest(success: boolean, responseCode?: number, error?: any): void {
    const log: RequestLog = {
      timestamp: Date.now(),
      success,
      responseCode,
      errorType: error ? (isRateLimitError(error) ? 'rate_limit' : 'other') : undefined,
      delayMs: 0 // Will be calculated from previous request
    };

    this.requestHistory.push(log);

    // Keep only last 100 requests
    if (this.requestHistory.length > 100) {
      this.requestHistory = this.requestHistory.slice(-100);
    }

    if (success) {
      // Reset failure counters on success
      this.consecutiveFailures = 0;
      this.backoffAttempt = 0;
    } else {
      this.consecutiveFailures++;
      
      if (isRateLimitError(error)) {
        this.backoffAttempt++;
        console.log(`[error] Rate limit detected. Consecutive failures: ${this.consecutiveFailures}`);
        
        // Open circuit breaker if too many failures
        if (this.config.enableCircuitBreaker && 
            this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
          this.openCircuitBreaker();
        }
      }
    }
  }

  /**
   * Get current rate limiting status
   */
  getStatus(): RateLimitStatus {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    const recentRequests = this.requestHistory.filter(r => r.timestamp > oneMinuteAgo);
    const hourlyRequests = this.requestHistory.filter(r => r.timestamp > oneHourAgo);
    
    const successfulRequests = this.requestHistory.filter(r => r.success);
    const successRate = this.requestHistory.length > 0 
      ? successfulRequests.length / this.requestHistory.length 
      : 1;

    const averageDelay = this.requestHistory.length > 1
      ? this.requestHistory.slice(1).reduce((sum, req, i) => {
          const prevReq = this.requestHistory[i];
          return sum + (req.timestamp - prevReq!.timestamp);
        }, 0) / (this.requestHistory.length - 1)
      : this.config.profile.minDelayMs;

    return {
      profile: this.config.profile.name,
      requestsInLastMinute: recentRequests.length,
      requestsInLastHour: hourlyRequests.length,
      nextRequestAllowedAt: this.calculateNextRequestTime(),
      circuitBreakerOpen: this.isCircuitBreakerOpen(),
      consecutiveFailures: this.consecutiveFailures,
      averageDelayMs: averageDelay,
      successRate: Math.round(successRate * 100) / 100
    };
  }

  /**
   * Update rate limit profile
   */
  updateProfile(profile: RateLimitProfile): void {
    this.config.profile = profile;
    // Reset tokens to new burst capacity
    this.tokens = Math.min(this.tokens, profile.burstCapacity);
    console.log(`[config] Rate limit profile updated to: ${profile.name} (${profile.description})`);
  }

  /**
   * Check if we should pause scraping due to rate limits
   */
  shouldPauseScraping(): boolean {
    return this.isCircuitBreakerOpen() || this.consecutiveFailures >= 2;
  }

  /**
   * Get estimated time to collect a certain number of tweets
   */
  estimateCollectionTime(tweetCount: number): {
    estimatedMinutes: number;
    tweetsPerHour: number;
    recommendedMaxTweets: number;
  } {
    const profile = this.config.profile;
    const tweetsPerHour = profile.requestsPerHour;
    const estimatedMinutes = Math.ceil((tweetCount / tweetsPerHour) * 60);
    
    // Recommend a reasonable max based on 1-hour collection time
    const recommendedMaxTweets = Math.min(tweetsPerHour, 1000);

    return {
      estimatedMinutes,
      tweetsPerHour,
      recommendedMaxTweets
    };
  }

  private refillTokens(): void {
    const now = Date.now();
    const timeSinceLastRefill = now - this.lastRefill;
    const profile = this.config.profile;
    
    // Calculate tokens to add based on time elapsed
    const tokensToAdd = Math.floor(
      (timeSinceLastRefill / 60000) * profile.requestsPerMinute
    );
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(profile.burstCapacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  private calculateWaitTime(): number {
    const profile = this.config.profile;
    const tokensNeeded = 1;
    const timePerToken = 60000 / profile.requestsPerMinute; // ms per token
    return tokensNeeded * timePerToken;
  }

  private calculateNextRequestTime(): number {
    if (this.tokens >= 1) {
      return Date.now();
    }
    return Date.now() + this.calculateWaitTime();
  }

  private isCircuitBreakerOpen(): boolean {
    return Date.now() < this.circuitBreakerOpenUntil;
  }

  private openCircuitBreaker(): void {
    this.circuitBreakerOpenUntil = Date.now() + this.config.circuitBreakerResetMs;
    console.log(`[alert] Circuit breaker opened due to repeated failures. Will retry in ${Math.ceil(this.config.circuitBreakerResetMs / 60000)} minutes.`);
  }

  private resetCircuitBreaker(): void {
    this.circuitBreakerOpenUntil = 0;
    this.consecutiveFailures = 0;
    this.backoffAttempt = 0;
    console.log(`[ok] Circuit breaker reset. Resuming normal operation.`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Tweet collection time estimator
 * Provides accurate estimates based on rate limiting profiles
 */

import {
  type RateLimitProfile,
  RATE_LIMIT_PROFILES,
  getRecommendedMaxTweets
} from './config.js';

export interface CollectionEstimate {
  estimatedMinutes: number;
  estimatedHours: number;
  tweetsPerHour: number;
  tweetsPerMinute: number;
  recommendedMaxTweets: number;
  warningMessage?: string;
  riskAssessment: string;
}

export interface EstimatorOptions {
  includeFiltering?: boolean;
  filteringEfficiency?: number; // 0.1 to 1.0 (10% to 100% of tweets pass filters)
  includeProcessingTime?: boolean;
  processingTimePerTweet?: number; // milliseconds
}

export class TweetEstimator {
  /**
   * Estimate collection time for a given number of tweets and rate limit profile
   */
  static estimateCollectionTime(
    tweetCount: number,
    profile: RateLimitProfile,
    options: EstimatorOptions = {}
  ): CollectionEstimate {
    const {
      includeFiltering = false,
      filteringEfficiency = 0.7,
      includeProcessingTime = false,
      processingTimePerTweet = 100
    } = options;

    // Base calculation
    const tweetsPerMinute = profile.requestsPerMinute;
    const tweetsPerHour = profile.requestsPerHour;
    
    // Adjust for filtering if enabled
    let adjustedTweetCount = tweetCount;
    if (includeFiltering) {
      // If only 70% of tweets pass filters, we need to scrape more
      adjustedTweetCount = Math.ceil(tweetCount / filteringEfficiency);
    }

    // Calculate base scraping time
    let estimatedMinutes = adjustedTweetCount / tweetsPerMinute;
    
    // Add processing time if enabled
    if (includeProcessingTime) {
      const processingMinutes = (tweetCount * processingTimePerTweet) / 60000;
      estimatedMinutes += processingMinutes;
    }

    const estimatedHours = estimatedMinutes / 60;
    const recommendedMaxTweets = getRecommendedMaxTweets(profile, 60);

    // Generate warnings and risk assessment
    let warningMessage: string | undefined;
    let riskAssessment: string;

    if (tweetCount > recommendedMaxTweets) {
      warningMessage = `⚠️  Requesting ${tweetCount} tweets exceeds recommended limit of ${recommendedMaxTweets} for ${profile.name} profile. Consider reducing count or using a more aggressive profile.`;
    }

    if (estimatedHours > 4) {
      warningMessage = `⚠️  Estimated collection time is ${Math.ceil(estimatedHours)} hours. Consider reducing tweet count or using a more aggressive profile.`;
    }

    // Risk assessment based on profile and collection size
    if (profile.riskLevel === 'low' && tweetCount <= recommendedMaxTweets) {
      riskAssessment = '🟢 Low risk - Safe for account protection';
    } else if (profile.riskLevel === 'medium' || tweetCount > recommendedMaxTweets) {
      riskAssessment = '🟡 Medium risk - Monitor for rate limit warnings';
    } else {
      riskAssessment = '🔴 High risk - Potential account suspension risk';
    }

    return {
      estimatedMinutes: Math.ceil(estimatedMinutes),
      estimatedHours: Math.round(estimatedHours * 10) / 10,
      tweetsPerHour,
      tweetsPerMinute,
      recommendedMaxTweets,
      warningMessage,
      riskAssessment
    };
  }

  /**
   * Compare estimates across all available profiles
   */
  static compareProfiles(tweetCount: number, options: EstimatorOptions = {}): {
    [profileName: string]: CollectionEstimate;
  } {
    const comparisons: { [profileName: string]: CollectionEstimate } = {};
    
    for (const [profileName, profile] of Object.entries(RATE_LIMIT_PROFILES)) {
      comparisons[profileName] = this.estimateCollectionTime(tweetCount, profile, options);
    }
    
    return comparisons;
  }

  /**
   * Get the optimal profile for a given time constraint
   */
  static getOptimalProfile(
    tweetCount: number,
    maxTimeMinutes: number,
    options: EstimatorOptions = {}
  ): {
    profile: RateLimitProfile;
    estimate: CollectionEstimate;
    feasible: boolean;
  } {
    const comparisons = this.compareProfiles(tweetCount, options);
    
    // Find profiles that can complete within time limit
    const feasibleProfiles = Object.entries(comparisons)
      .filter(([_, estimate]) => estimate.estimatedMinutes <= maxTimeMinutes)
      .sort((a, b) => {
        // Prefer lower risk profiles when multiple options are feasible
        const riskOrder = { low: 0, medium: 1, high: 2 };
        const aRisk = RATE_LIMIT_PROFILES[a[0]]!.riskLevel;
        const bRisk = RATE_LIMIT_PROFILES[b[0]]!.riskLevel;
        return riskOrder[aRisk] - riskOrder[bRisk];
      });

    if (feasibleProfiles.length > 0) {
      const [profileName, estimate] = feasibleProfiles[0]!;
      return {
        profile: RATE_LIMIT_PROFILES[profileName]!,
        estimate,
        feasible: true
      };
    }

    // If no profile can complete in time, return the fastest (aggressive)
    return {
      profile: RATE_LIMIT_PROFILES.aggressive!,
      estimate: comparisons.aggressive!,
      feasible: false
    };
  }

  /**
   * Format estimate for user display
   */
  static formatEstimate(estimate: CollectionEstimate): string {
    const { estimatedMinutes, estimatedHours, tweetsPerHour, riskAssessment } = estimate;
    
    let timeStr: string;
    if (estimatedMinutes < 60) {
      timeStr = `${estimatedMinutes} minutes`;
    } else if (estimatedHours < 24) {
      timeStr = `${estimatedHours} hours`;
    } else {
      const days = Math.ceil(estimatedHours / 24);
      timeStr = `${days} days`;
    }

    let output = `📊 Estimated collection time: ${timeStr}\n`;
    output += `⚡ Rate: ${tweetsPerHour} tweets/hour\n`;
    output += `${riskAssessment}`;

    if (estimate.warningMessage) {
      output += `\n${estimate.warningMessage}`;
    }

    return output;
  }

  /**
   * Generate user-friendly recommendations
   */
  static getRecommendations(
    tweetCount: number,
    maxTimeMinutes: number = 60
  ): {
    recommendation: string;
    alternatives: string[];
  } {
    const optimal = this.getOptimalProfile(tweetCount, maxTimeMinutes);
    
    let recommendation: string;
    const alternatives: string[] = [];

    if (optimal.feasible) {
      recommendation = `✅ Use ${optimal.profile.name} profile to collect ${tweetCount} tweets in ${optimal.estimate.estimatedMinutes} minutes`;
    } else {
      recommendation = `⚠️  ${tweetCount} tweets cannot be collected within ${maxTimeMinutes} minutes safely`;
      
      // Suggest reducing tweet count
      const maxSafeTweets = Math.floor((maxTimeMinutes * optimal.profile.requestsPerMinute));
      alternatives.push(`📉 Reduce to ${maxSafeTweets} tweets for ${maxTimeMinutes}-minute collection`);
      
      // Suggest extending time
      const neededTime = optimal.estimate.estimatedMinutes;
      alternatives.push(`⏰ Allow ${neededTime} minutes for ${tweetCount} tweets`);
      
      // Suggest more aggressive profile if available
      const aggressive = RATE_LIMIT_PROFILES.aggressive!;
      const aggressiveEstimate = this.estimateCollectionTime(tweetCount, aggressive);
      if (aggressiveEstimate.estimatedMinutes <= maxTimeMinutes) {
        alternatives.push(`⚡ Use Aggressive profile (higher risk) to complete in ${aggressiveEstimate.estimatedMinutes} minutes`);
      }
    }

    return { recommendation, alternatives };
  }

  /**
   * Calculate progress indicators for ongoing scraping
   */
  static calculateProgress(
    tweetsCollected: number,
    targetTweets: number,
    startTime: number,
    profile: RateLimitProfile
  ): {
    percentage: number;
    eta: number;
    currentRate: number;
    estimatedTotal: number;
  } {
    const elapsed = Date.now() - startTime;
    const elapsedMinutes = elapsed / 60000;
    
    const percentage = Math.min(100, (tweetsCollected / targetTweets) * 100);
    const currentRate = elapsedMinutes > 0 ? tweetsCollected / elapsedMinutes : 0;
    
    // Estimate total time based on current rate vs expected rate
    const expectedRate = profile.requestsPerMinute;
    const actualRate = Math.max(currentRate, expectedRate * 0.5); // Don't go below 50% of expected
    
    const estimatedTotal = (targetTweets / actualRate) * 60000; // in milliseconds
    const eta = startTime + estimatedTotal;
    
    return {
      percentage: Math.round(percentage * 10) / 10,
      eta,
      currentRate: Math.round(currentRate * 10) / 10,
      estimatedTotal
    };
  }
}

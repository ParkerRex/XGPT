import { eq, desc, and, gte, lte, lt, sql, count, isNull } from "drizzle-orm";
import { db } from "./connection.js";
import {
  users,
  tweets,
  embeddings,
  scrapeSessions,
  searchTopics,
  searchSessions,
  tweetSearchOrigins,
} from "./schema.js";
import type {
  User,
  Tweet,
  NewTweet,
  Embedding,
  NewEmbedding,
  ScrapeSession,
  NewScrapeSession,
  SearchTopic,
  SearchSession,
  NewSearchSession,
  NewTweetSearchOrigin,
} from "./schema.js";
import type { PaginationOptions, PaginatedResult } from "../types/common.js";

// Profile data for user upsert
export interface ProfileData {
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  followersCount?: number;
  followingCount?: number;
  tweetsCount?: number;
  isVerified?: boolean;
}

// User operations
export const userQueries = {
  // Create or get user
  async upsertUser(
    username: string,
    displayNameOrProfile?: string | ProfileData,
  ): Promise<User> {
    // Handle legacy signature (username, displayName)
    const profile: ProfileData =
      typeof displayNameOrProfile === "string"
        ? { displayName: displayNameOrProfile }
        : (displayNameOrProfile ?? {});

    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get();

    if (existingUser) {
      // Update user with new profile data
      const [updatedUser] = await db
        .update(users)
        .set({
          lastScraped: new Date(),
          updatedAt: new Date(),
          ...(profile.displayName && { displayName: profile.displayName }),
          ...(profile.bio !== undefined && { bio: profile.bio }),
          ...(profile.location !== undefined && { location: profile.location }),
          ...(profile.website !== undefined && { website: profile.website }),
          ...(profile.followersCount !== undefined && {
            followersCount: profile.followersCount,
          }),
          ...(profile.followingCount !== undefined && {
            followingCount: profile.followingCount,
          }),
          ...(profile.tweetsCount !== undefined && {
            tweetsCount: profile.tweetsCount,
          }),
          ...(profile.isVerified !== undefined && {
            isVerified: profile.isVerified,
          }),
        })
        .where(eq(users.id, existingUser.id))
        .returning();
      return updatedUser!;
    }

    // Create new user
    const [newUser] = await db
      .insert(users)
      .values({
        username,
        displayName: profile.displayName,
        bio: profile.bio,
        location: profile.location,
        website: profile.website,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        tweetsCount: profile.tweetsCount,
        isVerified: profile.isVerified,
        lastScraped: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newUser!;
  },

  // Get user by username (excludes soft-deleted)
  async getUserByUsername(username: string): Promise<User | null> {
    return (
      (await db
        .select()
        .from(users)
        .where(and(eq(users.username, username), isNull(users.deletedAt)))
        .get()) || null
    );
  },

  // Get all users with pagination (excludes soft-deleted)
  async getAllUsers(
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<User>> {
    const { limit = 50, offset = 0 } = options;

    // Get total count of non-deleted users
    const [totalResult] = await db
      .select({ count: count() })
      .from(users)
      .where(isNull(users.deletedAt));
    const total = totalResult?.count || 0;

    // Get paginated results
    const data = await db
      .select()
      .from(users)
      .where(isNull(users.deletedAt))
      .orderBy(desc(users.lastScraped))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  },

  // Get all users (simple version for backwards compatibility)
  async getAllUsersSimple(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(isNull(users.deletedAt))
      .orderBy(desc(users.lastScraped));
  },

  // Soft delete a user
  async softDeleteUser(userId: number): Promise<void> {
    await db
      .update(users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  },

  // Restore a soft-deleted user
  async restoreUser(userId: number): Promise<void> {
    await db
      .update(users)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  },

  // Update user tweet count
  async updateTweetCount(userId: number, count: number): Promise<void> {
    await db
      .update(users)
      .set({ totalTweets: count, updatedAt: new Date() })
      .where(eq(users.id, userId));
  },
};

// Tweet operations
export const tweetQueries = {
  // Insert tweets in batch
  async insertTweets(tweetData: NewTweet[]): Promise<void> {
    if (tweetData.length === 0) return;

    // Use batch insert for better performance
    await db.insert(tweets).values(tweetData);
  },

  // Get tweets by user (excludes soft-deleted)
  async getTweetsByUser(username: string, limit = 1000): Promise<Tweet[]> {
    return await db
      .select()
      .from(tweets)
      .where(and(eq(tweets.username, username), isNull(tweets.deletedAt)))
      .orderBy(desc(tweets.createdAt))
      .limit(limit);
  },

  // Get tweets by date range (excludes soft-deleted)
  async getTweetsByDateRange(
    username: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Tweet[]> {
    return await db
      .select()
      .from(tweets)
      .where(
        and(
          eq(tweets.username, username),
          gte(tweets.createdAt, startDate),
          lte(tweets.createdAt, endDate),
          isNull(tweets.deletedAt),
        ),
      )
      .orderBy(desc(tweets.createdAt));
  },

  // Get tweets by keywords (excludes soft-deleted)
  async getTweetsByKeywords(
    username: string,
    keywords: string[],
  ): Promise<Tweet[]> {
    // Create LIKE conditions for each keyword
    const keywordConditions = keywords.map(
      (keyword) => sql`${tweets.text} LIKE ${"%" + keyword + "%"}`,
    );

    return await db
      .select()
      .from(tweets)
      .where(
        and(
          eq(tweets.username, username),
          sql`(${keywordConditions.join(" OR ")})`,
          isNull(tweets.deletedAt),
        ),
      )
      .orderBy(desc(tweets.createdAt));
  },

  // Get tweet count by user (excludes soft-deleted)
  async getTweetCount(username: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(tweets)
      .where(and(eq(tweets.username, username), isNull(tweets.deletedAt)))
      .get();
    return result?.count || 0;
  },

  // Check if tweet exists (includes soft-deleted for duplicate detection)
  async tweetExists(tweetId: string): Promise<boolean> {
    const tweet = await db
      .select()
      .from(tweets)
      .where(eq(tweets.id, tweetId))
      .get();
    return !!tweet;
  },

  // Soft delete a tweet
  async softDeleteTweet(tweetId: string): Promise<void> {
    await db
      .update(tweets)
      .set({ deletedAt: new Date() })
      .where(eq(tweets.id, tweetId));
  },

  // Restore a soft-deleted tweet
  async restoreTweet(tweetId: string): Promise<void> {
    await db
      .update(tweets)
      .set({ deletedAt: null })
      .where(eq(tweets.id, tweetId));
  },

  // Get tweets without embeddings (excludes soft-deleted)
  async getTweetsWithoutEmbeddings(username?: string): Promise<Tweet[]> {
    const baseCondition = and(
      sql`${embeddings.id} IS NULL`,
      isNull(tweets.deletedAt),
    );
    const whereCondition = username
      ? and(baseCondition, eq(tweets.username, username))
      : baseCondition;

    return await db
      .select({
        id: tweets.id,
        text: tweets.text,
        userId: tweets.userId,
        username: tweets.username,
        createdAt: tweets.createdAt,
        scrapedAt: tweets.scrapedAt,
        isRetweet: tweets.isRetweet,
        isReply: tweets.isReply,
        likes: tweets.likes,
        retweets: tweets.retweets,
        replies: tweets.replies,
        metadata: tweets.metadata,
        deletedAt: tweets.deletedAt,
      })
      .from(tweets)
      .leftJoin(embeddings, eq(tweets.id, embeddings.tweetId))
      .where(whereCondition);
  },

  // Get tweets without embeddings for a specific search session (excludes soft-deleted)
  async getTweetsWithoutEmbeddingsBySession(
    searchSessionId: number,
  ): Promise<Tweet[]> {
    return await db
      .select({
        id: tweets.id,
        text: tweets.text,
        userId: tweets.userId,
        username: tweets.username,
        createdAt: tweets.createdAt,
        scrapedAt: tweets.scrapedAt,
        isRetweet: tweets.isRetweet,
        isReply: tweets.isReply,
        likes: tweets.likes,
        retweets: tweets.retweets,
        replies: tweets.replies,
        metadata: tweets.metadata,
        deletedAt: tweets.deletedAt,
      })
      .from(tweets)
      .innerJoin(tweetSearchOrigins, eq(tweets.id, tweetSearchOrigins.tweetId))
      .leftJoin(embeddings, eq(tweets.id, embeddings.tweetId))
      .where(
        and(
          eq(tweetSearchOrigins.searchSessionId, searchSessionId),
          sql`${embeddings.id} IS NULL`,
          isNull(tweets.deletedAt),
        ),
      );
  },
};

// Embedding operations
export const embeddingQueries = {
  // Insert embeddings in batch
  async insertEmbeddings(embeddingData: NewEmbedding[]): Promise<void> {
    if (embeddingData.length === 0) return;

    await db.insert(embeddings).values(embeddingData);
  },

  // Get embeddings for similarity search
  async getEmbeddingsForSearch(username?: string): Promise<any[]> {
    const query = db
      .select({
        // Embedding fields
        embeddingId: embeddings.id,
        tweetId: embeddings.tweetId,
        model: embeddings.model,
        vector: embeddings.vector,
        dimensions: embeddings.dimensions,
        embeddingCreatedAt: embeddings.createdAt,
        // Tweet fields (flattened)
        tweetText: tweets.text,
        tweetUserId: tweets.userId,
        tweetUsername: tweets.username,
        tweetCreatedAt: tweets.createdAt,
        tweetScrapedAt: tweets.scrapedAt,
        tweetIsRetweet: tweets.isRetweet,
        tweetIsReply: tweets.isReply,
        tweetLikes: tweets.likes,
        tweetRetweets: tweets.retweets,
        tweetReplies: tweets.replies,
        tweetMetadata: tweets.metadata,
      })
      .from(embeddings)
      .innerJoin(tweets, eq(embeddings.tweetId, tweets.id));

    if (username) {
      return await query.where(eq(tweets.username, username));
    }

    return await query;
  },

  // Get embedding by tweet ID
  async getEmbeddingByTweetId(tweetId: string): Promise<Embedding | null> {
    return (
      (await db
        .select()
        .from(embeddings)
        .where(eq(embeddings.tweetId, tweetId))
        .get()) || null
    );
  },

  // Get embedding count
  async getEmbeddingCount(username?: string): Promise<number> {
    if (username) {
      const result = await db
        .select({ count: count() })
        .from(embeddings)
        .innerJoin(tweets, eq(embeddings.tweetId, tweets.id))
        .where(eq(tweets.username, username))
        .get();
      return result?.count || 0;
    }

    const result = await db.select({ count: count() }).from(embeddings).get();
    return result?.count || 0;
  },
};

// Scrape session operations
export const sessionQueries = {
  // Create scrape session
  async createSession(sessionData: NewScrapeSession): Promise<ScrapeSession> {
    const [session] = await db
      .insert(scrapeSessions)
      .values(sessionData)
      .returning();
    return session!;
  },

  // Update session status
  async updateSessionStatus(
    sessionId: number,
    status: string,
    results?: Partial<ScrapeSession>,
  ): Promise<void> {
    await db
      .update(scrapeSessions)
      .set({
        status,
        completedAt: status === "completed" ? new Date() : undefined,
        ...results,
      })
      .where(eq(scrapeSessions.id, sessionId));
  },

  // Get recent sessions
  async getRecentSessions(limit = 10): Promise<ScrapeSession[]> {
    return await db
      .select()
      .from(scrapeSessions)
      .orderBy(desc(scrapeSessions.startedAt))
      .limit(limit);
  },

  // Get sessions by user
  async getSessionsByUser(username: string): Promise<ScrapeSession[]> {
    return await db
      .select()
      .from(scrapeSessions)
      .where(eq(scrapeSessions.username, username))
      .orderBy(desc(scrapeSessions.startedAt));
  },
};

// Database statistics
export const statsQueries = {
  // Get overall statistics (excludes soft-deleted)
  async getOverallStats() {
    const [userCount] = await db
      .select({ count: count() })
      .from(users)
      .where(isNull(users.deletedAt));
    const [tweetCount] = await db
      .select({ count: count() })
      .from(tweets)
      .where(isNull(tweets.deletedAt));
    const [embeddingCount] = await db
      .select({ count: count() })
      .from(embeddings);
    const [sessionCount] = await db
      .select({ count: count() })
      .from(scrapeSessions);

    return {
      users: userCount?.count || 0,
      tweets: tweetCount?.count || 0,
      embeddings: embeddingCount?.count || 0,
      sessions: sessionCount?.count || 0,
    };
  },

  // Get user statistics
  async getUserStats(username: string) {
    const user = await userQueries.getUserByUsername(username);
    if (!user) return null;

    const tweetCount = await tweetQueries.getTweetCount(username);
    const embeddingCount = await embeddingQueries.getEmbeddingCount(username);
    const sessions = await sessionQueries.getSessionsByUser(username);

    return {
      user,
      tweetCount,
      embeddingCount,
      sessionCount: sessions.length,
      lastSession: sessions[0] || null,
    };
  },
};

// Search topic operations
export const searchTopicQueries = {
  // Create a new topic
  async createTopic(name: string, variants: string[]): Promise<SearchTopic> {
    const existing = await this.getTopicByName(name);
    if (existing) {
      throw new Error(
        `Topic "${name}" already exists. Use --name to search with it, or choose a different name.`,
      );
    }

    const [topic] = await db
      .insert(searchTopics)
      .values({
        name,
        variants,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return topic!;
  },

  // Get topic by name
  async getTopicByName(name: string): Promise<SearchTopic | null> {
    return (
      (await db
        .select()
        .from(searchTopics)
        .where(eq(searchTopics.name, name))
        .get()) || null
    );
  },

  // Get all topics
  async getAllTopics(): Promise<SearchTopic[]> {
    return await db
      .select()
      .from(searchTopics)
      .orderBy(desc(searchTopics.lastSearched));
  },

  // Update topic stats after a search
  async updateTopicStats(id: number, tweetsFound: number): Promise<void> {
    const topic = await db
      .select()
      .from(searchTopics)
      .where(eq(searchTopics.id, id))
      .get();

    if (topic) {
      await db
        .update(searchTopics)
        .set({
          lastSearched: new Date(),
          totalTweetsFound: (topic.totalTweetsFound || 0) + tweetsFound,
          updatedAt: new Date(),
        })
        .where(eq(searchTopics.id, id));
    }
  },
};

// Search session operations
export const searchSessionQueries = {
  // Create search session
  async createSession(sessionData: NewSearchSession): Promise<SearchSession> {
    const [session] = await db
      .insert(searchSessions)
      .values({
        ...sessionData,
        startedAt: new Date(),
      })
      .returning();
    return session!;
  },

  // Update session
  async updateSession(
    id: number,
    updates: Partial<SearchSession>,
  ): Promise<void> {
    await db
      .update(searchSessions)
      .set(updates)
      .where(eq(searchSessions.id, id));
  },

  // Get session by ID
  async getSessionById(id: number): Promise<SearchSession | null> {
    return (
      (await db
        .select()
        .from(searchSessions)
        .where(eq(searchSessions.id, id))
        .get()) || null
    );
  },

  // Get paused/interrupted sessions
  async getPausedSessions(): Promise<SearchSession[]> {
    return await db
      .select()
      .from(searchSessions)
      .where(eq(searchSessions.status, "paused"))
      .orderBy(desc(searchSessions.startedAt));
  },

  // Clean up old sessions
  async cleanupOldSessions(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await db
      .delete(searchSessions)
      .where(lt(searchSessions.startedAt, cutoffDate));

    return result.changes || 0;
  },

  // Save cursor for resume support
  async saveCursor(
    sessionId: number,
    cursor: string,
    lastTweetId: string,
  ): Promise<void> {
    await db
      .update(searchSessions)
      .set({
        cursor,
        lastTweetId,
      })
      .where(eq(searchSessions.id, sessionId));
  },

  // Get cursor for resume
  async getCursor(
    sessionId: number,
  ): Promise<{ cursor: string; lastTweetId: string } | null> {
    const session = await db
      .select({
        cursor: searchSessions.cursor,
        lastTweetId: searchSessions.lastTweetId,
      })
      .from(searchSessions)
      .where(eq(searchSessions.id, sessionId))
      .get();

    if (session?.cursor && session?.lastTweetId) {
      return {
        cursor: session.cursor,
        lastTweetId: session.lastTweetId,
      };
    }
    return null;
  },
};

// Tweet search origin operations
export const tweetOriginQueries = {
  // Record tweet origin (first-origin-only via UNIQUE constraint)
  async recordTweetOrigin(data: NewTweetSearchOrigin): Promise<boolean> {
    try {
      await db.insert(tweetSearchOrigins).values({
        ...data,
        foundAt: new Date(),
      });
      return true;
    } catch (e) {
      // If it's a UNIQUE constraint violation, the origin already exists
      if (
        e instanceof Error &&
        e.message.includes("UNIQUE constraint failed")
      ) {
        return false;
      }
      throw e;
    }
  },

  // Get tweet IDs by session
  async getTweetsBySession(sessionId: number): Promise<string[]> {
    const results = await db
      .select({ tweetId: tweetSearchOrigins.tweetId })
      .from(tweetSearchOrigins)
      .where(eq(tweetSearchOrigins.searchSessionId, sessionId));

    return results.map((r) => r.tweetId);
  },

  // Get variant breakdown for a session
  async getVariantBreakdown(
    sessionId: number,
  ): Promise<Record<string, number>> {
    const results = await db
      .select({
        variant: tweetSearchOrigins.matchedVariant,
        count: count(),
      })
      .from(tweetSearchOrigins)
      .where(eq(tweetSearchOrigins.searchSessionId, sessionId))
      .groupBy(tweetSearchOrigins.matchedVariant);

    const breakdown: Record<string, number> = {};
    for (const row of results) {
      breakdown[row.variant] = row.count;
    }
    return breakdown;
  },
};

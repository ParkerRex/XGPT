import { eq, desc, and, gte, lte, sql, count } from "drizzle-orm";
import { db } from "./connection.js";
import { users, tweets, embeddings, scrapeSessions } from "./schema.js";
import type {
  User,
  Tweet,
  NewTweet,
  Embedding,
  NewEmbedding,
  ScrapeSession,
  NewScrapeSession,
} from "./schema.js";

// User operations
export const userQueries = {
  // Create or get user
  async upsertUser(username: string, displayName?: string): Promise<User> {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get();

    if (existingUser) {
      // Update last scraped time
      const [updatedUser] = await db
        .update(users)
        .set({
          lastScraped: new Date(),
          updatedAt: new Date(),
          ...(displayName && { displayName }),
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
        displayName,
        lastScraped: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newUser!;
  },

  // Get user by username
  async getUserByUsername(username: string): Promise<User | null> {
    return (
      (await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .get()) || null
    );
  },

  // Get all users
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.lastScraped));
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

  // Get tweets by user
  async getTweetsByUser(username: string, limit = 1000): Promise<Tweet[]> {
    return await db
      .select()
      .from(tweets)
      .where(eq(tweets.username, username))
      .orderBy(desc(tweets.createdAt))
      .limit(limit);
  },

  // Get tweets by date range
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
        ),
      )
      .orderBy(desc(tweets.createdAt));
  },

  // Get tweets by keywords
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
        ),
      )
      .orderBy(desc(tweets.createdAt));
  },

  // Get tweet count by user
  async getTweetCount(username: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(tweets)
      .where(eq(tweets.username, username))
      .get();
    return result?.count || 0;
  },

  // Check if tweet exists
  async tweetExists(tweetId: string): Promise<boolean> {
    const tweet = await db
      .select()
      .from(tweets)
      .where(eq(tweets.id, tweetId))
      .get();
    return !!tweet;
  },

  // Get tweets without embeddings
  async getTweetsWithoutEmbeddings(username?: string): Promise<Tweet[]> {
    const whereCondition = username
      ? and(sql`${embeddings.id} IS NULL`, eq(tweets.username, username))
      : sql`${embeddings.id} IS NULL`;

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
      })
      .from(tweets)
      .leftJoin(embeddings, eq(tweets.id, embeddings.tweetId))
      .where(whereCondition);
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
  // Get overall statistics
  async getOverallStats() {
    const [userCount] = await db.select({ count: count() }).from(users);
    const [tweetCount] = await db.select({ count: count() }).from(tweets);
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

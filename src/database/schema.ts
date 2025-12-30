import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Users table - tracks scraped Twitter users
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  bio: text("bio"),
  location: text("location"),
  website: text("website"),
  followersCount: integer("followers_count"),
  followingCount: integer("following_count"),
  tweetsCount: integer("tweets_count"),
  isVerified: integer("is_verified", { mode: "boolean" }),
  lastScraped: integer("last_scraped", { mode: "timestamp" }),
  totalTweets: integer("total_tweets").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Tweets table - stores scraped tweets
export const tweets = sqliteTable("tweets", {
  id: text("id").primaryKey(), // Twitter's tweet ID
  text: text("text").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  username: text("username").notNull(), // Denormalized for faster queries
  createdAt: integer("created_at", { mode: "timestamp" }),
  scrapedAt: integer("scraped_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),

  // Tweet metadata
  isRetweet: integer("is_retweet", { mode: "boolean" }).default(false),
  isReply: integer("is_reply", { mode: "boolean" }).default(false),
  likes: integer("likes").default(0),
  retweets: integer("retweets").default(0),
  replies: integer("replies").default(0),

  // Additional metadata as JSON
  metadata: text("metadata", { mode: "json" }),
});

// Embeddings table - stores vector embeddings for tweets
export const embeddings = sqliteTable("embeddings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tweetId: text("tweet_id")
    .notNull()
    .references(() => tweets.id, { onDelete: "cascade" }),
  model: text("model").notNull(), // e.g., "text-embedding-3-small"
  vector: text("vector", { mode: "json" }).notNull(), // JSON array of numbers
  dimensions: integer("dimensions").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Scrape sessions table - tracks scraping sessions and their configuration
export const scrapeSessions = sqliteTable("scrape_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  username: text("username").notNull(),

  // Session configuration
  contentType: text("content_type").notNull(), // 'tweets', 'replies', 'both'
  searchScope: text("search_scope").notNull(), // 'all', 'keywords'
  keywords: text("keywords", { mode: "json" }), // JSON array of keywords
  timeRange: text("time_range").notNull(), // 'week', 'month', etc.
  customDateRange: text("custom_date_range", { mode: "json" }), // { start, end }
  maxTweets: integer("max_tweets").notNull(),

  // Session results
  tweetsCollected: integer("tweets_collected").default(0),
  totalProcessed: integer("total_processed").default(0),
  contentFiltered: integer("content_filtered").default(0),
  keywordFiltered: integer("keyword_filtered").default(0),
  dateFiltered: integer("date_filtered").default(0),

  // Session metadata
  status: text("status").notNull().default("pending"), // 'pending', 'running', 'completed', 'failed'
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),

  // Processing flags
  embeddingsGenerated: integer("embeddings_generated", {
    mode: "boolean",
  }).default(false),
});

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
  tweets: many(tweets),
  scrapeSessions: many(scrapeSessions),
}));

export const tweetsRelations = relations(tweets, ({ one, many }) => ({
  user: one(users, {
    fields: [tweets.userId],
    references: [users.id],
  }),
  embeddings: many(embeddings),
}));

export const embeddingsRelations = relations(embeddings, ({ one }) => ({
  tweet: one(tweets, {
    fields: [embeddings.tweetId],
    references: [tweets.id],
  }),
}));

export const scrapeSessionsRelations = relations(scrapeSessions, ({ one }) => ({
  user: one(users, {
    fields: [scrapeSessions.userId],
    references: [users.id],
  }),
}));

// Search topics table - saved search configurations
export const searchTopics = sqliteTable("search_topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  variants: text("variants", { mode: "json" }).notNull().$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastSearched: integer("last_searched", { mode: "timestamp" }),
  totalTweetsFound: integer("total_tweets_found").default(0),
});

// Search sessions table - individual search runs
export const searchSessions = sqliteTable("search_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id").references(() => searchTopics.id),
  scrapeSessionId: integer("scrape_session_id").references(
    () => scrapeSessions.id,
  ),

  // Configuration
  query: text("query").notNull(),
  variants: text("variants", { mode: "json" }).notNull().$type<string[]>(),
  searchMode: text("search_mode").notNull().default("Latest"),
  maxTweets: integer("max_tweets").notNull(),
  dateStart: integer("date_start", { mode: "timestamp" }),
  dateEnd: integer("date_end", { mode: "timestamp" }),

  // Resume support
  cursor: text("cursor"),
  lastTweetId: text("last_tweet_id"),

  // Results
  tweetsCollected: integer("tweets_collected").default(0),
  totalProcessed: integer("total_processed").default(0),
  dateFiltered: integer("date_filtered").default(0),
  duplicatesSkipped: integer("duplicates_skipped").default(0),
  usersCreated: integer("users_created").default(0),

  // Status
  status: text("status").notNull().default("pending"),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
  embeddingsGenerated: integer("embeddings_generated", {
    mode: "boolean",
  }).default(false),
});

// Tweet search origins table - links tweets to searches (first origin only)
export const tweetSearchOrigins = sqliteTable(
  "tweet_search_origins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tweetId: text("tweet_id")
      .notNull()
      .unique()
      .references(() => tweets.id, { onDelete: "cascade" }),
    searchSessionId: integer("search_session_id")
      .notNull()
      .references(() => searchSessions.id),
    matchedVariant: text("matched_variant").notNull(),
    foundAt: integer("found_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    sessionIdx: index("idx_origins_session").on(table.searchSessionId),
    variantIdx: index("idx_origins_variant").on(table.matchedVariant),
  }),
);

// Search topics relations
export const searchTopicsRelations = relations(searchTopics, ({ many }) => ({
  searchSessions: many(searchSessions),
}));

// Search sessions relations
export const searchSessionsRelations = relations(
  searchSessions,
  ({ one, many }) => ({
    topic: one(searchTopics, {
      fields: [searchSessions.topicId],
      references: [searchTopics.id],
    }),
    scrapeSession: one(scrapeSessions, {
      fields: [searchSessions.scrapeSessionId],
      references: [scrapeSessions.id],
    }),
    tweetOrigins: many(tweetSearchOrigins),
  }),
);

// Tweet search origins relations
export const tweetSearchOriginsRelations = relations(
  tweetSearchOrigins,
  ({ one }) => ({
    tweet: one(tweets, {
      fields: [tweetSearchOrigins.tweetId],
      references: [tweets.id],
    }),
    searchSession: one(searchSessions, {
      fields: [tweetSearchOrigins.searchSessionId],
      references: [searchSessions.id],
    }),
  }),
);

// TypeScript types derived from schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Tweet = typeof tweets.$inferSelect;
export type NewTweet = typeof tweets.$inferInsert;

export type Embedding = typeof embeddings.$inferSelect;
export type NewEmbedding = typeof embeddings.$inferInsert;

export type ScrapeSession = typeof scrapeSessions.$inferSelect;
export type NewScrapeSession = typeof scrapeSessions.$inferInsert;

export type SearchTopic = typeof searchTopics.$inferSelect;
export type NewSearchTopic = typeof searchTopics.$inferInsert;

export type SearchSession = typeof searchSessions.$inferSelect;
export type NewSearchSession = typeof searchSessions.$inferInsert;

export type TweetSearchOrigin = typeof tweetSearchOrigins.$inferSelect;
export type NewTweetSearchOrigin = typeof tweetSearchOrigins.$inferInsert;

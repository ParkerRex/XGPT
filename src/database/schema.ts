import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Users table - tracks scraped Twitter users
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
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

// TypeScript types derived from schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Tweet = typeof tweets.$inferSelect;
export type NewTweet = typeof tweets.$inferInsert;

export type Embedding = typeof embeddings.$inferSelect;
export type NewEmbedding = typeof embeddings.$inferInsert;

export type ScrapeSession = typeof scrapeSessions.$inferSelect;
export type NewScrapeSession = typeof scrapeSessions.$inferInsert;

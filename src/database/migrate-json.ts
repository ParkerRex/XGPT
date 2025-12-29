#!/usr/bin/env bun

import { readFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import * as cliProgress from "cli-progress";
import {
  userQueries,
  tweetQueries,
  embeddingQueries,
  statsQueries,
} from "./queries.js";
import type { Tweet, TweetWithEmbedding } from "../types/common.js";

// Migration configuration
interface MigrationConfig {
  tweetsFile: string;
  vectorsFile: string;
  backupDir: string;
  batchSize: number;
  validateData: boolean;
  createBackup: boolean;
}

// Migration statistics
interface MigrationStats {
  tweetsProcessed: number;
  tweetsInserted: number;
  embeddingsProcessed: number;
  embeddingsInserted: number;
  usersCreated: number;
  errors: string[];
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

// Default configuration
const DEFAULT_CONFIG: MigrationConfig = {
  tweetsFile: "tweets.json",
  vectorsFile: "vectors.json",
  backupDir: "./data/backups",
  batchSize: 1000,
  validateData: true,
  createBackup: true,
};

/**
 * Main migration function - migrates JSON data to SQLite
 */
export async function migrateJsonToSqlite(
  config: Partial<MigrationConfig> = {},
): Promise<MigrationStats> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const stats: MigrationStats = {
    tweetsProcessed: 0,
    tweetsInserted: 0,
    embeddingsProcessed: 0,
    embeddingsInserted: 0,
    usersCreated: 0,
    errors: [],
    startTime: new Date(),
  };

  try {
    console.log("[start] Starting JSON to SQLite migration...");
    console.log(`[stats] Configuration:`);
    console.log(`   • Tweets file: ${finalConfig.tweetsFile}`);
    console.log(`   • Vectors file: ${finalConfig.vectorsFile}`);
    console.log(`   • Batch size: ${finalConfig.batchSize}`);
    console.log(`   • Create backup: ${finalConfig.createBackup}`);
    console.log(`   • Validate data: ${finalConfig.validateData}`);
    console.log();

    // Step 1: Create backups if requested
    if (finalConfig.createBackup) {
      await createBackups(finalConfig, stats);
    }

    // Step 2: Validate and load JSON files
    const { tweets, embeddings } = await loadAndValidateJsonFiles(
      finalConfig,
      stats,
    );

    // Step 3: Migrate tweets data
    if (tweets.length > 0) {
      await migrateTweets(tweets, finalConfig, stats);
    }

    // Step 4: Migrate embeddings data
    if (embeddings.length > 0) {
      await migrateEmbeddings(embeddings, finalConfig, stats);
    }

    // Step 5: Verify data integrity
    await verifyDataIntegrity(stats);

    stats.endTime = new Date();
    stats.duration = stats.endTime.getTime() - stats.startTime.getTime();

    console.log("\n[ok] Migration completed successfully!");
    printMigrationSummary(stats);

    return stats;
  } catch (error) {
    stats.endTime = new Date();
    stats.duration = stats.endTime
      ? stats.endTime.getTime() - stats.startTime.getTime()
      : 0;

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    stats.errors.push(errorMessage);

    console.error("\n[error] Migration failed:", errorMessage);
    throw error;
  }
}

/**
 * Create backups of JSON files before migration
 */
async function createBackups(
  config: MigrationConfig,
  stats: MigrationStats,
): Promise<void> {
  console.log("[save] Creating backups...");

  try {
    // Create backup directory if it doesn't exist
    await Bun.write(`${config.backupDir}/.gitkeep`, "");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Backup tweets.json if it exists
    if (existsSync(config.tweetsFile)) {
      const backupPath = `${config.backupDir}/tweets-${timestamp}.json`;
      await copyFile(config.tweetsFile, backupPath);
      console.log(`   [ok] Backed up ${config.tweetsFile} → ${backupPath}`);
    }

    // Backup vectors.json if it exists
    if (existsSync(config.vectorsFile)) {
      const backupPath = `${config.backupDir}/vectors-${timestamp}.json`;
      await copyFile(config.vectorsFile, backupPath);
      console.log(`   [ok] Backed up ${config.vectorsFile} → ${backupPath}`);
    }

    console.log("[ok] Backups created successfully\n");
  } catch (error) {
    const errorMessage = `Backup creation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    stats.errors.push(errorMessage);
    console.warn(`[warn] ${errorMessage}`);
  }
}

/**
 * Load and validate JSON files
 */
async function loadAndValidateJsonFiles(
  config: MigrationConfig,
  stats: MigrationStats,
): Promise<{
  tweets: Tweet[];
  embeddings: TweetWithEmbedding[];
}> {
  console.log("[load] Loading and validating JSON files...");

  let tweets: Tweet[] = [];
  let embeddings: TweetWithEmbedding[] = [];

  // Load tweets.json
  try {
    if (existsSync(config.tweetsFile)) {
      const tweetsContent = await readFile(config.tweetsFile, "utf8");
      const parsedTweets = JSON.parse(tweetsContent);

      if (Array.isArray(parsedTweets)) {
        tweets = parsedTweets;
        console.log(
          `   [ok] Loaded ${tweets.length} tweets from ${config.tweetsFile}`,
        );
      } else {
        throw new Error("Tweets file does not contain an array");
      }
    } else {
      console.log(
        `   [warn] ${config.tweetsFile} not found, skipping tweets migration`,
      );
    }
  } catch (error) {
    const errorMessage = `Failed to load tweets: ${error instanceof Error ? error.message : "Unknown error"}`;
    stats.errors.push(errorMessage);
    throw new Error(errorMessage);
  }

  // Load vectors.json
  try {
    if (existsSync(config.vectorsFile)) {
      const vectorsContent = await readFile(config.vectorsFile, "utf8");
      const parsedVectors = JSON.parse(vectorsContent);

      if (Array.isArray(parsedVectors)) {
        embeddings = parsedVectors;
        console.log(
          `   [ok] Loaded ${embeddings.length} embeddings from ${config.vectorsFile}`,
        );
      } else {
        throw new Error("Vectors file does not contain an array");
      }
    } else {
      console.log(
        `   [warn] ${config.vectorsFile} not found, skipping embeddings migration`,
      );
    }
  } catch (error) {
    const errorMessage = `Failed to load embeddings: ${error instanceof Error ? error.message : "Unknown error"}`;
    stats.errors.push(errorMessage);
    console.warn(`[warn] ${errorMessage}`);
  }

  // Validate data if requested
  if (config.validateData) {
    await validateJsonData(tweets, embeddings, stats);
  }

  console.log("[ok] JSON files loaded and validated\n");
  return { tweets, embeddings };
}

/**
 * Validate JSON data structure and content
 */
async function validateJsonData(
  tweets: Tweet[],
  embeddings: TweetWithEmbedding[],
  stats: MigrationStats,
): Promise<void> {
  console.log("[search] Validating data structure...");

  // Validate tweets structure
  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    if (!tweet?.id || !tweet.text || !tweet.user) {
      const error = `Tweet at index ${i} missing required fields (id, text, user)`;
      stats.errors.push(error);
      throw new Error(error);
    }
  }

  // Validate embeddings structure
  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    if (!embedding?.id || !embedding.vec || !Array.isArray(embedding.vec)) {
      const error = `Embedding at index ${i} missing required fields (id, vec array)`;
      stats.errors.push(error);
      throw new Error(error);
    }
  }

  console.log("   [ok] Data structure validation passed");
}

/**
 * Migrate tweets to SQLite database
 */
async function migrateTweets(
  tweets: Tweet[],
  config: MigrationConfig,
  stats: MigrationStats,
): Promise<void> {
  console.log(`[scrape] Migrating ${tweets.length} tweets to SQLite...`);

  // Create progress bar
  const progressBar = new cliProgress.SingleBar({
    format:
      "[scrape] Tweets |{bar}| {percentage}% | {value}/{total} | Users: {users} | ETA: {eta}s",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  progressBar.start(tweets.length, 0, { users: 0 });

  try {
    // Process tweets in batches
    const batches = chunkArray(tweets, config.batchSize);
    let processedCount = 0;
    const userMap = new Map<string, number>(); // username -> user_id

    for (const batch of batches) {
      const tweetData = [];

      for (const tweet of batch) {
        try {
          // Get or create user
          let userId = userMap.get(tweet.user!);
          if (!userId) {
            const existingUser = await userQueries.getUserByUsername(
              tweet.user!,
            );
            if (existingUser) {
              userId = existingUser.id;
            } else {
              // Create new user using upsertUser
              const newUser = await userQueries.upsertUser(
                tweet.user!,
                tweet.user,
              );
              userId = newUser.id;
              stats.usersCreated++;
            }
            userMap.set(tweet.user!, userId);
          }

          // Prepare tweet data for insertion
          const tweetRecord = {
            id: tweet.id,
            text: tweet.text,
            userId: userId,
            username: tweet.user!,
            createdAt: tweet.created_at
              ? new Date(tweet.created_at)
              : new Date(),
            scrapedAt: new Date(),
            isRetweet: tweet.metadata?.isRetweet || false,
            isReply: tweet.metadata?.isReply || false,
            likes: tweet.metadata?.likes || 0,
            retweets: tweet.metadata?.retweets || 0,
            replies: tweet.metadata?.replies || 0,
            metadata: tweet.metadata ? JSON.stringify(tweet.metadata) : null,
          };

          tweetData.push(tweetRecord);
          stats.tweetsProcessed++;
        } catch (error) {
          const errorMessage = `Failed to process tweet ${tweet.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
          stats.errors.push(errorMessage);
          console.warn(`[warn] ${errorMessage}`);
        }
      }

      // Batch insert tweets
      if (tweetData.length > 0) {
        try {
          await tweetQueries.insertTweets(tweetData);
          stats.tweetsInserted += tweetData.length;
        } catch (error) {
          const errorMessage = `Failed to insert tweet batch: ${error instanceof Error ? error.message : "Unknown error"}`;
          stats.errors.push(errorMessage);
          throw new Error(errorMessage);
        }
      }

      processedCount += batch.length;
      progressBar.update(processedCount, { users: stats.usersCreated });
    }

    progressBar.stop();
    console.log(
      `[ok] Successfully migrated ${stats.tweetsInserted} tweets (${stats.usersCreated} users created)\n`,
    );
  } catch (error) {
    progressBar.stop();
    throw error;
  }
}

/**
 * Migrate embeddings to SQLite database
 */
async function migrateEmbeddings(
  embeddings: TweetWithEmbedding[],
  config: MigrationConfig,
  stats: MigrationStats,
): Promise<void> {
  console.log(`[embed] Migrating ${embeddings.length} embeddings to SQLite...`);

  // Create progress bar
  const progressBar = new cliProgress.SingleBar({
    format:
      "[embed] Embeddings |{bar}| {percentage}% | {value}/{total} | Dims: {dims} | ETA: {eta}s",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  progressBar.start(embeddings.length, 0, { dims: 0 });

  try {
    // Process embeddings in batches
    const batches = chunkArray(embeddings, config.batchSize);
    let processedCount = 0;
    let vectorDimensions = 0;

    for (const batch of batches) {
      const embeddingData = [];

      for (const embedding of batch) {
        try {
          // Check if tweet exists in database
          const tweetExists = await tweetQueries.tweetExists(embedding.id);
          if (!tweetExists) {
            const errorMessage = `Tweet ${embedding.id} not found in database, skipping embedding`;
            stats.errors.push(errorMessage);
            console.warn(`[warn] ${errorMessage}`);
            continue;
          }

          // Prepare embedding data for insertion
          const embeddingRecord = {
            tweetId: embedding.id,
            model: "text-embedding-3-small", // Default model, could be configurable
            vector: JSON.stringify(embedding.vec),
            dimensions: embedding.vec.length,
            createdAt: new Date(),
          };

          embeddingData.push(embeddingRecord);
          stats.embeddingsProcessed++;

          if (vectorDimensions === 0) {
            vectorDimensions = embedding.vec.length;
          }
        } catch (error) {
          const errorMessage = `Failed to process embedding for tweet ${embedding.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
          stats.errors.push(errorMessage);
          console.warn(`[warn] ${errorMessage}`);
        }
      }

      // Batch insert embeddings
      if (embeddingData.length > 0) {
        try {
          await embeddingQueries.insertEmbeddings(embeddingData);
          stats.embeddingsInserted += embeddingData.length;
        } catch (error) {
          const errorMessage = `Failed to insert embedding batch: ${error instanceof Error ? error.message : "Unknown error"}`;
          stats.errors.push(errorMessage);
          throw new Error(errorMessage);
        }
      }

      processedCount += batch.length;
      progressBar.update(processedCount, { dims: vectorDimensions });
    }

    progressBar.stop();
    console.log(
      `[ok] Successfully migrated ${stats.embeddingsInserted} embeddings (${vectorDimensions}D vectors)\n`,
    );
  } catch (error) {
    progressBar.stop();
    throw error;
  }
}

/**
 * Verify data integrity after migration
 */
async function verifyDataIntegrity(stats: MigrationStats): Promise<void> {
  console.log("[search] Verifying data integrity...");

  try {
    // Get database statistics
    const dbStats = await statsQueries.getOverallStats();

    console.log("   [stats] Database verification:");
    console.log(`      • Users in DB: ${dbStats.users}`);
    console.log(`      • Tweets in DB: ${dbStats.tweets}`);
    console.log(`      • Embeddings in DB: ${dbStats.embeddings}`);

    // Verify counts match migration stats
    if (dbStats.tweets !== stats.tweetsInserted) {
      throw new Error(
        `Tweet count mismatch: expected ${stats.tweetsInserted}, found ${dbStats.tweets}`,
      );
    }

    if (dbStats.embeddings !== stats.embeddingsInserted) {
      throw new Error(
        `Embedding count mismatch: expected ${stats.embeddingsInserted}, found ${dbStats.embeddings}`,
      );
    }

    console.log("   [ok] Data integrity verification passed");
  } catch (error) {
    const errorMessage = `Data integrity verification failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    stats.errors.push(errorMessage);
    throw new Error(errorMessage);
  }
}

/**
 * Print migration summary
 */
function printMigrationSummary(stats: MigrationStats): void {
  console.log("\n[list] MIGRATION SUMMARY");
  console.log("=".repeat(50));
  console.log(
    `⏱️  Duration: ${stats.duration ? Math.round(stats.duration / 1000) : 0}s`,
  );
  console.log(`👥 Users created: ${stats.usersCreated}`);
  console.log(`[scrape] Tweets processed: ${stats.tweetsProcessed}`);
  console.log(`[scrape] Tweets inserted: ${stats.tweetsInserted}`);
  console.log(`[embed] Embeddings processed: ${stats.embeddingsProcessed}`);
  console.log(`[embed] Embeddings inserted: ${stats.embeddingsInserted}`);

  if (stats.errors.length > 0) {
    console.log(`[warn] Errors: ${stats.errors.length}`);
    stats.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  } else {
    console.log(`[ok] Errors: 0`);
  }
  console.log("=".repeat(50));
}

/**
 * Utility function to chunk arrays into smaller batches
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * CLI command function for migration
 */
export async function runMigration(
  options: {
    tweetsFile?: string;
    vectorsFile?: string;
    batchSize?: number;
    skipBackup?: boolean;
    skipValidation?: boolean;
  } = {},
): Promise<void> {
  try {
    const config: Partial<MigrationConfig> = {
      tweetsFile: options.tweetsFile || "tweets.json",
      vectorsFile: options.vectorsFile || "vectors.json",
      batchSize: options.batchSize || 1000,
      createBackup: !options.skipBackup,
      validateData: !options.skipValidation,
    };

    const stats = await migrateJsonToSqlite(config);

    if (stats.errors.length > 0) {
      console.log(
        `\n[warn] Migration completed with ${stats.errors.length} warnings`,
      );
      process.exit(1);
    } else {
      console.log("\n[success] Migration completed successfully!");
      process.exit(0);
    }
  } catch (error) {
    console.error(
      "\n[error] Migration failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exit(1);
  }
}

// Export types for external use
export type { MigrationConfig, MigrationStats };

import OpenAI from "openai";
import "dotenv/config";
import type {
  Tweet,
  TweetWithEmbedding,
  EmbeddingOptions,
  CommandResult,
} from "../types/common.js";
import type { ProgressContext } from "../ui/index.js";
import { tweetQueries, embeddingQueries } from "../database/queries.js";
import type { NewEmbedding } from "../database/schema.js";
import { loadConfig } from "../config/manager.js";
import {
  handleCommandError,
  AuthenticationError,
  DatabaseError,
  NetworkError,
  ErrorCategory,
} from "../errors/index.js";
import {
  createProgressBar,
  ProgressPresets,
  withSpinner,
  StatusLine,
} from "../ui/index.js";
import { chunkArray } from "../utils/array.js";

export async function embedCommand(
  options: EmbeddingOptions = {},
): Promise<CommandResult> {
  try {
    // Load user configuration for defaults
    const userConfig = await loadConfig();

    const {
      model = userConfig.embedding.model,
      batchSize = userConfig.embedding.batchSize,
      inputFile = "tweets.json", // Legacy parameter, now ignored
      outputFile = "vectors.json", // Legacy parameter, now ignored
    } = options;

    console.log(`🧠 Starting embedding generation...`);
    console.log(`📊 Model: ${model}, Batch size: ${batchSize}`);

    // Check for OpenAI API key (from config or environment)
    const apiKey = userConfig.api.openaiKey || process.env.OPENAI_KEY;
    if (!apiKey) {
      const authError = new AuthenticationError(
        "OpenAI API key is missing or invalid",
        {
          command: "embed",
          operation: "api_key_check",
        },
      );
      return handleCommandError(authError);
    }

    // Read tweets from database
    console.log(`📖 Reading tweets from database...`);
    let tweets: Tweet[];

    try {
      const dbTweets = await tweetQueries.getTweetsWithoutEmbeddings();

      if (dbTweets.length === 0) {
        return {
          success: false,
          message: "No tweets without embeddings found in database",
          error:
            "All tweets already have embeddings, or no tweets exist. Scrape some tweets first using: xgpt scrape <username>",
        };
      }

      // Convert database tweets to Tweet format
      tweets = dbTweets.map((dbTweet) => ({
        id: dbTweet.id,
        text: dbTweet.text,
        user: dbTweet.username,
        created_at: dbTweet.createdAt?.toISOString(),
        metadata: dbTweet.metadata
          ? JSON.parse(dbTweet.metadata as string)
          : undefined,
      }));
    } catch (error) {
      return {
        success: false,
        message: "Failed to read tweets from database",
        error: error instanceof Error ? error.message : "Database query failed",
      };
    }

    console.log(`📊 Found ${tweets.length} tweets to embed`);

    const openai = new OpenAI({ apiKey: apiKey });
    const embeddings: TweetWithEmbedding[] = [];
    const embeddingBatch: NewEmbedding[] = [];

    // Process tweets in chunks
    const chunks = chunkArray(tweets, batchSize);
    let processedCount = 0;

    // Create progress bar for embedding generation
    const progressBar = createProgressBar({
      ...ProgressPresets.embedding(model),
      format:
        "🧠 Embedding |{bar}| {percentage}% | {value}/{total} | Batch: {batchNumber}/{totalBatches} | ETA: {eta}s",
    });
    progressBar.start(tweets.length);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Update progress context
      progressBar.update(processedCount, {
        processed: processedCount,
        metadata: {
          batchNumber: i + 1,
          totalBatches: chunks.length,
        },
      } as Partial<ProgressContext>);

      try {
        const response = await openai.embeddings.create({
          model,
          input: chunk!.map((tweet) => tweet.text),
        });

        // Combine tweets with their embeddings
        response.data.forEach((embeddingData, index) => {
          const tweet = chunk![index];
          if (tweet) {
            // For legacy compatibility (vectors.json format)
            embeddings.push({
              ...tweet,
              vec: embeddingData.embedding,
            });

            // Prepare for database insertion
            embeddingBatch.push({
              tweetId: tweet.id,
              model: model,
              vector: JSON.stringify(embeddingData.embedding),
              dimensions: embeddingData.embedding.length,
            });
          }
        });

        processedCount += chunk!.length;
        progressBar.update(processedCount, {
          processed: processedCount,
          metadata: {
            batchNumber: i + 1,
            totalBatches: chunks.length,
          },
        } as Partial<ProgressContext>);

        // Small delay to respect rate limits
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        progressBar.fail(`Failed to process chunk ${i + 1}`);
        return handleCommandError(error, {
          command: "embed",
          operation: "embedding_generation",
          metadata: { chunkNumber: i + 1, totalChunks: chunks.length },
        });
      }
    }

    // Stop progress bar
    progressBar.stop();

    // Save embeddings to database
    if (embeddingBatch.length > 0) {
      await withSpinner(
        `💾 Saving ${embeddingBatch.length} embeddings to database...`,
        async () => {
          await embeddingQueries.insertEmbeddings(embeddingBatch);
        },
        {
          successText: `✅ Successfully saved ${embeddingBatch.length} embeddings to database`,
          failText: `❌ Failed to save embeddings to database`,
        },
      ).catch((error) => {
        console.error(`❌ Failed to save embeddings to database:`, error);
        const dbError = new DatabaseError(
          "Failed to save embeddings to database",
          {
            command: "embed",
            operation: "database_save",
            metadata: { embeddingCount: embeddingBatch.length },
          },
          error instanceof Error ? error : undefined,
        );
        return handleCommandError(dbError);
      });
    }

    const message = `✅ Successfully generated embeddings for ${embeddings.length} tweets`;
    console.log(message);
    console.log(`💾 Saved to SQLite database`);

    return {
      success: true,
      message,
      data: {
        tweetsEmbedded: embeddings.length,
        model,
        vectorDimensions: embeddings[0]?.vec.length || 0,
        embeddingsInDatabase: embeddingBatch.length,
      },
    };
  } catch (error) {
    return handleCommandError(error, {
      command: "embed",
      operation: "embedding_workflow",
    });
  }
}

// Legacy function for backward compatibility
export async function generateEmbeddings(): Promise<CommandResult> {
  return embedCommand();
}

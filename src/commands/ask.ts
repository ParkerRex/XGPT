import OpenAI from "openai";
import "dotenv/config";
import type {
  TweetWithEmbedding,
  QueryOptions,
  CommandResult,
} from "../types/common.js";
import { embeddingQueries } from "../database/queries.js";
import { loadConfig } from "../config/manager.js";
import { handleCommandError, AuthenticationError } from "../errors/index.js";
import { withSpinner } from "../ui/index.js";
import { cosineSimilarity } from "../utils/math.js";

export async function askCommand(
  options: QueryOptions,
): Promise<CommandResult> {
  try {
    // Load user configuration for defaults
    const userConfig = await loadConfig();

    const {
      question,
      topK = userConfig.query.defaultTopK,
      model = "gpt-4o-mini",
      vectorFile = "vectors.json", // Legacy parameter, now ignored
    } = options;

    console.log(`🤔 Processing question: "${question}"`);

    // Check for OpenAI API key (from config or environment)
    const apiKey = userConfig.api.openaiKey || process.env.OPENAI_KEY;
    if (!apiKey) {
      const authError = new AuthenticationError(
        "OpenAI API key is missing or invalid",
        {
          command: "ask",
          operation: "api_key_check",
        },
      );
      return handleCommandError(authError);
    }

    // Read embeddings from database
    let embeddings: TweetWithEmbedding[];

    try {
      const dbEmbeddings = await withSpinner(
        `📖 Loading embeddings from database...`,
        async () => await embeddingQueries.getEmbeddingsForSearch(),
        { preset: "dots" },
      );

      if (dbEmbeddings.length === 0) {
        return {
          success: false,
          message: "No embeddings found in database",
          error: "Please generate embeddings first using: xgpt embed",
        };
      }

      // Convert database embeddings to TweetWithEmbedding format
      embeddings = dbEmbeddings.map((dbEmbed) => ({
        id: dbEmbed.tweetId,
        text: dbEmbed.tweetText,
        user: dbEmbed.tweetUsername,
        created_at: dbEmbed.tweetCreatedAt?.toISOString(),
        metadata: dbEmbed.tweetMetadata
          ? JSON.parse(dbEmbed.tweetMetadata as string)
          : undefined,
        vec: JSON.parse(dbEmbed.vector as string),
      }));

      console.log(`📊 Found ${embeddings.length} tweet embeddings`);
    } catch (error) {
      return handleCommandError(error, {
        command: "ask",
        operation: "load_embeddings",
      });
    }

    const openai = new OpenAI({ apiKey: apiKey });

    // Generate embedding for the question
    const questionEmbedding = await withSpinner(
      `🧠 Generating embedding for question...`,
      async () =>
        await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: question,
        }),
      { preset: "pulse" },
    );

    const questionVector = questionEmbedding.data[0]?.embedding;
    if (!questionVector) {
      return {
        success: false,
        message: "Failed to generate question embedding",
        error: "OpenAI API returned empty embedding",
      };
    }

    // Find most similar tweets using cosine similarity
    const similarities = await withSpinner(
      `🔍 Finding ${topK} most relevant tweets...`,
      async () => {
        return embeddings
          .map((tweet) => ({
            ...tweet,
            similarity: cosineSimilarity(questionVector, tweet.vec),
          }))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, topK);
      },
      { preset: "arrow" },
    );

    // Prepare context for GPT
    const context = similarities
      .map(
        (tweet, index) =>
          `${index + 1}. ${tweet.text} (similarity: ${tweet.similarity.toFixed(3)})`,
      )
      .join("\n");

    // Generate answer using GPT
    const response = await withSpinner(
      `🤖 Generating answer using ${model}...`,
      async () =>
        await openai.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are an AI assistant that answers questions based on tweet content. Use the provided tweets as context to answer the user's question. Be concise and reference specific tweets when relevant.",
            },
            {
              role: "user",
              content: `Question: ${question}\n\nRelevant tweets:\n${context}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      { preset: "star" },
    );

    const answer = response.choices[0]?.message?.content;
    if (!answer) {
      return {
        success: false,
        message: "Failed to generate answer",
        error: "OpenAI API returned empty response",
      };
    }

    // Display results
    console.log("\n" + "=".repeat(60));
    console.log("🎯 ANSWER:");
    console.log("=".repeat(60));
    console.log(answer);
    console.log("\n" + "=".repeat(60));
    console.log("📚 RELEVANT TWEETS:");
    console.log("=".repeat(60));

    similarities.forEach((tweet, index) => {
      console.log(
        `${index + 1}. [${tweet.similarity.toFixed(3)}] ${tweet.text}`,
      );
      if (tweet.user) console.log(`   👤 @${tweet.user}`);
      if (tweet.created_at)
        console.log(`   📅 ${new Date(tweet.created_at).toLocaleDateString()}`);
      console.log();
    });

    return {
      success: true,
      message: "Question answered successfully",
      data: {
        question,
        answer,
        relevantTweets: similarities.map((t) => ({
          text: t.text,
          similarity: t.similarity,
          user: t.user,
          created_at: t.created_at,
        })),
        model,
        topK,
      },
    };
  } catch (error) {
    // Use enhanced error handling
    return handleCommandError(error, {
      command: "ask",
      operation: "question_answering",
      timestamp: new Date(),
    });
  }
}

// Legacy function for backward compatibility
export async function askQuestion(question: string): Promise<CommandResult> {
  return askCommand({ question });
}

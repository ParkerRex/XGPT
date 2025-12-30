#!/usr/bin/env bun

import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import {
  scrapeCommand,
  embedCommand,
  askCommand,
  interactiveCommand,
  searchCommand,
  discoverCommand,
  listConfigCommand,
  getConfigCommand,
  setConfigCommand,
  resetConfigCommand,
  configInfoCommand,
} from "./commands/index.js";
import {
  initializeDatabase,
  checkDatabaseHealth,
  getDatabaseStats,
} from "./database/connection.js";
import { runMigration } from "./database/migrate-json.js";
import { statsQueries } from "./database/queries.js";
import {
  optimizeDatabase,
  getDatabaseMetrics,
  runPerformanceBenchmarks,
  monitorDatabaseSize,
} from "./database/optimization.js";
import { runBenchmarkCLI } from "../benchmarks/sqlite-performance.js";
import { errorHandler } from "./errors/index.js";
import { createServer } from "./server.js";

// Read package.json for version info
const packagePath = join(import.meta.dir, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

const program = new Command();

// Initialize error handler
await errorHandler.initialize();

// Configure the main program
program
  .name("xgpt")
  .description("AI-powered Twitter/X scraping and question-answering tool")
  .version(packageJson.version);

// Add help examples
program.addHelpText(
  "after",
  `
Examples:
  $ xgpt interactive              # Interactive mode (recommended for new users)
  $ xgpt interactive elonmusk     # Interactive mode for specific user
  $ xgpt scrape elonmusk          # Direct scrape tweets from @elonmusk
  $ xgpt embed                    # Generate embeddings for scraped tweets
  $ xgpt ask "What about AI?"     # Ask questions about the tweets
  $ xgpt serve                    # Start the web UI at localhost:3000
  $ xgpt db --stats               # Show database statistics
  $ xgpt config list              # Show all configuration settings
  $ xgpt config set scraping.rateLimitProfile moderate  # Set rate limit profile
  $ xgpt --help                   # Show this help message
`,
);

// Interactive command (recommended for new users)
program
  .command("interactive")
  .description("Interactive mode - guided setup for scraping and analysis")
  .argument("[username]", "Twitter username to scrape (optional)")
  .action(async (username) => {
    const result = await interactiveCommand(username);

    if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Scrape command
program
  .command("scrape")
  .description("Scrape tweets from a user")
  .argument("<username>", "Twitter username to scrape")
  .option("--replies", "Include replies in scraping", false)
  .option("--retweets", "Include retweets in scraping", false)
  .option("--max <number>", "Maximum number of tweets to scrape", "10000")
  .action(async (username, options) => {
    const result = await scrapeCommand({
      username,
      includeReplies: options.replies,
      includeRetweets: options.retweets,
      maxTweets: parseInt(options.max),
    });

    if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Embed command
program
  .command("embed")
  .description("Generate embeddings for scraped tweets")
  .option(
    "--model <model>",
    "OpenAI embedding model to use",
    "text-embedding-3-small",
  )
  .option("--batch <number>", "Batch size for processing", "1000")
  .option("--input <file>", "Input file with tweets", "tweets.json")
  .option("--output <file>", "Output file for embeddings", "vectors.json")
  .action(async (options) => {
    const result = await embedCommand({
      model: options.model,
      batchSize: parseInt(options.batch),
      inputFile: options.input,
      outputFile: options.output,
    });

    if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Ask command
program
  .command("ask")
  .description("Ask questions about scraped tweets")
  .argument("<question>", "Question to ask about the tweets")
  .option("--top <number>", "Number of relevant tweets to consider", "5")
  .option("--model <model>", "OpenAI model to use for answering", "gpt-4o-mini")
  .option("--vectors <file>", "Vector file to search", "vectors.json")
  .action(async (question, options) => {
    const result = await askCommand({
      question,
      topK: parseInt(options.top),
      model: options.model,
      vectorFile: options.vectors,
    });

    if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Search command - search for tweets by topic/phrase
program
  .command("search")
  .description("Search for tweets by topic or phrase")
  .argument(
    "[query]",
    'Comma-separated search terms (e.g., "AGI, GPT-5, foundation models")',
  )
  .option(
    "--name <name>",
    "Save search as a named topic (or reference existing)",
  )
  .option("--max <number>", "Maximum tweets to search", "500")
  .option(
    "--days <number>",
    "Limit to tweets from last N days (default: 7 if no --since/--until)",
  )
  .option("--since <date>", "Search since date (YYYY-MM-DD, local timezone)")
  .option("--until <date>", "Search until date (YYYY-MM-DD, local timezone)")
  .option("--mode <mode>", "Search mode: latest or top", "latest")
  .option(
    "--embed",
    "Generate embeddings after search (session tweets only)",
    false,
  )
  .option("--dry-run", "Show query without executing", false)
  .option("--json", "Output results as JSON", false)
  .option("--resume <id>", "Resume interrupted search by session ID")
  .option("--cleanup", "Clean up old search sessions")
  .option(
    "--older-than <duration>",
    "For cleanup: sessions older than (e.g., 30d)",
  )
  .action(async (query, options) => {
    // Determine days value: use explicit value, or default to 7 if no date range provided
    let days: number | undefined;
    if (options.days !== undefined) {
      days = parseInt(options.days);
    } else if (!options.since && !options.until) {
      days = 7; // Default to 7 days if no date range specified
    }

    const result = await searchCommand({
      query,
      name: options.name,
      maxTweets: parseInt(options.max),
      days,
      since: options.since,
      until: options.until,
      mode: options.mode as "latest" | "top",
      embed: options.embed,
      dryRun: options.dryRun,
      json: options.json,
      resume: options.resume ? parseInt(options.resume) : undefined,
      cleanup: options.cleanup,
      olderThan: options.olderThan,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Users command - user discovery and management
const usersCommand = program
  .command("users")
  .description("Discover and manage Twitter users");

usersCommand
  .command("discover")
  .description("Search for Twitter profiles by bio, name, or keywords")
  .argument(
    "<query>",
    'Search query (e.g., "google engineer", "AI researcher")',
  )
  .option("--max <number>", "Maximum profiles to find", "20")
  .option("--save", "Save discovered users to database", false)
  .option("--json", "Output results as JSON", false)
  .action(async (query, options) => {
    const result = await discoverCommand({
      query,
      maxResults: parseInt(options.max),
      save: options.save,
      json: options.json,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Database command
program
  .command("db")
  .description("Database management and statistics")
  .option("--stats", "Show database statistics")
  .option("--health", "Check database health")
  .option("--init", "Initialize/reset database")
  .action(async (options) => {
    if (options.init) {
      console.log("[sync] Initializing database...");
      await initializeDatabase();
      console.log("[ok] Database initialized successfully");
      return;
    }

    if (options.health) {
      const isHealthy = checkDatabaseHealth();
      console.log(
        `🏥 Database health: ${isHealthy ? "[ok] Healthy" : "[error] Unhealthy"}`,
      );
      if (!isHealthy) process.exit(1);
      return;
    }

    if (options.stats) {
      const dbStats = getDatabaseStats();
      const appStats = await statsQueries.getOverallStats();

      console.log("[stats] Database Statistics:");
      console.log(`   • File size: ${dbStats?.sizeMB} MB`);
      console.log(`   • WAL mode: ${dbStats?.walMode}`);
      console.log(
        `   • Foreign keys: ${dbStats?.foreignKeysEnabled ? "enabled" : "disabled"}`,
      );
      console.log(`   • Users: ${appStats.users}`);
      console.log(`   • Tweets: ${appStats.tweets}`);
      console.log(`   • Embeddings: ${appStats.embeddings}`);
      console.log(`   • Sessions: ${appStats.sessions}`);
      return;
    }

    // Default: show help for db command
    console.log("Database management commands:");
    console.log("  xgpt db --stats    Show database statistics");
    console.log("  xgpt db --health   Check database health");
    console.log("  xgpt db --init     Initialize/reset database");
  });

// Migration command
program
  .command("migrate")
  .description("Migrate JSON data to SQLite database")
  .option("--tweets <file>", "Tweets JSON file to migrate", "tweets.json")
  .option("--vectors <file>", "Vectors JSON file to migrate", "vectors.json")
  .option("--batch-size <number>", "Batch size for processing", "1000")
  .option("--skip-backup", "Skip creating backup files", false)
  .option("--skip-validation", "Skip data validation", false)
  .action(async (options) => {
    await ensureDatabaseReady();

    await runMigration({
      tweetsFile: options.tweets,
      vectorsFile: options.vectors,
      batchSize: parseInt(options.batchSize),
      skipBackup: options.skipBackup,
      skipValidation: options.skipValidation,
    });
  });

// Optimize command
program
  .command("optimize")
  .description("Optimize database performance")
  .option("--indexes", "Create performance indexes", true)
  .option("--vacuum", "Run database vacuum", true)
  .option("--analyze", "Update query statistics", true)
  .option("--pragma", "Apply pragma optimizations", true)
  .option("--metrics", "Show performance metrics after optimization", false)
  .action(async (options) => {
    await ensureDatabaseReady();

    console.log("[info] Starting database optimization...");

    await optimizeDatabase({
      enableIndexes: options.indexes,
      enableVacuum: options.vacuum,
      enableAnalyze: options.analyze,
      enablePragmaOptimizations: options.pragma,
      logSlowQueries: true,
      slowQueryThreshold: 100,
    });

    if (options.metrics) {
      console.log("\n[stats] Performance Metrics:");
      await getDatabaseMetrics();

      console.log("\n🏃 Running Benchmarks:");
      await runPerformanceBenchmarks();

      console.log("\n📏 Database Size:");
      await monitorDatabaseSize();
    }

    console.log("\n[ok] Database optimization completed!");
  });

// Benchmark command
program
  .command("benchmark")
  .description("Run performance benchmarks")
  .option("--optimize", "Run optimization before benchmarking", true)
  .option("--report", "Generate detailed report", true)
  .option("--size <size>", "Test data size (small|medium|large)", "small")
  .option("--iterations <number>", "Number of benchmark iterations", "3")
  .action(async (options) => {
    await ensureDatabaseReady();

    await runBenchmarkCLI({
      optimize: options.optimize,
      report: options.report,
      size: options.size as "small" | "medium" | "large",
      iterations: parseInt(options.iterations),
    });
  });

// Serve command - web UI
program
  .command("serve")
  .description("Start the web UI server")
  .option("--port <number>", "Port to run the server on", "3002")
  .action(async (options) => {
    await ensureDatabaseReady();
    const port = parseInt(options.port);
    await createServer(port);
    console.log(`[info] Web UI available at http://localhost:${port}`);
    console.log("[info] Press Ctrl+C to stop the server");
  });

// Configuration commands
const configCommand = program
  .command("config")
  .description("Manage XGPT configuration settings");

configCommand
  .command("list")
  .description("List all configuration settings")
  .action(async () => {
    const result = await listConfigCommand();
    if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

configCommand
  .command("get")
  .description("Get a configuration value")
  .argument("<key>", "Configuration key to get")
  .action(async (key) => {
    const result = await getConfigCommand(key);
    if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

configCommand
  .command("set")
  .description("Set a configuration value")
  .argument("<key>", "Configuration key to set")
  .argument("<value>", "Value to set")
  .action(async (key, value) => {
    const result = await setConfigCommand(key, value);
    if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

configCommand
  .command("reset")
  .description("Reset configuration to defaults")
  .action(async () => {
    const result = await resetConfigCommand();
    if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

configCommand
  .command("info")
  .description("Show configuration file info and available commands")
  .action(async () => {
    const result = await configInfoCommand();
    if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Error handling for unknown commands
program.on("command:*", () => {
  console.error(
    "Invalid command: %s\nSee --help for a list of available commands.",
    program.args.join(" "),
  );
  process.exit(1);
});

// Initialize database before running commands
async function ensureDatabaseReady() {
  try {
    // Check if database is healthy
    if (!checkDatabaseHealth()) {
      // Initialize database if not healthy
      await initializeDatabase();
    }
  } catch (error) {
    console.error("[error] Database initialization failed:", error);
    console.error("Please check your database configuration and try again.");
    process.exit(1);
  }
}

// Parse command line arguments and ensure database is ready
async function main() {
  // Only initialize database for commands that need it (not for --help, --version, or config commands)
  const args = process.argv.slice(2);
  const needsDatabase =
    args.length > 0 &&
    !args.includes("--help") &&
    !args.includes("-h") &&
    !args.includes("--version") &&
    !args.includes("-V") &&
    !args.includes("config");

  if (needsDatabase) {
    await ensureDatabaseReady();
  }

  program.parse();
}

// Run the CLI
main().catch((error) => {
  console.error("[error] CLI error:", error);
  process.exit(1);
});

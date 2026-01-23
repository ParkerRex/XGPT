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
  readCommand,
  threadCommand,
  repliesCommand,
  userTweetsCommand,
  mentionsCommand,
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
import {
  errorHandler,
  ValidationError,
  DatabaseError,
  handleCommandError,
} from "./errors/index.js";
import { loadConfig } from "./config/manager.js";
import {
  configureScriptMode,
  getScriptModeState,
} from "./utils/scriptMode.js";
import {
  mapExitCode,
  writeScriptOutput,
  writeScriptStart,
} from "./utils/scriptOutput.js";
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
  .version(packageJson.version)
  .option("--script", "Enable script-friendly output", false)
  .option(
    "--output <format>",
    "Output format (json, jsonl, csv, markdown, txt)",
  )
  .option("--no-color", "Disable colored output")
  .option("--no-progress", "Disable progress bars and spinners")
  .option("--quiet", "Suppress non-fatal warnings", false);

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
  $ xgpt serve                    # Start the web UI at localhost:3002
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
    const startTime = Date.now();
    await initializeScriptMode();
    if (getScriptModeState().enabled) {
      beginScriptOutput("interactive");
      const errorResult = handleScriptModeError(
        "interactive",
        "Interactive mode is not supported in script mode.",
      );
      await handleCliResult("interactive", errorResult, startTime);
      return;
    }

    const result = await interactiveCommand(username);
    await handleCliResult("interactive", result, startTime);
  });

// Scrape command
program
  .command("scrape")
  .description("Scrape tweets from a user")
  .argument("<username>", "Twitter username to scrape")
  .option("--replies", "Include replies in scraping", false)
  .option("--retweets", "Include retweets in scraping", false)
  .option("--max <number>", "Maximum number of tweets to scrape", "10000")
  .option("--all", "Exhaust all available pages", false)
  .option("--max-pages <number>", "Maximum number of pages to fetch")
  .option("--cursor <cursor>", "Resume from a specific cursor")
  .option("--delay <ms>", "Delay in ms between pages", "0")
  .option("--resume <id>", "Resume interrupted scrape by session ID")
  .option("--fresh", "Ignore saved cursor when resuming", false)
  .action(async (username, options) => {
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("scrape");
    const result = await scrapeCommand({
      username,
      includeReplies: options.replies,
      includeRetweets: options.retweets,
      maxTweets: parseInt(options.max),
      all: options.all,
      maxPages: options.maxPages ? parseInt(options.maxPages) : undefined,
      cursor: options.cursor,
      delayMs: options.delay ? parseInt(options.delay) : undefined,
      resume: options.resume ? parseInt(options.resume) : undefined,
      fresh: options.fresh,
    });
    await handleCliResult("scrape", result, startTime);
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
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("embed");
    const result = await embedCommand({
      model: options.model,
      batchSize: parseInt(options.batch),
      inputFile: options.input,
      outputFile: options.output,
    });
    await handleCliResult("embed", result, startTime);
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
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("ask");
    const result = await askCommand({
      question,
      topK: parseInt(options.top),
      model: options.model,
      vectorFile: options.vectors,
    });
    await handleCliResult("ask", result, startTime);
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
  .option("--all", "Exhaust all available pages", false)
  .option("--max-pages <number>", "Maximum number of pages to fetch")
  .option("--cursor <cursor>", "Start from a specific cursor")
  .option("--delay <ms>", "Delay in ms between pages", "0")
  .option("--fresh", "Ignore saved cursor when resuming", false)
  .option("--cleanup", "Clean up old search sessions")
  .option(
    "--older-than <duration>",
    "For cleanup: sessions older than (e.g., 30d)",
  )
  .action(async (query, options) => {
    const startTime = Date.now();
    const scriptState = await initializeScriptMode({ json: options.json });
    beginScriptOutput("search");
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
      json: options.json || scriptState.enabled,
      resume: options.resume ? parseInt(options.resume) : undefined,
      all: options.all,
      maxPages: options.maxPages ? parseInt(options.maxPages) : undefined,
      cursor: options.cursor,
      delayMs: options.delay ? parseInt(options.delay) : undefined,
      fresh: options.fresh,
      cleanup: options.cleanup,
      olderThan: options.olderThan,
    });
    await handleCliResult("search", result, startTime);
  });

// Read command - fetch a single tweet
program
  .command("read")
  .description("Fetch a single tweet by ID or URL")
  .argument("<tweet>", "Tweet ID or URL")
  .option("--json", "Output results as JSON", false)
  .option("--no-save", "Do not save tweets to the database")
  .action(async (tweet, options) => {
    const result = await readCommand(tweet, {
      json: options.json,
      save: options.save,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Thread command - fetch author thread from a tweet
program
  .command("thread")
  .description("Fetch the author thread for a tweet")
  .argument("<tweet>", "Tweet ID or URL")
  .option("--max <number>", "Maximum tweets to return", "200")
  .option("--cursor <cursor>", "Pagination cursor to resume from")
  .option("--max-pages <number>", "Maximum pages to fetch")
  .option("--all", "Fetch until no cursor remains", false)
  .option("--delay <ms>", "Delay between pages in milliseconds")
  .option("--json", "Output results as JSON", false)
  .option("--no-save", "Do not save tweets to the database")
  .action(async (tweet, options) => {
    const result = await threadCommand(tweet, {
      maxTweets: parseInt(options.max),
      cursor: options.cursor,
      maxPages: options.maxPages ? parseInt(options.maxPages) : undefined,
      all: options.all,
      delayMs: options.delay ? parseInt(options.delay) : undefined,
      json: options.json,
      save: options.save,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Replies command - fetch replies to a tweet
program
  .command("replies")
  .description("Fetch replies to a tweet")
  .argument("<tweet>", "Tweet ID or URL")
  .option("--max <number>", "Maximum tweets to return", "200")
  .option("--cursor <cursor>", "Pagination cursor to resume from")
  .option("--max-pages <number>", "Maximum pages to fetch")
  .option("--all", "Fetch until no cursor remains", false)
  .option("--delay <ms>", "Delay between pages in milliseconds")
  .option("--json", "Output results as JSON", false)
  .option("--no-save", "Do not save tweets to the database")
  .action(async (tweet, options) => {
    const result = await repliesCommand(tweet, {
      maxTweets: parseInt(options.max),
      cursor: options.cursor,
      maxPages: options.maxPages ? parseInt(options.maxPages) : undefined,
      all: options.all,
      delayMs: options.delay ? parseInt(options.delay) : undefined,
      json: options.json,
      save: options.save,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// User tweets command - fetch a user timeline
program
  .command("user-tweets")
  .description("Fetch tweets from a user timeline")
  .argument("<username>", "Twitter username")
  .option("--include-replies", "Include replies", false)
  .option("--include-retweets", "Include retweets", false)
  .option("--max <number>", "Maximum tweets to return", "200")
  .option("--cursor <cursor>", "Pagination cursor to resume from")
  .option("--max-pages <number>", "Maximum pages to fetch")
  .option("--all", "Fetch until no cursor remains", false)
  .option("--delay <ms>", "Delay between pages in milliseconds")
  .option("--json", "Output results as JSON", false)
  .option("--no-save", "Do not save tweets to the database")
  .action(async (username, options) => {
    const result = await userTweetsCommand(username, {
      includeReplies: options.includeReplies,
      includeRetweets: options.includeRetweets,
      maxTweets: parseInt(options.max),
      cursor: options.cursor,
      maxPages: options.maxPages ? parseInt(options.maxPages) : undefined,
      all: options.all,
      delayMs: options.delay ? parseInt(options.delay) : undefined,
      json: options.json,
      save: options.save,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!result.success) {
      console.error(`[error] ${result.message}`);
      if (result.error) console.error(`   ${result.error}`);
      process.exit(1);
    }
  });

// Mentions command - fetch mentions timeline for a user
program
  .command("mentions")
  .description("Fetch tweets mentioning a user")
  .option("--user <username>", "Username to search mentions for")
  .option("--max <number>", "Maximum tweets to return", "200")
  .option("--cursor <cursor>", "Pagination cursor to resume from")
  .option("--max-pages <number>", "Maximum pages to fetch")
  .option("--all", "Fetch until no cursor remains", false)
  .option("--delay <ms>", "Delay between pages in milliseconds")
  .option("--json", "Output results as JSON", false)
  .option("--no-save", "Do not save tweets to the database")
  .action(async (options) => {
    const result = await mentionsCommand({
      user: options.user,
      maxTweets: parseInt(options.max),
      cursor: options.cursor,
      maxPages: options.maxPages ? parseInt(options.maxPages) : undefined,
      all: options.all,
      delayMs: options.delay ? parseInt(options.delay) : undefined,
      json: options.json,
      save: options.save,
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
  .option("--all", "Exhaust all available pages", false)
  .option("--max-pages <number>", "Maximum number of pages to fetch")
  .option("--cursor <cursor>", "Start from a specific cursor")
  .option("--delay <ms>", "Delay in ms between pages", "0")
  .option("--resume <id>", "Resume interrupted discover by session ID")
  .option("--fresh", "Ignore saved cursor when resuming", false)
  .action(async (query, options) => {
    const startTime = Date.now();
    const scriptState = await initializeScriptMode({ json: options.json });
    beginScriptOutput("users discover");
    const result = await discoverCommand({
      query,
      maxResults: parseInt(options.max),
      save: options.save,
      json: options.json || scriptState.enabled,
      all: options.all,
      maxPages: options.maxPages ? parseInt(options.maxPages) : undefined,
      cursor: options.cursor,
      delayMs: options.delay ? parseInt(options.delay) : undefined,
      resume: options.resume ? parseInt(options.resume) : undefined,
      fresh: options.fresh,
    });
    await handleCliResult("users discover", result, startTime);
  });

// Database command
program
  .command("db")
  .description("Database management and statistics")
  .option("--stats", "Show database statistics")
  .option("--health", "Check database health")
  .option("--init", "Initialize/reset database")
  .action(async (options) => {
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("db");
    try {
      if (options.init) {
        console.log("[sync] Initializing database...");
        await initializeDatabase();
        console.log("[ok] Database initialized successfully");
        await handleCliResult(
          "db",
          { success: true, message: "Database initialized successfully" },
          startTime,
        );
        return;
      }

      if (options.health) {
        const isHealthy = checkDatabaseHealth();
        console.log(
          `🏥 Database health: ${isHealthy ? "[ok] Healthy" : "[error] Unhealthy"}`,
        );
        if (!isHealthy) {
          const result = handleCommandError(
            new DatabaseError("Database health check failed", {
              command: "db",
              operation: "health_check",
            }),
          );
          await handleCliResult("db", result, startTime);
          return;
        }
        await handleCliResult(
          "db",
          { success: true, message: "Database is healthy" },
          startTime,
        );
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

        await handleCliResult(
          "db",
          {
            success: true,
            message: "Database statistics retrieved",
            data: {
              fileSizeMB: dbStats?.sizeMB,
              walMode: dbStats?.walMode,
              foreignKeysEnabled: dbStats?.foreignKeysEnabled,
              users: appStats.users,
              tweets: appStats.tweets,
              embeddings: appStats.embeddings,
              sessions: appStats.sessions,
            },
          },
          startTime,
        );
        return;
      }

      console.log("Database management commands:");
      console.log("  xgpt db --stats    Show database statistics");
      console.log("  xgpt db --health   Check database health");
      console.log("  xgpt db --init     Initialize/reset database");

      await handleCliResult(
        "db",
        {
          success: true,
          message: "Database command help",
        },
        startTime,
      );
    } catch (error) {
      const result = handleCommandError(error, {
        command: "db",
        operation: "db_command",
      });
      await handleCliResult("db", result, startTime);
    }
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
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("migrate");
    try {
      await ensureDatabaseReady();

      await runMigration({
        tweetsFile: options.tweets,
        vectorsFile: options.vectors,
        batchSize: parseInt(options.batchSize),
        skipBackup: options.skipBackup,
        skipValidation: options.skipValidation,
      });

      await handleCliResult(
        "migrate",
        { success: true, message: "Migration completed" },
        startTime,
      );
    } catch (error) {
      const result = handleCommandError(error, {
        command: "migrate",
        operation: "migration",
      });
      await handleCliResult("migrate", result, startTime);
    }
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
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("optimize");
    try {
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

      await handleCliResult(
        "optimize",
        { success: true, message: "Database optimization completed" },
        startTime,
      );
    } catch (error) {
      const result = handleCommandError(error, {
        command: "optimize",
        operation: "optimization",
      });
      await handleCliResult("optimize", result, startTime);
    }
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
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("benchmark");
    try {
      await ensureDatabaseReady();

      await runBenchmarkCLI({
        optimize: options.optimize,
        report: options.report,
        size: options.size as "small" | "medium" | "large",
        iterations: parseInt(options.iterations),
      });

      await handleCliResult(
        "benchmark",
        { success: true, message: "Benchmark completed" },
        startTime,
      );
    } catch (error) {
      const result = handleCommandError(error, {
        command: "benchmark",
        operation: "benchmark",
      });
      await handleCliResult("benchmark", result, startTime);
    }
  });

// Serve command - web UI
program
  .command("serve")
  .description("Start the web UI server")
  .option("--port <number>", "Port to run the server on", "3002")
  .action(async (options) => {
    const startTime = Date.now();
    await initializeScriptMode();
    if (getScriptModeState().enabled) {
      beginScriptOutput("serve");
      const result = handleScriptModeError(
        "serve",
        "Server mode is not supported in script mode.",
      );
      await handleCliResult("serve", result, startTime);
      return;
    }
    try {
      await ensureDatabaseReady();
      const port = parseInt(options.port);
      await createServer(port);
      console.log(`[info] Web UI available at http://localhost:${port}`);
      console.log("[info] Press Ctrl+C to stop the server");
    } catch (error) {
      const result = handleCommandError(error, {
        command: "serve",
        operation: "server_start",
      });
      await handleCliResult("serve", result, startTime);
    }
  });

// Configuration commands
const configCommand = program
  .command("config")
  .description("Manage XGPT configuration settings");

configCommand
  .command("list")
  .description("List all configuration settings")
  .action(async () => {
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("config list");
    const result = await listConfigCommand();
    await handleCliResult("config list", result, startTime);
  });

configCommand
  .command("get")
  .description("Get a configuration value")
  .argument("<key>", "Configuration key to get")
  .action(async (key) => {
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("config get");
    const result = await getConfigCommand(key);
    await handleCliResult("config get", result, startTime);
  });

configCommand
  .command("set")
  .description("Set a configuration value")
  .argument("<key>", "Configuration key to set")
  .argument("<value>", "Value to set")
  .action(async (key, value) => {
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("config set");
    const result = await setConfigCommand(key, value);
    await handleCliResult("config set", result, startTime);
  });

configCommand
  .command("reset")
  .description("Reset configuration to defaults")
  .action(async () => {
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("config reset");
    const result = await resetConfigCommand();
    await handleCliResult("config reset", result, startTime);
  });

configCommand
  .command("info")
  .description("Show configuration file info and available commands")
  .action(async () => {
    const startTime = Date.now();
    await initializeScriptMode();
    beginScriptOutput("config info");
    const result = await configInfoCommand();
    await handleCliResult("config info", result, startTime);
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

async function initializeScriptMode(commandOptions?: { json?: boolean }) {
  const globalOptions = program.opts();
  const noColor = globalOptions.color === false;
  const noProgress = globalOptions.progress === false;

  configureScriptMode({
    enabled: globalOptions.script,
    outputFormat: globalOptions.output,
    quiet: globalOptions.quiet,
    noColor,
    noProgress,
    jsonFlag: commandOptions?.json,
  });

  let config = null;
  try {
    config = await loadConfig();
  } catch {
    config = null;
  }

  return configureScriptMode({
    enabled: globalOptions.script,
    outputFormat: globalOptions.output,
    quiet: globalOptions.quiet,
    noColor,
    noProgress,
    config,
    jsonFlag: commandOptions?.json,
  });
}

function beginScriptOutput(command: string): void {
  if (getScriptModeState().enabled) {
    writeScriptStart({ command, version: packageJson.version });
  }
}

async function handleCliResult(
  command: string,
  result: { success: boolean; message: string; data?: unknown; error?: string },
  startTime: number,
): Promise<void> {
  const durationMs = Date.now() - startTime;
  if (getScriptModeState().enabled) {
    writeScriptOutput({
      command,
      result,
      durationMs,
      version: packageJson.version,
    });
  }

  if (!result.success) {
    process.exit(mapExitCode(result));
  }
}

function handleScriptModeError(command: string, message: string) {
  return handleCommandError(
    new ValidationError(message, {
      command,
      operation: "script_mode",
    }),
  );
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

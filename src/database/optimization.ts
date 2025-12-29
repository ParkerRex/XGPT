#!/usr/bin/env bun

import { rawDb } from "./connection.js";
import { statsQueries } from "./queries.js";

// Performance optimization configuration
interface OptimizationConfig {
  enableIndexes: boolean;
  enableVacuum: boolean;
  enableAnalyze: boolean;
  enablePragmaOptimizations: boolean;
  logSlowQueries: boolean;
  slowQueryThreshold: number; // milliseconds
}

// Performance metrics
interface PerformanceMetrics {
  queryCount: number;
  totalQueryTime: number;
  averageQueryTime: number;
  slowQueries: Array<{
    query: string;
    duration: number;
    timestamp: Date;
  }>;
  indexUsage: Record<string, number>;
  cacheHitRatio: number;
}

// Default optimization configuration
const DEFAULT_CONFIG: OptimizationConfig = {
  enableIndexes: true,
  enableVacuum: true,
  enableAnalyze: true,
  enablePragmaOptimizations: true,
  logSlowQueries: true,
  slowQueryThreshold: 100 // 100ms
};

/**
 * Apply database optimizations for better performance
 */
export async function optimizeDatabase(config: Partial<OptimizationConfig> = {}): Promise<void> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  console.log("[start] Starting database optimization...");
  console.log(`[stats] Configuration:`);
  console.log(`   • Enable indexes: ${finalConfig.enableIndexes}`);
  console.log(`   • Enable vacuum: ${finalConfig.enableVacuum}`);
  console.log(`   • Enable analyze: ${finalConfig.enableAnalyze}`);
  console.log(`   • Enable pragma optimizations: ${finalConfig.enablePragmaOptimizations}`);
  console.log(`   • Log slow queries: ${finalConfig.logSlowQueries} (>${finalConfig.slowQueryThreshold}ms)`);
  console.log();

  try {
    // Step 1: Create performance indexes
    if (finalConfig.enableIndexes) {
      await createPerformanceIndexes();
    }

    // Step 2: Apply pragma optimizations
    if (finalConfig.enablePragmaOptimizations) {
      await applyPragmaOptimizations();
    }

    // Step 3: Run database maintenance
    if (finalConfig.enableVacuum) {
      await runDatabaseVacuum();
    }

    // Step 4: Update database statistics
    if (finalConfig.enableAnalyze) {
      await runDatabaseAnalyze();
    }

    console.log("[ok] Database optimization completed successfully!");

  } catch (error) {
    console.error("[error] Database optimization failed:", error);
    throw error;
  }
}

/**
 * Create performance indexes for faster queries
 */
async function createPerformanceIndexes(): Promise<void> {
  console.log("[stats] Creating performance indexes...");

  const indexes = [
    // Tweet indexes for common query patterns
    {
      name: "idx_tweets_username",
      table: "tweets",
      columns: ["username"],
      description: "Fast user tweet lookups"
    },
    {
      name: "idx_tweets_created_at",
      table: "tweets",
      columns: ["created_at"],
      description: "Fast date range queries"
    },
    {
      name: "idx_tweets_username_created_at",
      table: "tweets",
      columns: ["username", "created_at"],
      description: "Fast user + date queries"
    },
    {
      name: "idx_tweets_text_search",
      table: "tweets",
      columns: ["text"],
      description: "Text search optimization"
    },
    {
      name: "idx_tweets_likes",
      table: "tweets",
      columns: ["likes"],
      description: "Popular tweets sorting"
    },

    // User indexes
    {
      name: "idx_users_username",
      table: "users",
      columns: ["username"],
      description: "Fast username lookups"
    },
    {
      name: "idx_users_last_scraped",
      table: "users",
      columns: ["last_scraped"],
      description: "Recent activity queries"
    },

    // Embedding indexes for similarity search
    {
      name: "idx_embeddings_tweet_id",
      table: "embeddings",
      columns: ["tweet_id"],
      description: "Fast embedding lookups"
    },
    {
      name: "idx_embeddings_model",
      table: "embeddings",
      columns: ["model"],
      description: "Model-specific queries"
    },
    {
      name: "idx_embeddings_dimensions",
      table: "embeddings",
      columns: ["dimensions"],
      description: "Dimension-based filtering"
    },

    // Session indexes
    {
      name: "idx_sessions_username",
      table: "scrape_sessions",
      columns: ["username"],
      description: "User session history"
    },
    {
      name: "idx_sessions_started_at",
      table: "scrape_sessions",
      columns: ["started_at"],
      description: "Recent sessions"
    },
    {
      name: "idx_sessions_status",
      table: "scrape_sessions",
      columns: ["status"],
      description: "Session status filtering"
    }
  ];

  let createdCount = 0;
  let skippedCount = 0;

  for (const index of indexes) {
    try {
      // Check if index already exists
      const existingIndex = rawDb.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name=?
      `).get(index.name);

      if (existingIndex) {
        console.log(`   ⏭️  Index ${index.name} already exists, skipping`);
        skippedCount++;
        continue;
      }

      // Create the index
      const columnList = index.columns.join(", ");
      const createIndexSQL = `CREATE INDEX ${index.name} ON ${index.table} (${columnList})`;

      rawDb.exec(createIndexSQL);
      console.log(`   [ok] Created index ${index.name} on ${index.table}(${columnList}) - ${index.description}`);
      createdCount++;

    } catch (error) {
      console.warn(`   [warn] Failed to create index ${index.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  console.log(`[ok] Index creation completed: ${createdCount} created, ${skippedCount} skipped\n`);
}

/**
 * Apply SQLite pragma optimizations for better performance
 */
async function applyPragmaOptimizations(): Promise<void> {
  console.log("⚙️  Applying pragma optimizations...");

  const pragmas = [
    // Performance optimizations
    { name: "cache_size", value: "1000000", description: "Increase cache size to 1GB" },
    { name: "temp_store", value: "memory", description: "Store temporary tables in memory" },
    { name: "mmap_size", value: "268435456", description: "Enable memory-mapped I/O (256MB)" },
    { name: "synchronous", value: "NORMAL", description: "Balance safety and performance" },

    // Query optimizations
    { name: "optimize", value: null, description: "Optimize query planner statistics" },
    { name: "analysis_limit", value: "1000", description: "Limit analysis for faster ANALYZE" },

    // Connection optimizations
    { name: "busy_timeout", value: "30000", description: "30 second busy timeout" },
    { name: "wal_autocheckpoint", value: "1000", description: "Auto-checkpoint every 1000 pages" }
  ];

  for (const pragma of pragmas) {
    try {
      const pragmaSQL = pragma.value
        ? `PRAGMA ${pragma.name} = ${pragma.value}`
        : `PRAGMA ${pragma.name}`;

      rawDb.exec(pragmaSQL);
      console.log(`   [ok] Applied PRAGMA ${pragma.name} - ${pragma.description}`);

    } catch (error) {
      console.warn(`   [warn] Failed to apply PRAGMA ${pragma.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  console.log("[ok] Pragma optimizations applied\n");
}

/**
 * Run database vacuum to reclaim space and optimize storage
 */
async function runDatabaseVacuum(): Promise<void> {
  console.log("🧹 Running database vacuum...");

  try {
    const startTime = Date.now();
    rawDb.exec("VACUUM");
    const duration = Date.now() - startTime;

    console.log(`[ok] Database vacuum completed in ${duration}ms\n`);

  } catch (error) {
    console.warn(`[warn] Database vacuum failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
  }
}

/**
 * Run database analyze to update query planner statistics
 */
async function runDatabaseAnalyze(): Promise<void> {
  console.log("📈 Running database analyze...");

  try {
    const startTime = Date.now();
    rawDb.exec("ANALYZE");
    const duration = Date.now() - startTime;

    console.log(`[ok] Database analyze completed in ${duration}ms\n`);

  } catch (error) {
    console.warn(`[warn] Database analyze failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
  }
}

/**
 * Get database performance metrics
 */
export async function getDatabaseMetrics(): Promise<PerformanceMetrics> {
  console.log("[stats] Collecting database performance metrics...");

  try {
    // Get basic database stats
    const stats = await statsQueries.getOverallStats();

    // Get database size and page info
    const sizeInfo = rawDb.prepare("PRAGMA page_count").get() as { page_count: number };
    const pageSize = rawDb.prepare("PRAGMA page_size").get() as { page_size: number };
    const dbSize = (sizeInfo.page_count * pageSize.page_size) / (1024 * 1024); // MB

    // Get cache statistics
    const cacheStats = rawDb.prepare("PRAGMA cache_size").get() as { cache_size: number };

    // Get index usage statistics (simplified)
    const indexStats = rawDb.prepare(`
      SELECT name, tbl_name
      FROM sqlite_master
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
    `).all() as Array<{ name: string; tbl_name: string }>;

    const metrics: PerformanceMetrics = {
      queryCount: 0, // Would need query logging to track
      totalQueryTime: 0,
      averageQueryTime: 0,
      slowQueries: [],
      indexUsage: indexStats.reduce((acc, idx) => {
        acc[idx.name] = 0; // Would need query logging to track usage
        return acc;
      }, {} as Record<string, number>),
      cacheHitRatio: 0 // Would need detailed cache monitoring
    };

    console.log("[stats] Performance Metrics:");
    console.log(`   • Database size: ${dbSize.toFixed(2)} MB`);
    console.log(`   • Total records: ${stats.users + stats.tweets + stats.embeddings + stats.sessions}`);
    console.log(`   • Indexes: ${indexStats.length}`);
    console.log(`   • Cache size: ${Math.abs(cacheStats.cache_size)} pages`);

    return metrics;

  } catch (error) {
    console.error("[error] Failed to collect performance metrics:", error);
    throw error;
  }
}

/**
 * Run performance benchmarks
 */
export async function runPerformanceBenchmarks(): Promise<{
  queryBenchmarks: Array<{ name: string; duration: number; recordsPerSecond: number }>;
  overallScore: number;
}> {
  console.log("🏃 Running performance benchmarks...");

  const benchmarks = [];

  try {
    // Benchmark 1: User lookup by username
    const userLookupStart = Date.now();
    const users = await statsQueries.getOverallStats();
    const userLookupDuration = Date.now() - userLookupStart;
    benchmarks.push({
      name: "User statistics query",
      duration: userLookupDuration,
      recordsPerSecond: users.users > 0 ? Math.round(users.users / (userLookupDuration / 1000)) : 0
    });

    // Benchmark 2: Tweet count query
    const tweetCountStart = Date.now();
    const tweetCountResult = rawDb.prepare("SELECT COUNT(*) as count FROM tweets").get() as { count: number };
    const tweetCountDuration = Date.now() - tweetCountStart;
    benchmarks.push({
      name: "Tweet count query",
      duration: tweetCountDuration,
      recordsPerSecond: tweetCountResult.count > 0 ? Math.round(tweetCountResult.count / (tweetCountDuration / 1000)) : 0
    });

    // Benchmark 3: Embedding lookup
    const embeddingStart = Date.now();
    const embeddingResult = rawDb.prepare("SELECT COUNT(*) as count FROM embeddings").get() as { count: number };
    const embeddingDuration = Date.now() - embeddingStart;
    benchmarks.push({
      name: "Embedding count query",
      duration: embeddingDuration,
      recordsPerSecond: embeddingResult.count > 0 ? Math.round(embeddingResult.count / (embeddingDuration / 1000)) : 0
    });

    // Benchmark 4: Complex join query
    const joinStart = Date.now();
    const joinResult = rawDb.prepare(`
      SELECT COUNT(*) as count
      FROM tweets t
      LEFT JOIN embeddings e ON t.id = e.tweet_id
    `).get() as { count: number };
    const joinDuration = Date.now() - joinStart;
    benchmarks.push({
      name: "Tweet-embedding join query",
      duration: joinDuration,
      recordsPerSecond: joinResult.count > 0 ? Math.round(joinResult.count / (joinDuration / 1000)) : 0
    });

    // Calculate overall performance score
    const avgDuration = benchmarks.reduce((sum, b) => sum + b.duration, 0) / benchmarks.length;
    const overallScore = Math.max(0, 100 - avgDuration); // Simple scoring: 100 - avg ms

    console.log("🏃 Benchmark Results:");
    benchmarks.forEach(benchmark => {
      console.log(`   • ${benchmark.name}: ${benchmark.duration}ms (${benchmark.recordsPerSecond} records/sec)`);
    });
    console.log(`   • Overall Score: ${overallScore.toFixed(1)}/100`);

    return {
      queryBenchmarks: benchmarks,
      overallScore
    };

  } catch (error) {
    console.error("[error] Performance benchmarks failed:", error);
    throw error;
  }
}

/**
 * Monitor database size and suggest cleanup if needed
 */
export async function monitorDatabaseSize(): Promise<{
  sizeMB: number;
  needsCleanup: boolean;
  recommendations: string[];
}> {
  console.log("📏 Monitoring database size...");

  try {
    const sizeInfo = rawDb.prepare("PRAGMA page_count").get() as { page_count: number };
    const pageSize = rawDb.prepare("PRAGMA page_size").get() as { page_size: number };
    const sizeMB = (sizeInfo.page_count * pageSize.page_size) / (1024 * 1024);

    const recommendations: string[] = [];
    let needsCleanup = false;

    // Check if database is getting large
    if (sizeMB > 100) {
      needsCleanup = true;
      recommendations.push("Database is over 100MB - consider running VACUUM");
    }

    // Check for old data
    const oldDataCheck = rawDb.prepare(`
      SELECT COUNT(*) as count
      FROM tweets
      WHERE created_at < datetime('now', '-1 year')
    `).get() as { count: number };

    if (oldDataCheck.count > 1000) {
      recommendations.push(`Found ${oldDataCheck.count} tweets older than 1 year - consider archiving`);
    }

    // Check for orphaned embeddings
    const orphanedEmbeddings = rawDb.prepare(`
      SELECT COUNT(*) as count
      FROM embeddings e
      LEFT JOIN tweets t ON e.tweet_id = t.id
      WHERE t.id IS NULL
    `).get() as { count: number };

    if (orphanedEmbeddings.count > 0) {
      needsCleanup = true;
      recommendations.push(`Found ${orphanedEmbeddings.count} orphaned embeddings - consider cleanup`);
    }

    console.log(`📏 Database Size: ${sizeMB.toFixed(2)} MB`);
    console.log(`🧹 Needs Cleanup: ${needsCleanup ? 'Yes' : 'No'}`);
    if (recommendations.length > 0) {
      console.log("[tip] Recommendations:");
      recommendations.forEach(rec => console.log(`   • ${rec}`));
    }

    return {
      sizeMB,
      needsCleanup,
      recommendations
    };

  } catch (error) {
    console.error("[error] Database size monitoring failed:", error);
    throw error;
  }
}

// Export types for external use
export type { OptimizationConfig, PerformanceMetrics };

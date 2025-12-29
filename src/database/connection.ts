import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema.js";

// Database file path
const DB_PATH = "./data/xgpt.db";

// Create SQLite database instance
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
sqlite.run("PRAGMA journal_mode = WAL;");

// Enable foreign key constraints
sqlite.run("PRAGMA foreign_keys = ON;");

// Optimize SQLite settings for performance
sqlite.run("PRAGMA synchronous = NORMAL;");
sqlite.run("PRAGMA cache_size = 1000000;");
sqlite.run("PRAGMA temp_store = memory;");

// Create Drizzle database instance
export const db = drizzle(sqlite, { schema });

// Export the raw SQLite instance for direct operations if needed
export const rawDb = sqlite;

// Database initialization function
export function initializeDatabase() {
  try {
    console.log("🗃️  Initializing database...");

    // Run migrations
    migrate(db, { migrationsFolder: "./src/database/migrations" });

    console.log("[ok] Database initialized successfully");
    return true;
  } catch (error) {
    console.error("[error] Database initialization failed:", error);
    throw error;
  }
}

// Database health check
export function checkDatabaseHealth(): boolean {
  try {
    // Simple query to check if database is accessible
    const result = sqlite.query("SELECT 1 as health").get() as {
      health: number;
    } | null;
    return result?.health === 1;
  } catch (error) {
    console.error("[error] Database health check failed:", error);
    return false;
  }
}

// Close database connection
export function closeDatabase() {
  try {
    sqlite.close();
    console.log("[lock] Database connection closed");
  } catch (error) {
    console.error("[error] Error closing database:", error);
  }
}

// Database statistics
export function getDatabaseStats() {
  try {
    const stats = {
      size: sqlite
        .query(
          "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()",
        )
        .get() as { size: number },
      tables: sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[],
      walMode: sqlite.query("PRAGMA journal_mode").get() as {
        journal_mode: string;
      },
      foreignKeys: sqlite.query("PRAGMA foreign_keys").get() as {
        foreign_keys: number;
      },
    };

    return {
      sizeBytes: stats.size.size,
      sizeMB: (stats.size.size / 1024 / 1024).toFixed(2),
      tableCount: stats.tables.length,
      tables: stats.tables.map((t) => t.name),
      walMode: stats.walMode.journal_mode,
      foreignKeysEnabled: stats.foreignKeys.foreign_keys === 1,
    };
  } catch (error) {
    console.error("[error] Error getting database stats:", error);
    return null;
  }
}

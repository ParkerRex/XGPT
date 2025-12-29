#!/usr/bin/env bun

import {
  initializeDatabase,
  getDatabaseStats,
  checkDatabaseHealth,
} from "./connection.js";

function main() {
  try {
    console.log("[start] Initializing X-GPT database...\n");

    // Initialize database and run migrations
    initializeDatabase();

    // Check database health
    const isHealthy = checkDatabaseHealth();
    if (!isHealthy) {
      throw new Error("Database health check failed");
    }

    // Get database statistics
    const stats = getDatabaseStats();
    if (stats) {
      console.log("[stats] Database Statistics:");
      console.log(`   • Size: ${stats.sizeMB} MB (${stats.sizeBytes} bytes)`);
      console.log(`   • Tables: ${stats.tableCount}`);
      console.log(`   • Table names: ${stats.tables.join(", ")}`);
      console.log(`   • WAL mode: ${stats.walMode}`);
      console.log(
        `   • Foreign keys: ${stats.foreignKeysEnabled ? "enabled" : "disabled"}`,
      );
    }

    console.log("\n[ok] Database initialization completed successfully!");
    console.log("[success] Ready to start using X-GPT with SQLite + Drizzle ORM!");
  } catch (error) {
    console.error("\n[error] Database initialization failed:");
    console.error(error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.main) {
  main();
}

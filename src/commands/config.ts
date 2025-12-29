/**
 * Configuration management commands for XGPT CLI
 * Provides commands to get, set, list, and reset user configuration
 */

import { getConfigManager, getConfigDescription } from "../config/manager.js";
import type { ConfigKeyPath } from "../config/schema.js";
import { CONFIG_CATEGORIES, CONFIG_DESCRIPTIONS } from "../config/schema.js";
import type { CommandResult } from "../types/common.js";
import { handleCommandError } from "../errors/index.js";

/**
 * List all configuration values organized by category
 */
export async function listConfigCommand(): Promise<CommandResult> {
  try {
    const manager = getConfigManager();
    await manager.load();
    void manager.getAll(); // Load config to verify it's valid

    console.log("[list] XGPT Configuration");
    console.log("=".repeat(50));
    console.log();

    // Show config file location
    console.log(`[file] Config file: ${manager.getConfigPath()}`);
    console.log(
      `[stats] Status: ${manager.exists() ? "[ok] Exists" : "[warn] Using defaults"}`,
    );
    console.log();

    // Display configuration by category
    for (const [category, keys] of Object.entries(CONFIG_CATEGORIES)) {
      console.log(`[config] ${category}`);
      console.log("-".repeat(category.length + 3));

      for (const key of keys) {
        const value = manager.get(key as ConfigKeyPath);
        const description = CONFIG_DESCRIPTIONS[key as ConfigKeyPath];

        // Format value for display
        let displayValue: string;
        if (value === undefined || value === null) {
          displayValue = "(not set)";
        } else if (typeof value === "boolean") {
          displayValue = value ? "[ok] true" : "[error] false";
        } else if (Array.isArray(value)) {
          displayValue = value.length > 0 ? `[${value.join(", ")}]` : "[]";
        } else if (
          key.includes("Token") ||
          key === "api.openaiKey" ||
          key === "api.authToken" ||
          key === "api.ct0Token"
        ) {
          // Mask sensitive values
          displayValue = value ? "***masked***" : "(not set)";
        } else {
          displayValue = String(value);
        }

        console.log(`  ${key}: ${displayValue}`);
        console.log(`    ${description}`);
        console.log();
      }
    }

    return {
      success: true,
      message: "Configuration listed successfully",
    };
  } catch (error) {
    return handleCommandError(error, {
      command: "config",
      operation: "list_config",
    });
  }
}

/**
 * Get a specific configuration value
 */
export async function getConfigCommand(
  keyPath: string,
): Promise<CommandResult> {
  try {
    // Validate key path
    if (!isValidConfigKey(keyPath)) {
      return {
        success: false,
        message: `Invalid configuration key: ${keyPath}`,
        error: `Valid keys: ${Object.keys(CONFIG_DESCRIPTIONS).join(", ")}`,
      };
    }

    const manager = getConfigManager();
    await manager.load();
    const value = manager.get(keyPath as ConfigKeyPath);
    const description = getConfigDescription(keyPath as ConfigKeyPath);

    console.log(`[config] Configuration: ${keyPath}`);
    console.log(`📝 Description: ${description}`);

    // Format value for display
    if (value === undefined || value === null) {
      console.log(`💭 Value: (not set)`);
    } else if (
      keyPath.includes("Token") ||
      keyPath === "api.openaiKey" ||
      keyPath === "api.authToken" ||
      keyPath === "api.ct0Token"
    ) {
      // Mask sensitive values
      console.log(`[lock] Value: ${value ? "***masked***" : "(not set)"}`);
    } else {
      console.log(`✨ Value: ${JSON.stringify(value, null, 2)}`);
    }

    return {
      success: true,
      message: `Retrieved configuration for ${keyPath}`,
      data: { key: keyPath, value, description },
    };
  } catch (error) {
    return handleCommandError(error, {
      command: "config",
      operation: "get_config",
      metadata: { key: keyPath },
    });
  }
}

/**
 * Set a configuration value
 */
export async function setConfigCommand(
  keyPath: string,
  value: string,
): Promise<CommandResult> {
  try {
    // Validate key path
    if (!isValidConfigKey(keyPath)) {
      return {
        success: false,
        message: `Invalid configuration key: ${keyPath}`,
        error: `Valid keys: ${Object.keys(CONFIG_DESCRIPTIONS).join(", ")}`,
      };
    }

    const manager = getConfigManager();
    await manager.load();

    // Parse value based on expected type
    const parsedValue = parseConfigValue(keyPath as ConfigKeyPath, value);

    // Set the value (this will validate and save)
    await manager.set(keyPath as ConfigKeyPath, parsedValue);

    const description = getConfigDescription(keyPath as ConfigKeyPath);

    console.log(`[ok] Configuration updated successfully!`);
    console.log(`[config] Key: ${keyPath}`);
    console.log(`📝 Description: ${description}`);

    // Show new value (mask sensitive data)
    if (
      keyPath.includes("Token") ||
      keyPath === "api.openaiKey" ||
      keyPath === "api.authToken" ||
      keyPath === "api.ct0Token"
    ) {
      console.log(`[lock] New value: ***masked***`);
    } else {
      console.log(`✨ New value: ${JSON.stringify(parsedValue, null, 2)}`);
    }

    return {
      success: true,
      message: `Configuration ${keyPath} updated successfully`,
      data: { key: keyPath, value: parsedValue, description },
    };
  } catch (error) {
    return handleCommandError(error, {
      command: "config",
      operation: "set_config",
      metadata: { key: keyPath, value },
    });
  }
}

/**
 * Reset configuration to defaults
 */
export async function resetConfigCommand(): Promise<CommandResult> {
  try {
    const manager = getConfigManager();
    await manager.reset();

    console.log(`[sync] Configuration reset to defaults successfully!`);
    console.log(`[file] Config file: ${manager.getConfigPath()}`);
    console.log(
      `[tip] Tip: Environment variables (OPENAI_KEY, AUTH_TOKEN, CT0) will still be used`,
    );

    return {
      success: true,
      message: "Configuration reset to defaults successfully",
    };
  } catch (error) {
    return handleCommandError(error, {
      command: "config",
      operation: "reset_config",
    });
  }
}

/**
 * Show configuration file path and status
 */
export function configInfoCommand(): CommandResult {
  try {
    const manager = getConfigManager();
    const configPath = manager.getConfigPath();
    const exists = manager.exists();

    console.log(`[list] XGPT Configuration Info`);
    console.log("=".repeat(30));
    console.log(`[file] Config file: ${configPath}`);
    console.log(`[stats] Status: ${exists ? "[ok] Exists" : "[warn] Using defaults"}`);
    console.log(`[config] Available commands:`);
    console.log(`   xgpt config list          # Show all configuration`);
    console.log(`   xgpt config get <key>     # Get specific value`);
    console.log(`   xgpt config set <key> <value>  # Set value`);
    console.log(`   xgpt config reset         # Reset to defaults`);
    console.log();
    console.log(
      `[tip] Tip: Use 'xgpt config list' to see all available configuration keys`,
    );

    return {
      success: true,
      message: "Configuration info displayed successfully",
      data: { configPath, exists },
    };
  } catch (error) {
    return handleCommandError(error, {
      command: "config",
      operation: "config_info",
    });
  }
}

/**
 * Validate if a key path is valid
 */
function isValidConfigKey(keyPath: string): boolean {
  return keyPath in CONFIG_DESCRIPTIONS;
}

/**
 * Parse a string value into the appropriate type for a configuration key
 */
function parseConfigValue(
  keyPath: ConfigKeyPath,
  value: string,
): string | number | boolean | string[] {
  // Handle boolean values
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;

  // Handle array values (comma-separated)
  if (keyPath === "scraping.defaultKeywords") {
    return value
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }

  // Handle numeric values
  if (
    keyPath.includes("maxTweets") ||
    keyPath.includes("batchSize") ||
    keyPath.includes("defaultTopK") ||
    keyPath.includes("cacheTtlHours") ||
    keyPath.includes("maxBackupFiles")
  ) {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error(`Value must be a number for ${keyPath}`);
    }
    return num;
  }

  // Handle float values
  if (keyPath.includes("defaultThreshold")) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      throw new Error(`Value must be a number for ${keyPath}`);
    }
    return num;
  }

  // Default to string
  return value;
}

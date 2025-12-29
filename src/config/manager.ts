/**
 * Configuration manager for XGPT CLI
 * Handles loading, saving, and merging user configuration with environment variables
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import type { UserConfig, ConfigKeyPath } from './schema.js';
import { DEFAULT_CONFIG, CONFIG_VALIDATION, CONFIG_DESCRIPTIONS } from './schema.js';

export class ConfigManager {
  private configDir: string;
  private configFile: string;
  private config: UserConfig;
  private loaded: boolean = false;

  constructor() {
    this.configDir = join(homedir(), '.xgpt');
    this.configFile = join(this.configDir, 'config.json');
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Load configuration from file and merge with environment variables
   */
  async load(): Promise<UserConfig> {
    if (this.loaded) {
      return this.config;
    }

    // Ensure config directory exists
    this.ensureConfigDirectory();

    // Load from file if it exists
    if (existsSync(this.configFile)) {
      try {
        const fileContent = await Bun.file(this.configFile).text();
        const fileConfig = JSON.parse(fileContent) as Partial<UserConfig>;
        this.config = this.mergeConfigs(DEFAULT_CONFIG, fileConfig);
      } catch (error) {
        console.warn(`[warn] Warning: Could not load config file: ${error}`);
        console.warn('   Using default configuration');
      }
    }

    // Merge with environment variables
    this.mergeEnvironmentVariables();

    this.loaded = true;
    return this.config;
  }

  /**
   * Save current configuration to file
   */
  async save(): Promise<void> {
    this.ensureConfigDirectory();
    
    try {
      const configJson = JSON.stringify(this.config, null, 2);
      await Bun.write(this.configFile, configJson);
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error}`);
    }
  }

  /**
   * Get a configuration value by key path
   */
  get<T = any>(keyPath: ConfigKeyPath): T {
    return this.getNestedValue(this.config, keyPath) as T;
  }

  /**
   * Set a configuration value by key path
   */
  async set(keyPath: ConfigKeyPath, value: any): Promise<void> {
    // Validate the value
    this.validateValue(keyPath, value);

    // Set the value
    this.setNestedValue(this.config, keyPath, value);

    // Save to file
    await this.save();
  }

  /**
   * Reset configuration to defaults
   */
  async reset(): Promise<void> {
    this.config = { ...DEFAULT_CONFIG };
    this.mergeEnvironmentVariables();
    await this.save();
  }

  /**
   * Get all configuration as a plain object
   */
  getAll(): UserConfig {
    return { ...this.config };
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configFile;
  }

  /**
   * Check if configuration file exists
   */
  exists(): boolean {
    return existsSync(this.configFile);
  }

  /**
   * Validate a configuration value
   */
  private validateValue(keyPath: ConfigKeyPath, value: any): void {
    const validation = CONFIG_VALIDATION[keyPath as keyof typeof CONFIG_VALIDATION];
    
    if (!validation) {
      return; // No validation rules for this key
    }

    if (Array.isArray(validation)) {
      // Enum validation
      if (!validation.includes(value)) {
        throw new Error(`Invalid value for ${keyPath}. Must be one of: ${validation.join(', ')}`);
      }
    } else if (typeof validation === 'object' && 'min' in validation) {
      // Range validation
      if (typeof value !== 'number' || value < validation.min || value > validation.max) {
        throw new Error(`Invalid value for ${keyPath}. Must be a number between ${validation.min} and ${validation.max}`);
      }
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!(key in current)) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Merge two configuration objects deeply
   */
  private mergeConfigs(base: UserConfig, override: Partial<UserConfig>): UserConfig {
    const result = { ...base };
    
    for (const [key, value] of Object.entries(override)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key as keyof UserConfig] = {
          ...result[key as keyof UserConfig],
          ...value
        } as any;
      } else {
        result[key as keyof UserConfig] = value as any;
      }
    }
    
    return result;
  }

  /**
   * Merge environment variables into configuration
   */
  private mergeEnvironmentVariables(): void {
    // API keys from environment
    if (process.env.OPENAI_KEY) {
      this.config.api.openaiKey = process.env.OPENAI_KEY;
    }
    if (process.env.AUTH_TOKEN) {
      this.config.api.authToken = process.env.AUTH_TOKEN;
    }
    if (process.env.CT0) {
      this.config.api.ct0Token = process.env.CT0;
    }

    // Database path from environment
    if (process.env.XGPT_DB_PATH) {
      this.config.advanced.databasePath = process.env.XGPT_DB_PATH;
    }
  }

  /**
   * Ensure configuration directory exists
   */
  private ensureConfigDirectory(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
  }
}

// Global configuration manager instance
let configManager: ConfigManager | null = null;

/**
 * Get the global configuration manager instance
 */
export function getConfigManager(): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager();
  }
  return configManager;
}

/**
 * Load and return the current configuration
 */
export async function loadConfig(): Promise<UserConfig> {
  const manager = getConfigManager();
  return await manager.load();
}

/**
 * Get a configuration value
 */
export function getConfig<T = any>(keyPath: ConfigKeyPath): T {
  const manager = getConfigManager();
  return manager.get<T>(keyPath);
}

/**
 * Set a configuration value
 */
export async function setConfig(keyPath: ConfigKeyPath, value: any): Promise<void> {
  const manager = getConfigManager();
  await manager.set(keyPath, value);
}

/**
 * Reset configuration to defaults
 */
export async function resetConfig(): Promise<void> {
  const manager = getConfigManager();
  await manager.reset();
}

/**
 * Get configuration description for a key
 */
export function getConfigDescription(keyPath: ConfigKeyPath): string {
  return CONFIG_DESCRIPTIONS[keyPath] || 'No description available';
}

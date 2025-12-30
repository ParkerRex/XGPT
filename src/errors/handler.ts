/**
 * Centralized error handling for XGPT CLI
 * Provides consistent error processing, logging, and user-friendly error display
 */

import {
  XGPTError,
  ErrorCategory,
  ErrorSeverity,
  ConfigurationError,
  AuthenticationError,
  RateLimitError,
  DatabaseError,
  ValidationError,
  NetworkError,
} from "./types.js";
import type { ErrorContext } from "./types.js";
import type { CommandResult } from "../types/common.js";
import { loadConfig } from "../config/manager.js";

/**
 * Error detection patterns for automatic categorization
 */
const ERROR_PATTERNS = {
  authentication: [
    /api key/i,
    /unauthorized/i,
    /forbidden/i,
    /authentication/i,
    /invalid token/i,
    /auth.*token/i,
    /openai.*key/i,
  ],
  rateLimit: [
    /rate limit/i,
    /too many requests/i,
    /429/,
    /quota exceeded/i,
    /temporarily unavailable/i,
  ],
  network: [
    /network/i,
    /connection/i,
    /timeout/i,
    /enotfound/i,
    /econnrefused/i,
    /fetch failed/i,
  ],
  database: [
    /database/i,
    /sqlite/i,
    /sql/i,
    /drizzle/i,
    /migration/i,
    /table.*not.*exist/i,
  ],
  validation: [
    /invalid.*input/i,
    /validation/i,
    /required.*parameter/i,
    /missing.*argument/i,
    /invalid.*format/i,
  ],
  configuration: [
    /config/i,
    /setting/i,
    /preference/i,
    /\.env/i,
    /environment.*variable/i,
  ],
};

/**
 * Enhanced error handler class
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private verboseLogging: boolean = false;

  private constructor() {}

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Initialize error handler with user configuration
   */
  async initialize(): Promise<void> {
    try {
      const config = await loadConfig();
      this.verboseLogging = config.ui.verboseLogging;
    } catch (error) {
      // Fallback to default if config loading fails
      this.verboseLogging = false;
    }
  }

  /**
   * Handle any error and convert to user-friendly format
   */
  handleError(error: unknown, context?: ErrorContext): CommandResult {
    // If it's already an XGPTError, use it directly
    if (error instanceof XGPTError) {
      return this.processXGPTError(error);
    }

    // Convert regular errors to XGPTError
    const xgptError = this.categorizeError(error, context);
    return this.processXGPTError(xgptError);
  }

  /**
   * Extract error message from unknown error type
   */
  private extractErrorInfo(error: unknown): {
    message: string;
    stack?: string;
    cause?: Error;
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        cause: error,
      };
    }
    if (typeof error === "string") {
      return { message: error };
    }
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return { message: error.message };
    }
    return { message: "Unknown error occurred" };
  }

  /**
   * Categorize and convert regular errors to XGPTError
   */
  private categorizeError(error: unknown, context?: ErrorContext): XGPTError {
    const {
      message: errorMessage,
      stack,
      cause,
    } = this.extractErrorInfo(error);
    const errorString = errorMessage.toLowerCase();

    // Check for authentication errors
    if (
      ERROR_PATTERNS.authentication.some((pattern) => pattern.test(errorString))
    ) {
      return new AuthenticationError(
        this.enhanceErrorMessage(errorMessage, "authentication"),
        context,
        cause,
      );
    }

    // Check for rate limit errors
    if (ERROR_PATTERNS.rateLimit.some((pattern) => pattern.test(errorString))) {
      return new RateLimitError(
        this.enhanceErrorMessage(errorMessage, "rateLimit"),
        context,
        cause,
      );
    }

    // Check for network errors
    if (ERROR_PATTERNS.network.some((pattern) => pattern.test(errorString))) {
      return new NetworkError(
        this.enhanceErrorMessage(errorMessage, "network"),
        context,
        cause,
      );
    }

    // Check for database errors
    if (ERROR_PATTERNS.database.some((pattern) => pattern.test(errorString))) {
      return new DatabaseError(
        this.enhanceErrorMessage(errorMessage, "database"),
        context,
        cause,
      );
    }

    // Check for validation errors
    if (
      ERROR_PATTERNS.validation.some((pattern) => pattern.test(errorString))
    ) {
      return new ValidationError(
        this.enhanceErrorMessage(errorMessage, "validation"),
        context,
        cause,
      );
    }

    // Check for configuration errors
    if (
      ERROR_PATTERNS.configuration.some((pattern) => pattern.test(errorString))
    ) {
      return new ConfigurationError(
        this.enhanceErrorMessage(errorMessage, "configuration"),
        context,
        cause,
      );
    }

    // Default to generic XGPTError
    return new XGPTError(
      {
        code: "UNKNOWN_ERROR",
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.MEDIUM,
        title: "Unexpected Error",
        message: errorMessage,
        technicalDetails: this.verboseLogging ? stack : undefined,
        context,
        recoveryActions: [
          {
            description: "Try running the command again",
          },
          {
            description: "Check the command usage",
            command: "xgpt --help",
          },
          {
            description: "Enable verbose logging for more details",
            command: "xgpt config set ui.verboseLogging true",
          },
        ],
      },
      cause,
    );
  }

  /**
   * Enhance error messages with more context
   */
  private enhanceErrorMessage(
    originalMessage: string,
    category: string,
  ): string {
    const enhancements = {
      authentication: {
        "api key":
          "OpenAI API key is missing or invalid. Please check your configuration.",
        unauthorized:
          "Authentication failed. Your API key or tokens may be invalid.",
        forbidden:
          "Access denied. Your account may not have the required permissions.",
      },
      rateLimit: {
        "rate limit":
          "You have exceeded the rate limit. Please wait before trying again.",
        "too many requests":
          "Too many requests sent. The system is protecting your account.",
        "429":
          "Rate limit exceeded. Consider using a more conservative rate limit profile.",
      },
      network: {
        network:
          "Network connection failed. Please check your internet connection.",
        timeout:
          "Request timed out. The service may be temporarily unavailable.",
        connection: "Could not connect to the service. Please try again later.",
      },
      database: {
        database:
          "Database operation failed. The database may need initialization.",
        sqlite:
          "SQLite database error. Consider running database optimization.",
        migration:
          "Database migration failed. You may need to reset the database.",
      },
      validation: {
        invalid:
          "The provided input is not valid. Please check your parameters.",
        required:
          "A required parameter is missing. Please check the command usage.",
        format: "The input format is incorrect. Please verify your input.",
      },
      configuration: {
        config: "Configuration error. Please check your settings.",
        setting: "Invalid setting value. Please verify your configuration.",
        environment: "Environment variable issue. Check your .env file.",
      },
    };

    const categoryEnhancements =
      enhancements[category as keyof typeof enhancements];
    if (categoryEnhancements) {
      for (const [keyword, enhancement] of Object.entries(
        categoryEnhancements,
      )) {
        if (originalMessage.toLowerCase().includes(keyword)) {
          return enhancement;
        }
      }
    }

    return originalMessage;
  }

  /**
   * Process XGPTError and return CommandResult
   */
  private processXGPTError(error: XGPTError): CommandResult {
    // Log error details if verbose logging is enabled
    if (this.verboseLogging) {
      console.error("\n[search] Detailed Error Information:");
      console.error(JSON.stringify(error.toJSON(), null, 2));
    }

    // Display user-friendly error
    console.error("\n" + error.toDisplayFormat());

    // Return CommandResult
    return {
      success: false,
      message: error.title,
      error: error.message,
      data: {
        errorCode: error.code,
        category: error.category,
        severity: error.severity,
        recoveryActions: error.recoveryActions,
      },
    };
  }

  /**
   * Create error with context
   */
  createError(
    category: ErrorCategory,
    message: string,
    context?: ErrorContext,
    cause?: Error,
  ): XGPTError {
    switch (category) {
      case ErrorCategory.AUTHENTICATION:
        return new AuthenticationError(message, context, cause);
      case ErrorCategory.RATE_LIMIT:
        return new RateLimitError(message, context, cause);
      case ErrorCategory.DATABASE:
        return new DatabaseError(message, context, cause);
      case ErrorCategory.USER_INPUT:
        return new ValidationError(message, context, cause);
      case ErrorCategory.NETWORK:
        return new NetworkError(message, context, cause);
      case ErrorCategory.CONFIGURATION:
        return new ConfigurationError(message, context, cause);
      default:
        return new XGPTError(
          {
            code: "GENERIC_ERROR",
            category,
            severity: ErrorSeverity.MEDIUM,
            title: "Error",
            message,
            context,
          },
          cause,
        );
    }
  }

  /**
   * Handle graceful degradation for non-critical errors
   */
  handleWarning(message: string, context?: ErrorContext): void {
    console.warn(`[warn] Warning: ${message}`);

    if (this.verboseLogging && context) {
      console.warn("Context:", JSON.stringify(context, null, 2));
    }
  }

  /**
   * Set verbose logging mode
   */
  setVerboseLogging(enabled: boolean): void {
    this.verboseLogging = enabled;
  }
}

/**
 * Global error handler instance
 */
export const errorHandler = ErrorHandler.getInstance();

/**
 * Convenience function for handling errors in commands
 */
export function handleCommandError(
  error: unknown,
  context?: ErrorContext,
): CommandResult {
  return errorHandler.handleError(error, context);
}

/**
 * Convenience function for creating specific error types
 */
export function createError(
  category: ErrorCategory,
  message: string,
  context?: ErrorContext,
  cause?: Error,
): XGPTError {
  return errorHandler.createError(category, message, context, cause);
}

/**
 * Convenience function for warnings
 */
export function handleWarning(message: string, context?: ErrorContext): void {
  errorHandler.handleWarning(message, context);
}

/**
 * Enhanced error types and classes for XGPT CLI
 * Provides categorized errors with user-friendly messages and recovery suggestions
 */

export enum ErrorCategory {
  // Configuration and setup errors
  CONFIGURATION = 'CONFIGURATION',
  AUTHENTICATION = 'AUTHENTICATION',
  
  // Network and API errors
  NETWORK = 'NETWORK',
  RATE_LIMIT = 'RATE_LIMIT',
  API_ERROR = 'API_ERROR',
  
  // Data and file errors
  DATABASE = 'DATABASE',
  FILE_SYSTEM = 'FILE_SYSTEM',
  DATA_VALIDATION = 'DATA_VALIDATION',
  
  // User input errors
  USER_INPUT = 'USER_INPUT',
  COMMAND_USAGE = 'COMMAND_USAGE',
  
  // System and runtime errors
  SYSTEM = 'SYSTEM',
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  LOW = 'LOW',       // Warning, operation can continue
  MEDIUM = 'MEDIUM', // Error, operation failed but recoverable
  HIGH = 'HIGH',     // Critical error, requires user action
  FATAL = 'FATAL'    // System error, application should exit
}

export interface ErrorContext {
  command?: string;
  username?: string;
  operation?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface RecoveryAction {
  description: string;
  command?: string;
  url?: string;
  automatic?: boolean;
}

export interface XGPTErrorDetails {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  title: string;
  message: string;
  technicalDetails?: string;
  context?: ErrorContext;
  recoveryActions?: RecoveryAction[];
  relatedErrors?: string[];
}

/**
 * Base XGPT Error class with enhanced error information
 */
export class XGPTError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly title: string;
  public readonly technicalDetails?: string;
  public readonly context?: ErrorContext;
  public readonly recoveryActions?: RecoveryAction[];
  public readonly relatedErrors?: string[];

  constructor(details: XGPTErrorDetails, cause?: Error) {
    super(details.message);
    this.name = 'XGPTError';
    this.code = details.code;
    this.category = details.category;
    this.severity = details.severity;
    this.title = details.title;
    this.technicalDetails = details.technicalDetails;
    this.context = details.context;
    this.recoveryActions = details.recoveryActions;
    this.relatedErrors = details.relatedErrors;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, XGPTError);
    }

    // Chain the original error if provided
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }

  /**
   * Convert to a user-friendly display format
   */
  toDisplayFormat(): string {
    let output = `[error] ${this.title}\n`;
    output += `   ${this.message}\n`;

    if (this.recoveryActions && this.recoveryActions.length > 0) {
      output += '\n[tip] Suggested actions:\n';
      this.recoveryActions.forEach((action, index) => {
        output += `   ${index + 1}. ${action.description}\n`;
        if (action.command) {
          output += `      Command: ${action.command}\n`;
        }
        if (action.url) {
          output += `      More info: ${action.url}\n`;
        }
      });
    }

    return output;
  }

  /**
   * Convert to JSON for logging or API responses
   */
  toJSON(): object {
    return {
      code: this.code,
      category: this.category,
      severity: this.severity,
      title: this.title,
      message: this.message,
      technicalDetails: this.technicalDetails,
      context: this.context,
      recoveryActions: this.recoveryActions,
      relatedErrors: this.relatedErrors,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends XGPTError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'CONFIG_ERROR',
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.MEDIUM,
      title: 'Configuration Error',
      message,
      context,
      recoveryActions: [
        {
          description: 'Check your configuration settings',
          command: 'xgpt config list'
        },
        {
          description: 'Reset configuration to defaults',
          command: 'xgpt config reset'
        }
      ]
    }, cause);
  }
}

/**
 * Authentication-related errors
 */
export class AuthenticationError extends XGPTError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'AUTH_ERROR',
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      title: 'Authentication Error',
      message,
      context,
      recoveryActions: [
        {
          description: 'Check your API keys and tokens',
          command: 'xgpt config list'
        },
        {
          description: 'Update your OpenAI API key',
          command: 'xgpt config set api.openaiKey <your-key>'
        },
        {
          description: 'Update your Twitter auth tokens',
          url: 'https://github.com/Vibe-with-AI/xgpt#cookie-setup'
        }
      ]
    }, cause);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends XGPTError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'RATE_LIMIT_ERROR',
      category: ErrorCategory.RATE_LIMIT,
      severity: ErrorSeverity.MEDIUM,
      title: 'Rate Limit Exceeded',
      message,
      context,
      recoveryActions: [
        {
          description: 'Wait before retrying the operation'
        },
        {
          description: 'Use a more conservative rate limit profile',
          command: 'xgpt config set scraping.rateLimitProfile conservative'
        },
        {
          description: 'Reduce the number of tweets to scrape',
          command: 'xgpt config set scraping.maxTweets 500'
        }
      ]
    }, cause);
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends XGPTError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'DATABASE_ERROR',
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      title: 'Database Error',
      message,
      context,
      recoveryActions: [
        {
          description: 'Check database health',
          command: 'xgpt db --health'
        },
        {
          description: 'Initialize database',
          command: 'xgpt db --init'
        },
        {
          description: 'Optimize database performance',
          command: 'xgpt optimize'
        }
      ]
    }, cause);
  }
}

/**
 * User input validation errors
 */
export class ValidationError extends XGPTError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'VALIDATION_ERROR',
      category: ErrorCategory.USER_INPUT,
      severity: ErrorSeverity.LOW,
      title: 'Invalid Input',
      message,
      context,
      recoveryActions: [
        {
          description: 'Check the command usage',
          command: 'xgpt --help'
        },
        {
          description: 'Verify your input parameters'
        }
      ]
    }, cause);
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends XGPTError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'NETWORK_ERROR',
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      title: 'Network Error',
      message,
      context,
      recoveryActions: [
        {
          description: 'Check your internet connection'
        },
        {
          description: 'Retry the operation in a few minutes'
        },
        {
          description: 'Check if the service is experiencing issues'
        }
      ]
    }, cause);
  }
}

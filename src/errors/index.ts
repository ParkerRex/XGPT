/**
 * Enhanced error handling system for XGPT CLI
 * Exports all error types, handlers, and utilities
 */

// Export error types and classes
export {
  ErrorCategory,
  ErrorSeverity,
  XGPTError,
  ConfigurationError,
  AuthenticationError,
  RateLimitError,
  DatabaseError,
  ValidationError,
  NetworkError,
} from "./types.js";

// Export TypeScript interfaces as types
export type {
  ErrorContext,
  RecoveryAction,
  XGPTErrorDetails,
} from "./types.js";

// Export error handler and utilities
export {
  ErrorHandler,
  errorHandler,
  handleCommandError,
  createError,
  handleWarning,
} from "./handler.js";

// Export API error handling
export {
  ApiError,
  ApiErrors,
  HttpStatus,
  toApiError,
  createErrorResponse,
} from "./api.js";

export type { HttpStatusCode, ApiErrorResponse } from "./api.js";

// Re-export for convenience
export type { CommandResult } from "../types/common.js";

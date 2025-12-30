/**
 * API-specific error handling for XGPT web server
 * Provides standardized HTTP error responses
 */

import {
  XGPTError,
  ErrorCategory,
  ErrorSeverity,
  type ErrorContext,
} from "./types.js";

/**
 * HTTP status codes for common API errors
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string;
    timestamp: string;
  };
  status: number;
}

/**
 * API Error class with HTTP status code support
 */
export class ApiError extends XGPTError {
  public readonly statusCode: HttpStatusCode;

  constructor(
    code: string,
    message: string,
    statusCode: HttpStatusCode = HttpStatus.BAD_REQUEST,
    context?: ErrorContext,
  ) {
    super({
      code,
      category: ApiError.categoryFromStatus(statusCode),
      severity: ApiError.severityFromStatus(statusCode),
      title: ApiError.titleFromStatus(statusCode),
      message,
      context,
    });
    this.statusCode = statusCode;
  }

  /**
   * Convert to standardized API response format
   */
  toResponse(): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.technicalDetails,
        timestamp: new Date().toISOString(),
      },
      status: this.statusCode,
    };
  }

  /**
   * Map HTTP status to error category
   */
  private static categoryFromStatus(status: HttpStatusCode): ErrorCategory {
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return ErrorCategory.RATE_LIMIT;
    }
    if (
      status === HttpStatus.UNPROCESSABLE_ENTITY ||
      status === HttpStatus.BAD_REQUEST
    ) {
      return ErrorCategory.USER_INPUT;
    }
    if (status >= 500) {
      return ErrorCategory.SYSTEM;
    }
    return ErrorCategory.API_ERROR;
  }

  /**
   * Map HTTP status to error severity
   */
  private static severityFromStatus(status: HttpStatusCode): ErrorSeverity {
    if (status >= 500) return ErrorSeverity.HIGH;
    if (status === HttpStatus.UNAUTHORIZED) return ErrorSeverity.HIGH;
    if (status === HttpStatus.TOO_MANY_REQUESTS) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.LOW;
  }

  /**
   * Map HTTP status to error title
   */
  private static titleFromStatus(status: HttpStatusCode): string {
    const titles: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: "Bad Request",
      [HttpStatus.UNAUTHORIZED]: "Unauthorized",
      [HttpStatus.FORBIDDEN]: "Forbidden",
      [HttpStatus.NOT_FOUND]: "Not Found",
      [HttpStatus.CONFLICT]: "Conflict",
      [HttpStatus.UNPROCESSABLE_ENTITY]: "Validation Error",
      [HttpStatus.TOO_MANY_REQUESTS]: "Rate Limit Exceeded",
      [HttpStatus.INTERNAL_SERVER_ERROR]: "Internal Server Error",
      [HttpStatus.SERVICE_UNAVAILABLE]: "Service Unavailable",
    };
    return titles[status] || "Error";
  }
}

/**
 * Factory functions for common API errors
 */
export const ApiErrors = {
  badRequest: (message: string, code = "BAD_REQUEST") =>
    new ApiError(code, message, HttpStatus.BAD_REQUEST),

  unauthorized: (message = "Authentication required") =>
    new ApiError("UNAUTHORIZED", message, HttpStatus.UNAUTHORIZED),

  forbidden: (message = "Access denied") =>
    new ApiError("FORBIDDEN", message, HttpStatus.FORBIDDEN),

  notFound: (resource: string) =>
    new ApiError("NOT_FOUND", `${resource} not found`, HttpStatus.NOT_FOUND),

  conflict: (message: string) =>
    new ApiError("CONFLICT", message, HttpStatus.CONFLICT),

  validation: (message: string, field?: string) =>
    new ApiError(
      "VALIDATION_ERROR",
      field ? `${field}: ${message}` : message,
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),

  rateLimit: (message = "Too many requests. Please try again later.") =>
    new ApiError("RATE_LIMIT", message, HttpStatus.TOO_MANY_REQUESTS),

  internal: (message = "An unexpected error occurred") =>
    new ApiError("INTERNAL_ERROR", message, HttpStatus.INTERNAL_SERVER_ERROR),

  serviceUnavailable: (message = "Service temporarily unavailable") =>
    new ApiError(
      "SERVICE_UNAVAILABLE",
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
};

/**
 * Convert any error to an ApiError
 */
export function toApiError(error: unknown): ApiError {
  // Already an ApiError
  if (error instanceof ApiError) {
    return error;
  }

  // XGPTError - convert based on category
  if (error instanceof XGPTError) {
    const statusMap: Record<ErrorCategory, HttpStatusCode> = {
      [ErrorCategory.AUTHENTICATION]: HttpStatus.UNAUTHORIZED,
      [ErrorCategory.RATE_LIMIT]: HttpStatus.TOO_MANY_REQUESTS,
      [ErrorCategory.USER_INPUT]: HttpStatus.BAD_REQUEST,
      [ErrorCategory.DATA_VALIDATION]: HttpStatus.UNPROCESSABLE_ENTITY,
      [ErrorCategory.CONFIGURATION]: HttpStatus.BAD_REQUEST,
      [ErrorCategory.DATABASE]: HttpStatus.INTERNAL_SERVER_ERROR,
      [ErrorCategory.NETWORK]: HttpStatus.SERVICE_UNAVAILABLE,
      [ErrorCategory.FILE_SYSTEM]: HttpStatus.INTERNAL_SERVER_ERROR,
      [ErrorCategory.COMMAND_USAGE]: HttpStatus.BAD_REQUEST,
      [ErrorCategory.API_ERROR]: HttpStatus.BAD_REQUEST,
      [ErrorCategory.SYSTEM]: HttpStatus.INTERNAL_SERVER_ERROR,
      [ErrorCategory.UNKNOWN]: HttpStatus.INTERNAL_SERVER_ERROR,
    };
    return new ApiError(
      error.code,
      error.message,
      statusMap[error.category] || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  // Standard Error
  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase();

    if (message.includes("not found") || message.includes("does not exist")) {
      return ApiErrors.notFound("Resource");
    }
    if (
      message.includes("unauthorized") ||
      message.includes("authentication")
    ) {
      return ApiErrors.unauthorized(error.message);
    }
    if (message.includes("rate limit") || message.includes("too many")) {
      return ApiErrors.rateLimit(error.message);
    }
    if (message.includes("validation") || message.includes("invalid")) {
      return ApiErrors.validation(error.message);
    }

    return ApiErrors.internal(error.message);
  }

  // Unknown error type
  return ApiErrors.internal("An unexpected error occurred");
}

/**
 * Create a standardized error response for Elysia
 */
export function createErrorResponse(
  error: unknown,
  set: { status?: number },
): ApiErrorResponse {
  const apiError = toApiError(error);
  set.status = apiError.statusCode;
  return apiError.toResponse();
}

/**
 * User-friendly error messages for UI display
 * Maps technical error codes and messages to human-readable text with suggested actions
 */

/**
 * User-friendly error information
 */
export interface FriendlyError {
  /** User-friendly title */
  title: string;
  /** Detailed message explaining what went wrong */
  message: string;
  /** Suggested actions the user can take */
  suggestions: string[];
  /** Severity level for styling */
  severity: "info" | "warning" | "error" | "critical";
}

/**
 * Technical error pattern to friendly message mapping
 */
interface ErrorPattern {
  pattern: RegExp;
  friendly: FriendlyError;
}

/**
 * Error patterns with their friendly messages
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Network connectivity errors
  {
    pattern: /ECONNREFUSED/i,
    friendly: {
      title: "Connection Refused",
      message:
        "Could not connect to the server. The service might be down or your network may be blocking the connection.",
      suggestions: [
        "Check your internet connection",
        "Try again in a few minutes",
        "Check if you're behind a firewall or VPN",
      ],
      severity: "error",
    },
  },
  {
    pattern: /ENOTFOUND|dns.*lookup.*failed/i,
    friendly: {
      title: "Server Not Found",
      message:
        "Could not find the server. There might be a DNS issue or the service is unreachable.",
      suggestions: [
        "Check your internet connection",
        "Try using a different DNS server",
        "Wait a moment and try again",
      ],
      severity: "error",
    },
  },
  {
    pattern: /ETIMEDOUT|request.*timeout/i,
    friendly: {
      title: "Request Timed Out",
      message:
        "The request took too long to complete. This usually means the server is slow or your connection is unstable.",
      suggestions: [
        "Check your internet connection speed",
        "Try again with a smaller batch size",
        "Wait a few minutes and retry",
      ],
      severity: "warning",
    },
  },
  {
    pattern: /ECONNRESET|socket hang up/i,
    friendly: {
      title: "Connection Reset",
      message:
        "The connection was unexpectedly closed. This can happen due to network instability or server issues.",
      suggestions: [
        "Check your internet connection",
        "Try again in a few moments",
        "If this persists, try restarting your router",
      ],
      severity: "warning",
    },
  },
  {
    pattern: /fetch failed|network.*error/i,
    friendly: {
      title: "Network Error",
      message:
        "A network error occurred while trying to reach the service. This is usually temporary.",
      suggestions: [
        "Check your internet connection",
        "Try again in a few moments",
        "Disable VPN if you're using one",
      ],
      severity: "warning",
    },
  },

  // Rate limiting errors
  {
    pattern: /rate.?limit|429|too many requests/i,
    friendly: {
      title: "Rate Limited",
      message:
        "You've made too many requests in a short time. Twitter limits how often you can access their API.",
      suggestions: [
        "Wait 15-30 minutes before trying again",
        'Switch to a "conservative" rate limit profile',
        "Reduce the number of tweets to fetch",
      ],
      severity: "warning",
    },
  },
  {
    pattern: /quota.*exceeded/i,
    friendly: {
      title: "Quota Exceeded",
      message:
        "You've exceeded your API quota. This usually resets daily or monthly.",
      suggestions: [
        "Wait until your quota resets",
        "Check your API usage limits",
        "Consider upgrading your API plan",
      ],
      severity: "warning",
    },
  },

  // Authentication errors
  {
    pattern: /401|unauthorized/i,
    friendly: {
      title: "Authentication Failed",
      message:
        "Your credentials are invalid or expired. You'll need to update your authentication tokens.",
      suggestions: [
        "Check your AUTH_TOKEN and CT0 values in .env",
        "Re-export your Twitter cookies",
        "Make sure you're logged into Twitter in your browser",
      ],
      severity: "critical",
    },
  },
  {
    pattern: /403|forbidden/i,
    friendly: {
      title: "Access Denied",
      message:
        "You don't have permission to access this resource. Your account may be restricted.",
      suggestions: [
        "Check if your Twitter account is in good standing",
        "Verify your authentication tokens",
        "Try logging out and back into Twitter",
      ],
      severity: "critical",
    },
  },
  {
    pattern: /invalid.*token|auth.*token|session.*expired/i,
    friendly: {
      title: "Invalid Token",
      message:
        "Your authentication token is invalid or has expired. You'll need to get fresh tokens.",
      suggestions: [
        "Re-export your Twitter cookies from the browser",
        "Update AUTH_TOKEN and CT0 in your .env file",
        "Make sure you're logged into Twitter",
      ],
      severity: "critical",
    },
  },
  {
    pattern: /not.*logged.*in/i,
    friendly: {
      title: "Not Logged In",
      message: "You're not logged into Twitter. Authentication is required.",
      suggestions: [
        "Log into Twitter in your browser",
        "Export your cookies and add them to .env",
        "Check the setup guide for authentication steps",
      ],
      severity: "critical",
    },
  },
  {
    pattern: /openai.*key|api.*key.*invalid/i,
    friendly: {
      title: "Invalid API Key",
      message:
        "Your OpenAI API key is missing or invalid. This is required for embedding and AI features.",
      suggestions: [
        "Add your OpenAI API key to .env",
        "Check that your API key is correct",
        "Verify your OpenAI account is active",
      ],
      severity: "critical",
    },
  },

  // Server errors
  {
    pattern: /500|internal.*server.*error/i,
    friendly: {
      title: "Server Error",
      message:
        "Twitter's servers encountered an error. This is on their end, not yours.",
      suggestions: [
        "Wait a few minutes and try again",
        "Check Twitter's status page",
        "Try a smaller request",
      ],
      severity: "error",
    },
  },
  {
    pattern: /502|bad.*gateway/i,
    friendly: {
      title: "Service Unavailable",
      message:
        "Twitter's servers are temporarily overloaded or under maintenance.",
      suggestions: [
        "Wait 5-10 minutes and try again",
        "Check Twitter's status page for outages",
        "Try during off-peak hours",
      ],
      severity: "error",
    },
  },
  {
    pattern: /503|service.*unavailable/i,
    friendly: {
      title: "Service Unavailable",
      message:
        "Twitter's service is temporarily unavailable. This is usually brief.",
      suggestions: [
        "Wait a few minutes and try again",
        "Check if Twitter is experiencing issues",
        "Try again later",
      ],
      severity: "error",
    },
  },
  {
    pattern: /504|gateway.*timeout/i,
    friendly: {
      title: "Gateway Timeout",
      message:
        "Twitter's servers took too long to respond. This is typically a temporary issue.",
      suggestions: [
        "Wait a moment and try again",
        "Try a smaller request",
        "Check your internet connection",
      ],
      severity: "warning",
    },
  },

  // Validation errors
  {
    pattern: /user.*not.*found|does.*not.*exist/i,
    friendly: {
      title: "User Not Found",
      message:
        "The Twitter user you specified doesn't exist or has been suspended.",
      suggestions: [
        "Double-check the username spelling",
        "Make sure the account hasn't been deleted or suspended",
        "Try searching for the user on Twitter directly",
      ],
      severity: "info",
    },
  },
  {
    pattern: /invalid.*username/i,
    friendly: {
      title: "Invalid Username",
      message:
        "The username format is invalid. Twitter usernames can only contain letters, numbers, and underscores.",
      suggestions: [
        "Remove the @ symbol if present",
        "Check for special characters",
        "Verify the username on Twitter",
      ],
      severity: "info",
    },
  },
  {
    pattern: /invalid.*input|validation.*error/i,
    friendly: {
      title: "Invalid Input",
      message: "The input you provided is not valid. Please check your values.",
      suggestions: [
        "Review the input requirements",
        "Check for typos or formatting issues",
        "Try using the default values first",
      ],
      severity: "info",
    },
  },
  {
    pattern: /required.*parameter|missing.*argument/i,
    friendly: {
      title: "Missing Input",
      message:
        "A required field is missing. Please fill in all required fields.",
      suggestions: [
        "Check that all required fields are filled",
        "Review the form for empty fields",
        "Refresh the page and try again",
      ],
      severity: "info",
    },
  },

  // Database errors
  {
    pattern: /sqlite|database.*error|db.*error/i,
    friendly: {
      title: "Database Error",
      message:
        "There was an issue with the database. The data might be corrupted or the database needs initialization.",
      suggestions: [
        "Try initializing the database with 'xgpt db --init'",
        "Check if the data directory has write permissions",
        "Try running database optimization",
      ],
      severity: "error",
    },
  },
  {
    pattern: /unique.*constraint/i,
    friendly: {
      title: "Duplicate Entry",
      message:
        "This item already exists in the database. No action needed - the data is already saved.",
      suggestions: [
        "This is informational - the data already exists",
        "You can safely ignore this message",
        "Check the database for existing entries",
      ],
      severity: "info",
    },
  },

  // OpenAI/Embedding errors
  {
    pattern: /embedding.*failed/i,
    friendly: {
      title: "Embedding Failed",
      message:
        "Failed to generate embeddings for the tweets. This is required for the AI Q&A feature.",
      suggestions: [
        "Check your OpenAI API key",
        "Verify you have API credits available",
        "Try again with a smaller batch size",
      ],
      severity: "error",
    },
  },
  {
    pattern: /no.*embeddings|embeddings.*not.*found/i,
    friendly: {
      title: "No Embeddings Found",
      message:
        "No embeddings found in the database. You need to generate embeddings before using the Ask feature.",
      suggestions: [
        'Go to the Embed page and click "Generate Embeddings"',
        "Make sure you have tweets in the database first",
        "Run the embed command from CLI",
      ],
      severity: "info",
    },
  },
];

/**
 * Default error message when no pattern matches
 */
const DEFAULT_ERROR: FriendlyError = {
  title: "Something Went Wrong",
  message:
    "An unexpected error occurred. This might be temporary - please try again.",
  suggestions: [
    "Try the operation again",
    "Check your internet connection",
    "If the problem persists, check the console for details",
  ],
  severity: "error",
};

/**
 * Convert a technical error to a user-friendly error
 */
export function toFriendlyError(error: unknown): FriendlyError {
  const errorMessage = extractErrorMessage(error);

  // Try to match against known patterns
  for (const { pattern, friendly } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return friendly;
    }
  }

  // Return default error with the original message included
  return {
    ...DEFAULT_ERROR,
    message: errorMessage || DEFAULT_ERROR.message,
  };
}

/**
 * Extract error message from various error types
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "";
}

/**
 * Format a friendly error as HTML for the web UI
 */
export function formatFriendlyErrorHtml(error: FriendlyError): string {
  const severityColors = {
    info: "var(--text-muted)",
    warning: "#f59e0b",
    error: "#ef4444",
    critical: "#dc2626",
  };

  const severityIcons = {
    info: "ℹ️",
    warning: "⚠️",
    error: "❌",
    critical: "🚨",
  };

  const suggestionsHtml =
    error.suggestions.length > 0
      ? `
    <div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 4px;">
      <strong style="color: var(--text-muted);">Suggestions:</strong>
      <ul style="margin: 0.5rem 0 0 1.25rem; padding: 0; color: var(--text-secondary);">
        ${error.suggestions.map((s) => `<li style="margin: 0.25rem 0;">${s}</li>`).join("")}
      </ul>
    </div>
  `
      : "";

  return `
    <div style="text-align: left;">
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
        <span style="font-size: 1.25rem;">${severityIcons[error.severity]}</span>
        <strong style="color: ${severityColors[error.severity]}; font-size: 1.1rem;">${error.title}</strong>
      </div>
      <p style="margin: 0; color: var(--text-primary);">${error.message}</p>
      ${suggestionsHtml}
    </div>
  `;
}

/**
 * Get a simple one-line friendly message for an error
 */
export function getSimpleFriendlyMessage(error: unknown): string {
  const friendly = toFriendlyError(error);
  return `${friendly.title}: ${friendly.message}`;
}

/**
 * Check if an error is critical (requires user action to fix)
 */
export function isCriticalError(error: unknown): boolean {
  const friendly = toFriendlyError(error);
  return friendly.severity === "critical";
}

/**
 * Check if an error is just informational (not really an error)
 */
export function isInfoError(error: unknown): boolean {
  const friendly = toFriendlyError(error);
  return friendly.severity === "info";
}

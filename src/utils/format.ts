/**
 * Formatting utility functions
 */

/**
 * Format a number in a human-readable compact form (K, M suffixes)
 * @param n Number to format
 * @returns Formatted string (e.g., "1.2K", "3.5M") or "-" for null/undefined
 */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/**
 * Format a duration in human-readable form
 * @param start Start date
 * @param end End date (defaults to now)
 * @returns Formatted duration string (e.g., "30s", "2m 15s")
 */
export function formatDuration(start: Date, end?: Date): string {
  const ms = (end || new Date()).getTime() - start.getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

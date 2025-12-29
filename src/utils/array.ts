/**
 * Array utility functions
 */

/**
 * Split an array into chunks of specified size
 * @param arr Array to chunk
 * @param size Maximum size of each chunk
 * @returns Array of chunks
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_v, i) =>
    arr.slice(i * size, i * size + size),
  );
}

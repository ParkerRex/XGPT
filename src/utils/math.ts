/**
 * Math utility functions
 */

/**
 * Calculate cosine similarity between two vectors
 * Used for comparing embedding vectors in semantic search
 * @param a First vector
 * @param b Second vector
 * @returns Cosine similarity score (0-1, where 1 is identical)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dot += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

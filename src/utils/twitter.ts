export function parseTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/status\/(\d+)/);
  return match?.[1] ?? null;
}

export function normalizeUsername(input: string): string {
  return input.startsWith("@") ? input.slice(1) : input;
}

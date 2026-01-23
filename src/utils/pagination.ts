export interface CursorState {
  cursor?: string | null;
  queryIndex?: number;
}

const CURSOR_PREFIX = "xgpt:";

export function serializeCursorState(state: CursorState): string {
  return `${CURSOR_PREFIX}${JSON.stringify(state)}`;
}

export function parseCursorState(raw?: string | null): CursorState | null {
  if (!raw) return null;
  if (raw.startsWith(CURSOR_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(CURSOR_PREFIX.length)) as CursorState;
      return parsed ?? null;
    } catch {
      return { cursor: raw };
    }
  }
  return { cursor: raw };
}

export function redactCursor(cursor?: string | null, maxLength = 14): string {
  if (!cursor) return "none";
  if (cursor.length <= maxLength) return cursor;
  return `${cursor.slice(0, 6)}...${cursor.slice(-4)}`;
}

export async function waitForPageDelay(delayMs?: number): Promise<void> {
  if (!delayMs || delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function compareTweetIds(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  try {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left === right) return 0;
    return left > right ? 1 : -1;
  } catch {
    if (a === b) return 0;
    return a > b ? 1 : -1;
  }
}

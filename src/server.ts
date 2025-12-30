/**
 * XGPT Web Server
 *
 * This file re-exports from the modular server structure for backwards compatibility.
 * The actual implementation is in src/server/
 */

export { createServer } from "./server/index.js";

// Re-export for convenience
export * from "./server/templates/index.js";
export * from "./server/routes/index.js";

// Allow running directly
if (import.meta.main) {
  const { createServer } = await import("./server/index.js");
  await createServer(3000);
}

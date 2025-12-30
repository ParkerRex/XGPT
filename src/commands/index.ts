// Export all command modules
export { scrapeCommand, scrapeUser } from "./scrape.js";
export { embedCommand, generateEmbeddings } from "./embed.js";
export { askCommand, askQuestion } from "./ask.js";
export { interactiveCommand } from "./interactive.js";
export { searchCommand } from "./search.js";
export {
  listConfigCommand,
  getConfigCommand,
  setConfigCommand,
  resetConfigCommand,
  configInfoCommand,
} from "./config.js";

// Re-export types for convenience
export type {
  Tweet,
  TweetWithEmbedding,
  Row,
  ScrapingOptions,
  EmbeddingOptions,
  QueryOptions,
  CommandResult,
  SearchOptions,
  SearchStats,
} from "../types/common.js";

export type { SessionConfig, PromptSession } from "../types/session.js";

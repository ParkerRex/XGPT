#!/usr/bin/env bun
/**
 * Patches @the-convocation/twitter-scraper library to fix broken endpoints.
 * Run automatically via postinstall or manually: bun run scripts/patch-twitter-scraper.ts
 *
 * Fixes:
 * 1. SearchTimeline query ID (for profile search)
 * 2. Missing feature flags required by Twitter's API
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const LIB_PATH =
  "node_modules/@the-convocation/twitter-scraper/dist/node/esm/index.mjs";

if (!existsSync(LIB_PATH)) {
  console.log("[patch] Library not found, skipping patch");
  process.exit(0);
}

let content = readFileSync(LIB_PATH, "utf-8");
let patched = false;

// Patch 1: Update SearchTimeline query ID
const OLD_QUERY_ID = "bshMIjqDk8LTXTq4w91WKw";
const NEW_QUERY_ID = "nK1dw4oV3k4w5TdtcAdSww";

if (content.includes(OLD_QUERY_ID)) {
  content = content.replaceAll(OLD_QUERY_ID, NEW_QUERY_ID);
  patched = true;
  console.log("[patch] Updated SearchTimeline query ID");
}

// Patch 2: Add missing feature flags
const OLD_FEATURES_END =
  '%22responsive_web_enhance_cards_enabled%22%3Afalse%7D"';
const NEW_FEATURES_END =
  '%22responsive_web_enhance_cards_enabled%22%3Afalse%2C%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue%2C%22tweetypie_unmention_optimization_enabled%22%3Atrue%2C%22responsive_web_media_download_video_enabled%22%3Afalse%2C%22rweb_lists_timeline_redesign_enabled%22%3Atrue%7D"';

if (content.includes(OLD_FEATURES_END)) {
  content = content.replaceAll(OLD_FEATURES_END, NEW_FEATURES_END);
  patched = true;
  console.log("[patch] Added missing feature flags");
}

if (patched) {
  writeFileSync(LIB_PATH, content);
  console.log("[patch] twitter-scraper patched successfully!");
} else {
  console.log("[patch] Already patched or no changes needed");
}

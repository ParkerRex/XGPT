import { Scraper } from "@the-convocation/twitter-scraper";
import "dotenv/config";
import type { CommandResult } from "../types/common.js";
import { discoverSessionQueries, userQueries } from "../database/queries.js";
import { handleCommandError, AuthenticationError } from "../errors/index.js";
import { createQueryIdCacheTransform } from "../twitter/queryIdCache.js";
import {
  parseCursorState,
  redactCursor,
  serializeCursorState,
  waitForPageDelay,
} from "../utils/pagination.js";

export interface DiscoverOptions {
  query: string;
  maxResults?: number;
  save?: boolean;
  json?: boolean;
  all?: boolean;
  maxPages?: number;
  cursor?: string;
  delayMs?: number;
  resume?: number;
  fresh?: boolean;
  skipUntilProfile?: string;
}

interface DiscoveredProfile {
  username: string;
  name: string | undefined;
  bio: string | undefined;
  followers: number | undefined;
  following: number | undefined;
  tweets: number | undefined;
  location: string | undefined;
  website: string | undefined;
  verified: boolean | undefined;
  joined: Date | undefined;
}

export async function discoverCommand(
  options: DiscoverOptions,
): Promise<CommandResult> {
  const {
    query,
    maxResults = 20,
    save = false,
    json = false,
    resume,
  } = options;
  let sessionId: number | null = null;

  try {
    if (resume) {
      return resumeDiscover(resume, options);
    }

    if (!json) {
      console.log(`[discover] Searching for profiles matching "${query}"...`);
    }

    // Set up cookies for authentication
    const cookies = [
      `auth_token=${process.env.AUTH_TOKEN}; Path=/; Domain=.x.com; Secure; HttpOnly`,
      `ct0=${process.env.CT0}; Path=/; Domain=.x.com; Secure`,
    ];

    if (!process.env.AUTH_TOKEN || !process.env.CT0) {
      const authError = new AuthenticationError(
        "Twitter authentication tokens are missing or invalid",
        {
          command: "users discover",
          operation: "authentication_check",
        },
      );
      return handleCommandError(authError);
    }

    // Initialize scraper
    const scraper = new Scraper({
      transform: createQueryIdCacheTransform(),
      experimental: {
        xClientTransactionId: true,
        xpff: true,
      },
    });
    await scraper.setCookies(cookies);

    const session = await discoverSessionQueries.createSession({
      query,
      maxProfiles: maxResults,
      saveResults: save,
      status: "running",
    });
    sessionId = session.id;
    if (!json) {
      console.log(`[stats] Created discover session (ID: ${session.id})`);
    }

    const profiles: DiscoveredProfile[] = [];
    let savedCount = 0;

    const effectiveMaxProfiles = options.all
      ? Number.MAX_SAFE_INTEGER
      : maxResults;
    const pageSize = 20;
    const cursorState = parseCursorState(options.cursor);
    let cursor = cursorState?.cursor ?? undefined;
    let pageCount = 0;
    let lastProfileId: string | null = null;
    let skipping = Boolean(options.skipUntilProfile);

    while (profiles.length < effectiveMaxProfiles) {
      if (options.maxPages && pageCount >= options.maxPages) break;

      const remaining = effectiveMaxProfiles - profiles.length;
      const perPage = Math.min(pageSize, remaining);
      const response = await scraper.fetchSearchProfiles(
        query,
        perPage,
        cursor,
      );

      pageCount++;
      const pageProfiles = response.profiles ?? [];
      for (const profile of pageProfiles) {
        const discovered: DiscoveredProfile = {
          username: profile.username ?? "unknown",
          name: profile.name,
          bio: profile.biography,
          followers: profile.followersCount,
          following: profile.followingCount,
          tweets: profile.tweetsCount ?? profile.statusesCount,
          location: profile.location,
          website: profile.website ?? profile.url,
          verified: profile.isVerified || profile.isBlueVerified,
          joined: profile.joined,
        };

        if (skipping) {
          if (discovered.username === options.skipUntilProfile) {
            skipping = false;
          }
          continue;
        }

        profiles.push(discovered);
        lastProfileId = discovered.username;

        // Save to database if requested
        if (save && discovered.username !== "unknown") {
          try {
            await userQueries.upsertUser(discovered.username, {
              displayName: discovered.name,
              bio: discovered.bio,
              location: discovered.location,
              website: discovered.website,
              followersCount: discovered.followers,
              followingCount: discovered.following,
              tweetsCount: discovered.tweets,
              isVerified: discovered.verified,
            });
            savedCount++;
          } catch {
            // Ignore duplicate errors
          }
        }

        if (!json) {
          process.stdout.write(
            `\r[discover] Found ${profiles.length} profiles...`,
          );
        }

        if (profiles.length >= effectiveMaxProfiles) {
          break;
        }
      }

      cursor = response.next;
      await discoverSessionQueries.saveCursor(
        session.id,
        serializeCursorState({ cursor: cursor ?? null }),
        lastProfileId,
        pageCount,
      );

      if (!cursor) break;
      if (options.maxPages && pageCount >= options.maxPages) break;

      await waitForPageDelay(options.delayMs);
    }

    if (!json) {
      process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear line
    }

    await discoverSessionQueries.updateSession(session.id, {
      profilesFound: profiles.length,
      status: "completed",
      completedAt: new Date(),
    });

    // Output results
    if (json) {
      return {
        success: true,
        message: `Found ${profiles.length} profiles`,
        data: {
          profiles,
          savedCount,
          sessionId: session.id,
          pageCount,
          nextCursor: cursor ?? null,
          lastProfileId,
        },
      };
    }

    if (profiles.length === 0) {
      console.log(`[info] No profiles found matching "${query}"`);
      return {
        success: true,
        message: "No profiles found",
        data: { profiles: [], savedCount: 0 },
      };
    }

    console.log(`\n[ok] Found ${profiles.length} profiles:\n`);

    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i]!;
      const bio = p.bio ? p.bio.substring(0, 80).replace(/\n/g, " ") : "No bio";
      const verified = p.verified ? " [verified]" : "";

      console.log(`${i + 1}. @${p.username}${verified}`);
      console.log(`   Name: ${p.name ?? "N/A"}`);
      console.log(`   Bio: ${bio}${p.bio && p.bio.length > 80 ? "..." : ""}`);
      console.log(
        `   Followers: ${formatNumber(p.followers)} | Following: ${formatNumber(p.following)} | Tweets: ${formatNumber(p.tweets)}`,
      );
      if (p.location) console.log(`   Location: ${p.location}`);
      console.log();
    }

    if (save) {
      console.log(`[save] Saved ${savedCount} users to database`);
    }

    return {
      success: true,
      message: `Found ${profiles.length} profiles matching "${query}"`,
      data: {
        profiles,
        savedCount,
        sessionId: session.id,
        pageCount,
        nextCursor: cursor ?? null,
        lastProfileId,
      },
    };
  } catch (error) {
    if (sessionId) {
      await discoverSessionQueries.updateSession(sessionId, {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
    return handleCommandError(error, {
      command: "users discover",
      operation: "profile_search",
    });
  }
}

async function resumeDiscover(
  sessionId: number,
  options: DiscoverOptions,
): Promise<CommandResult> {
  const session = await discoverSessionQueries.getSessionById(sessionId);
  if (!session) {
    return {
      success: false,
      message: `Discover session ${sessionId} not found`,
    };
  }

  if (session.status === "completed") {
    return {
      success: false,
      message: `Discover session ${sessionId} is already completed`,
    };
  }

  const cursorData = await discoverSessionQueries.getCursor(sessionId);
  if (!cursorData && !options.fresh && !options.cursor) {
    return {
      success: false,
      message: `No cursor saved for session ${sessionId}. Cannot resume.`,
    };
  }

  if (options.fresh) {
    await discoverSessionQueries.updateSession(sessionId, {
      profilesFound: 0,
      pageCount: 0,
    });
  }

  await discoverSessionQueries.updateSession(sessionId, { status: "running" });

  if (!options.json) {
    console.log(`[resume] Resuming discover session ${sessionId}...`);
    if (cursorData?.cursor) {
      const parsedCursor = parseCursorState(cursorData.cursor);
      if (parsedCursor?.cursor) {
        console.log(`[info] Saved cursor: ${redactCursor(parsedCursor.cursor)}`);
      }
    }
  }

  const parsedCursor = parseCursorState(cursorData?.cursor ?? null);
  const savedCursor = parsedCursor?.cursor ?? undefined;

  return discoverCommand({
    ...options,
    query: session.query,
    maxResults: session.maxProfiles,
    save: session.saveResults ?? false,
    cursor: options.cursor ?? (options.fresh ? undefined : savedCursor),
    skipUntilProfile:
      options.cursor || options.fresh || savedCursor
        ? undefined
        : cursorData?.lastProfileId,
    resume: undefined,
  });
}

function formatNumber(n: number | undefined): string {
  if (n === undefined) return "N/A";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

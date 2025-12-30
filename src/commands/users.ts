import { Scraper } from "@the-convocation/twitter-scraper";
import "dotenv/config";
import type { CommandResult } from "../types/common.js";
import { userQueries } from "../database/queries.js";
import { handleCommandError, AuthenticationError } from "../errors/index.js";

export interface DiscoverOptions {
  query: string;
  maxResults?: number;
  save?: boolean;
  json?: boolean;
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
  const { query, maxResults = 20, save = false, json = false } = options;

  try {
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
      experimental: {
        xClientTransactionId: true,
        xpff: true,
      },
    });
    await scraper.setCookies(cookies);

    const profiles: DiscoveredProfile[] = [];
    let savedCount = 0;

    for await (const profile of scraper.searchProfiles(query, maxResults)) {
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

      profiles.push(discovered);

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

      if (profiles.length >= maxResults) {
        break;
      }
    }

    if (!json) {
      process.stdout.write("\r" + " ".repeat(50) + "\r"); // Clear line
    }

    // Output results
    if (json) {
      return {
        success: true,
        message: `Found ${profiles.length} profiles`,
        data: { profiles, savedCount },
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
      data: { profiles, savedCount },
    };
  } catch (error) {
    return handleCommandError(error, {
      command: "users discover",
      operation: "profile_search",
    });
  }
}

function formatNumber(n: number | undefined): string {
  if (n === undefined) return "N/A";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

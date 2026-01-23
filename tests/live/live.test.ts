import { expect } from "bun:test";
import {
  assertBasicTweet,
  authFailureHint,
  createLiveScraper,
  describeLive,
  getFirstSearchTweet,
  getFirstUserTweet,
  getLiveQuery,
  getLiveUser,
  itAuthLive,
} from "./_helpers";

describeLive("Live Tests - Auth", () => {
  itAuthLive("auth tokens allow a minimal live request", async () => {
    try {
      const scraper = await createLiveScraper();
      const tweet = await getFirstSearchTweet(scraper, getLiveQuery());

      if (tweet) {
        assertBasicTweet(tweet);
      } else {
        expect(true).toBe(true);
      }
    } catch (error) {
      throw authFailureHint(error);
    }
  });
});

describeLive("Live Tests - Search", () => {
  itAuthLive("search returns a tweet or empty result", async () => {
    try {
      const scraper = await createLiveScraper();
      const tweet = await getFirstSearchTweet(scraper, getLiveQuery());

      if (tweet) {
        assertBasicTweet(tweet);
      } else {
        expect(true).toBe(true);
      }
    } catch (error) {
      throw authFailureHint(error);
    }
  });
});

describeLive("Live Tests - User Timeline", () => {
  itAuthLive("user timeline returns a tweet or empty result", async () => {
    try {
      const scraper = await createLiveScraper();
      const tweet = await getFirstUserTweet(scraper, getLiveUser());

      if (tweet) {
        assertBasicTweet(tweet);
      } else {
        expect(true).toBe(true);
      }
    } catch (error) {
      throw authFailureHint(error);
    }
  });
});

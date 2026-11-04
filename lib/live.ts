import { cacheLife, cacheTag } from "next/cache";

// Data that changes as Congress votes and the Court rules: the vote feeds,
// Top Stories and everything derived from them. It refreshes at most every
// 30 minutes while the site is visited, is never served more than a day old,
// and /api/refresh refreshes all of it at once.
export const LIVE_TAG = "live";

// Call at the top of a "use cache" function.
export function liveData() {
  cacheLife("live");
  cacheTag(LIVE_TAG);
}

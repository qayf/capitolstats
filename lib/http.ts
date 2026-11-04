import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Small disk cache in front of every upstream request. The free api.data.gov
// keys are rate limited, so a response is reused until its TTL runs out, and a
// stale copy is served if the upstream request fails.
const CACHE_DIR = path.join(process.cwd(), ".cache", "http");

export const API_KEY = process.env.DATA_GOV_API_KEY || "DEMO_KEY";

// Touched by /api/refresh. Cached responses with a TTL of an hour or less
// (the live feeds) that are older than this file are fetched again.
const REFRESH_MARKER = path.join(process.cwd(), ".cache", "refreshed-at");
const LIVE_TTL = 60 * 60;

export async function markRefreshed() {
  await fs.mkdir(path.dirname(REFRESH_MARKER), { recursive: true });
  await fs.writeFile(REFRESH_MARKER, new Date().toISOString());
}

async function refreshedAt() {
  try {
    return (await fs.stat(REFRESH_MARKER)).mtimeMs;
  } catch {
    return 0;
  }
}

function cacheFile(url: string) {
  const key = url.replace(/api_key=[^&]+&?/, "");
  return path.join(CACHE_DIR, createHash("sha1").update(key).digest("hex"));
}

export async function fetchText(url: string, ttlSeconds: number, headers: Record<string, string> = {}): Promise<string> {
  const file = cacheFile(url);
  let stale: string | null = null;

  try {
    const [stat, body] = await Promise.all([fs.stat(file), fs.readFile(file, "utf8")]);
    const forced = ttlSeconds <= LIVE_TTL && stat.mtimeMs < (await refreshedAt());
    if (!forced && Date.now() - stat.mtimeMs < ttlSeconds * 1000) return body;
    stale = body;
  } catch {
    // not cached yet
  }

  try {
    const body = await download(url, headers);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, body);
    return body;
  } catch (err) {
    if (stale !== null) return stale;
    const shown = url.replace(/api_key=[^&]+/, "api_key=***");
    throw new Error(`Request failed: ${shown} (${(err as Error).message})`);
  }
}

// One retry for dropped connections and server errors; client errors fail fast.
async function download(url: string, headers: Record<string, string>) {
  for (let attempt = 0; ; attempt++) {
    try {
      // Give up on a hung upstream after a minute. (A signal also opts out of
      // Next's per-render fetch sharing, which the disk cache makes redundant.)
      const res = await fetch(url, {
        headers: { Accept: "application/json, text/csv, */*", ...headers },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return await res.text();
      if (res.status < 500 || attempt > 0) throw new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      if (attempt > 0 || /^\d{3} /.test((err as Error).message)) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function fetchJSON<T>(url: string, ttlSeconds: number, headers?: Record<string, string>): Promise<T> {
  return JSON.parse(await fetchText(url, ttlSeconds, headers)) as T;
}

// Returns null instead of throwing, so one failing source doesn't take down a page.
export async function attempt<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn((err as Error).message);
    return null;
  }
}

export const HOUR = 60 * 60;
export const DAY = 24 * HOUR;

// Promise.all with at most `limit` tasks in flight, to be polite to free APIs.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

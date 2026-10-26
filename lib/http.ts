import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Small disk cache in front of every upstream request. The free api.data.gov
// keys are rate limited, so a response is reused until its TTL runs out, and a
// stale copy is served if the upstream request fails.
const CACHE_DIR = path.join(process.cwd(), ".cache", "http");

export const API_KEY = process.env.DATA_GOV_API_KEY || "DEMO_KEY";

function cacheFile(url: string) {
  const key = url.replace(/api_key=[^&]+&?/, "");
  return path.join(CACHE_DIR, createHash("sha1").update(key).digest("hex"));
}

export async function fetchText(url: string, ttlSeconds: number): Promise<string> {
  const file = cacheFile(url);
  let stale: string | null = null;

  try {
    const [stat, body] = await Promise.all([fs.stat(file), fs.readFile(file, "utf8")]);
    if (Date.now() - stat.mtimeMs < ttlSeconds * 1000) return body;
    stale = body;
  } catch {
    // not cached yet
  }

  try {
    const res = await fetch(url, { headers: { Accept: "application/json, text/csv, */*" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const body = await res.text();
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, body);
    return body;
  } catch (err) {
    if (stale !== null) return stale;
    const shown = url.replace(/api_key=[^&]+/, "api_key=***");
    throw new Error(`Request failed: ${shown} (${(err as Error).message})`);
  }
}

export async function fetchJSON<T>(url: string, ttlSeconds: number): Promise<T> {
  return JSON.parse(await fetchText(url, ttlSeconds)) as T;
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

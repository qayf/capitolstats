import { revalidateTag } from "next/cache";
import { markRefreshed } from "@/lib/http";
import { LIVE_TAG } from "@/lib/live";

// Refreshes the live data (vote feeds, Court decisions, Top Stories) and
// rebuilds the home page. Called daily by the cron in vercel.json, which sends
// CRON_SECRET as a bearer token; open without a secret only in development.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? request.headers.get("authorization") === `Bearer ${secret}`
    : process.env.NODE_ENV !== "production";
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  await markRefreshed();
  revalidateTag(LIVE_TAG, { expire: 0 });

  // Load the home page once so the first visitor gets the fresh version.
  const home = await fetch(new URL("/", request.url), { cache: "no-store" }).catch(() => null);
  return Response.json({ refreshed: true, homeRebuilt: home?.ok ?? false });
}

import { connection } from "next/server";
import { getPresidency, PRESIDENCIES } from "@/lib/sources/presidents";

// Development only: computes the totals for every finished term from the live
// data. `npm run update:presidents` saves this to lib/data/presidency-stats.json.
export async function GET() {
  await connection();
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  const saved: Record<string, unknown> = {};
  for (const p of PRESIDENCIES.filter((x) => x.end)) {
    const d = await getPresidency(p.slug);
    if (!d) throw new Error(`No data for ${p.slug}`);
    const { end, days, laws, ceremonial, perYear, congresses, photo } = d;
    saved[p.slug] = { end, days, laws, ceremonial, perYear, congresses, photo };
  }
  return new Response(JSON.stringify(saved, null, 2) + "\n", { headers: { "Content-Type": "application/json" } });
}

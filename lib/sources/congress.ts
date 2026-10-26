import { cacheLife } from "next/cache";
import { API_KEY, DAY, fetchJSON, HOUR } from "../http";

// Congress.gov API v3: sponsored and cosponsored legislation per member.
const BASE = "https://api.congress.gov/v3";

function url(path: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams({ format: "json", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return `${BASE}${path}?${qs}&api_key=${API_KEY}`;
}

export interface Bill {
  congress: number;
  type: string;
  number: string;
  title: string;
  introduced: string;
  latestAction: { date: string; text: string } | null;
  policyArea: string | null;
}

export interface MemberDetail {
  sponsored: number;
  cosponsored: number;
  leadership: { type: string; congress: number }[];
}

interface RawBill {
  congress: number;
  type?: string;
  number?: string;
  title?: string;
  introducedDate?: string;
  latestAction?: { actionDate: string; text: string };
  policyArea?: { name: string | null };
}

export async function getMemberDetail(id: string): Promise<MemberDetail> {
  "use cache";
  cacheLife("hours");

  const data = await fetchJSON<{
    member: {
      sponsoredLegislation?: { count: number };
      cosponsoredLegislation?: { count: number };
      leadership?: { type: string; congress: number }[];
    };
  }>(url(`/member/${id}`), DAY);

  return {
    sponsored: data.member.sponsoredLegislation?.count ?? 0,
    cosponsored: data.member.cosponsoredLegislation?.count ?? 0,
    leadership: data.member.leadership ?? [],
  };
}

export async function getLegislation(id: string, kind: "sponsored" | "cosponsored"): Promise<Bill[]> {
  "use cache";
  cacheLife("hours");

  const key = kind === "sponsored" ? "sponsoredLegislation" : "cosponsoredLegislation";
  const data = await fetchJSON<Record<string, RawBill[]>>(url(`/member/${id}/${kind}-legislation`, { limit: 250 }), 6 * HOUR);

  // Amendments come back in the same list without a title or bill type; skip them.
  return (data[key] ?? [])
    .filter((b) => b.type && b.number && b.title)
    .map((b) => ({
      congress: b.congress,
      type: b.type!,
      number: b.number!,
      title: b.title!,
      introduced: b.introducedDate ?? "",
      latestAction: b.latestAction ? { date: b.latestAction.actionDate, text: b.latestAction.text } : null,
      policyArea: b.policyArea?.name ?? null,
    }));
}

export function billStatus(b: Bill): string {
  const t = b.latestAction?.text.toLowerCase() ?? "";
  if (t.includes("became public law") || t.includes("signed by president")) return "Law";
  if (t.includes("vetoed")) return "Vetoed";
  if (t.includes("presented to president")) return "To President";
  if (t.includes("passed senate") || t.includes("passed/agreed to in senate")) return "Passed Senate";
  if (t.includes("passed house") || t.includes("passed/agreed to in house") || t.includes("on passage passed")) return "Passed House";
  if (t.includes("agreed to")) return "Agreed To";
  if (t.includes("reported") || t.includes("ordered to be reported")) return "Reported";
  if (t.includes("referred to")) return "In Committee";
  return "Introduced";
}

export function policyAreas(bills: Bill[], limit = 8) {
  const counts = new Map<string, number>();
  for (const b of bills) if (b.policyArea) counts.set(b.policyArea, (counts.get(b.policyArea) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

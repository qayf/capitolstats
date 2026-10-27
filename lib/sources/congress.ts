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

export interface BillOverview {
  title: string;
  introduced: string | null;
  policyArea: string | null;
  sponsor: { id: string; name: string } | null;
  latestAction: { date: string; text: string } | null;
  summary: string | null; // plain text of the latest CRS summary
}

function stripHtml(html: string) {
  return html
    .replace(/<\/p>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export async function getBillOverview(congress: number, type: string, number: string): Promise<BillOverview> {
  "use cache";
  cacheLife("hours");

  const path = `/bill/${congress}/${type.toLowerCase()}/${number}`;
  const [{ bill }, summaries] = await Promise.all([
    fetchJSON<{
      bill: {
        title: string;
        introducedDate?: string;
        policyArea?: { name: string };
        sponsors?: { bioguideId: string; fullName: string }[];
        latestAction?: { actionDate: string; text: string };
      };
    }>(url(path), 6 * HOUR),
    fetchJSON<{ summaries?: { text: string; updateDate: string }[] }>(url(`${path}/summaries`), 6 * HOUR).catch(() => ({
      summaries: [],
    })),
  ]);

  const latest = [...(summaries.summaries ?? [])].sort((a, b) => b.updateDate.localeCompare(a.updateDate))[0];
  const sponsor = bill.sponsors?.[0];
  return {
    title: bill.title,
    introduced: bill.introducedDate ?? null,
    policyArea: bill.policyArea?.name ?? null,
    sponsor: sponsor ? { id: sponsor.bioguideId, name: sponsor.fullName } : null,
    latestAction: bill.latestAction ? { date: bill.latestAction.actionDate, text: bill.latestAction.text } : null,
    summary: latest ? stripHtml(latest.text) : null,
  };
}

// The opening paragraphs of a CRS summary, without the repeated short title.
export function summaryParagraphs(overview: BillOverview, maxChars = 900) {
  const paragraphs = (overview.summary ?? "")
    .split("\n")
    .map((p) => p.trim())
    .filter((p, i) => p && !(i === 0 && overview.title.toLowerCase().includes(p.toLowerCase())));
  const out: string[] = [];
  let length = 0;
  for (const p of paragraphs) {
    if (out.length && length + p.length > maxChars) break;
    out.push(p);
    length += p.length;
  }
  return out;
}

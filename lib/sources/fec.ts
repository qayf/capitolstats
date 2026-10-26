import { cacheLife } from "next/cache";
import { API_KEY, DAY, fetchJSON } from "../http";
import { getMember, getMembers } from "./legislators";

// OpenFEC: campaign committee receipts for the current two-year cycle.
const BASE = "https://api.open.fec.gov/v1";

export function currentCycle(now = new Date()) {
  const y = now.getUTCFullYear();
  return y % 2 === 0 ? y : y + 1;
}

function url(path: string, params: [string, string | number][]) {
  const qs = new URLSearchParams(params.map(([k, v]) => [k, String(v)]));
  return `${BASE}${path}?${qs}&api_key=${API_KEY}`;
}

export interface CycleTotal {
  candidateId: string;
  receipts: number;
  cash: number | null;
}

interface RawTotal {
  candidate_id: string;
  receipts: number | null;
  cash_on_hand_end_period: string | number | null;
}

// Receipts for every member in one pass: their FEC candidate IDs, 100 per request.
export async function getCycleTotals(): Promise<Record<string, CycleTotal>> {
  "use cache";
  cacheLife("hours");

  const members = await getMembers();
  const cycle = currentCycle();
  const owner = new Map<string, string>();
  for (const m of members) for (const id of m.fecIds) owner.set(id, m.id);

  const ids = [...owner.keys()];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));

  const pages = await Promise.all(
    chunks.map((chunk) =>
      fetchJSON<{ results: RawTotal[] }>(
        url("/candidates/totals/", [
          ["cycle", cycle],
          ["election_full", "false"],
          ["per_page", 100],
          ...chunk.map((id): [string, string] => ["candidate_id", id]),
        ]),
        DAY,
      ).catch(() => ({ results: [] as RawTotal[] })),
    ),
  );

  // A member can have more than one candidate ID; keep the one with the most money.
  const totals: Record<string, CycleTotal> = {};
  for (const r of pages.flatMap((p) => p.results)) {
    const memberId = owner.get(r.candidate_id);
    if (!memberId) continue;
    const receipts = r.receipts ?? 0;
    if (!totals[memberId] || receipts > totals[memberId].receipts) {
      totals[memberId] = {
        candidateId: r.candidate_id,
        receipts,
        cash: r.cash_on_hand_end_period == null ? null : Number(r.cash_on_hand_end_period),
      };
    }
  }
  return totals;
}

export interface Funding {
  cycle: number;
  candidateId: string;
  committee: { id: string; name: string } | null;
  coverageEnd: string | null;
  receipts: number;
  disbursements: number;
  cash: number | null;
  sources: { label: string; value: number }[];
  bySize: { label: string; value: number }[];
  byState: { state: string; value: number }[];
  employers: { employer: string; value: number; count: number }[];
}

interface RawCandidateTotals {
  receipts?: number;
  disbursements?: number;
  last_cash_on_hand_end_period?: number;
  coverage_end_date?: string;
  individual_itemized_contributions?: number;
  individual_unitemized_contributions?: number;
  other_political_committee_contributions?: number;
  political_party_committee_contributions?: number;
  candidate_contribution?: number;
  loans_made_by_candidate?: number;
  transfers_from_other_authorized_committee?: number;
  other_receipts?: number;
  loans?: number;
}

const SIZE_LABELS: Record<number, string> = {
  0: "Under $200",
  200: "$200 – $499",
  500: "$500 – $999",
  1000: "$1,000 – $1,999",
  2000: "$2,000 and up",
};

// Employer strings that aren't really employers (blanks, or an occupation typed into the employer field).
const NOT_EMPLOYERS =
  /^(N\/?A|NULL|NONE|NOT EMPLOYED|UNEMPLOYED|INFORMATION REQUESTED.*|REQUESTED|SELF|SELF[- ]EMPLOYED|RETIRED|HOMEMAKER|STUDENT|CEO|OWNER|PRESIDENT|BUSINESS OWNER|ATTORNEY|PHYSICIAN|INVESTOR|ENTREPRENEUR|CONSULTANT|)$/i;

export async function getFunding(memberId: string): Promise<Funding | null> {
  "use cache";
  cacheLife("hours");

  const member = await getMember(memberId);
  if (!member) return null;
  const cycle = currentCycle();
  const totals = await getCycleTotals();
  const candidateId = totals[member.id]?.candidateId ?? member.fecIds[member.fecIds.length - 1];
  if (!candidateId) return null;

  const base: [string, string | number][] = [
    ["cycle", cycle],
    ["election_full", "false"],
  ];

  const [summary, sizes, states, committees] = await Promise.all([
    fetchJSON<{ results: RawCandidateTotals[] }>(url(`/candidate/${candidateId}/totals/`, base), DAY),
    fetchJSON<{ results: { size: number; total: number }[] }>(
      url("/schedules/schedule_a/by_size/by_candidate/", [...base, ["candidate_id", candidateId]]),
      DAY,
    ).catch(() => ({ results: [] })),
    fetchJSON<{ results: { state: string; total: number }[] }>(
      url("/schedules/schedule_a/by_state/by_candidate/", [...base, ["candidate_id", candidateId], ["per_page", 100]]),
      DAY,
    ).catch(() => ({ results: [] })),
    fetchJSON<{ results: { committee_id: string; name: string }[] }>(
      url(`/candidate/${candidateId}/committees/`, [["designation", "P"], ["cycle", cycle]]),
      DAY,
    ).catch(() => ({ results: [] })),
  ]);

  const t = summary.results[0];
  if (!t) return null;

  const committee = committees.results[0] ? { id: committees.results[0].committee_id, name: committees.results[0].name } : null;
  const employers = committee
    ? await fetchJSON<{ results: { employer: string | null; total: number; count: number }[] }>(
        url("/schedules/schedule_a/by_employer/", [
          ["committee_id", committee.id],
          ["cycle", cycle],
          ["sort", "-total"],
          ["per_page", 40],
        ]),
        DAY,
      ).catch(() => ({ results: [] }))
    : { results: [] };

  const v = (n: number | undefined) => n ?? 0;
  const sources = [
    { label: "Individuals, under $200", value: v(t.individual_unitemized_contributions) },
    { label: "Individuals, $200+", value: v(t.individual_itemized_contributions) },
    { label: "PACs & other committees", value: v(t.other_political_committee_contributions) },
    { label: "Party committees", value: v(t.political_party_committee_contributions) },
    { label: "Candidate (self-funding)", value: v(t.candidate_contribution) + v(t.loans_made_by_candidate) },
    { label: "Transfers from other campaigns", value: v(t.transfers_from_other_authorized_committee) },
    { label: "Other receipts", value: v(t.other_receipts) },
  ];

  return {
    cycle,
    candidateId,
    committee,
    coverageEnd: t.coverage_end_date ?? null,
    receipts: v(t.receipts),
    disbursements: v(t.disbursements),
    cash: t.last_cash_on_hand_end_period ?? null,
    sources,
    bySize: sizes.results
      .filter((s) => SIZE_LABELS[s.size])
      .sort((a, b) => a.size - b.size)
      .map((s) => ({ label: SIZE_LABELS[s.size], value: s.total })),
    byState: states.results
      .filter((s) => s.state && s.total > 0)
      .map((s) => ({ state: s.state, value: s.total }))
      .sort((a, b) => b.value - a.value),
    employers: employers.results
      .filter((e) => e.employer && !NOT_EMPLOYERS.test(e.employer.trim()))
      .slice(0, 15)
      .map((e) => ({ employer: e.employer!, value: e.total, count: e.count })),
  };
}

export function fecCandidateUrl(id: string) {
  return `https://www.fec.gov/data/candidate/${id}/`;
}

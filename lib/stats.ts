import { cacheLife } from "next/cache";
import { attempt } from "./http";
import { getMembers, type Chamber, type Party } from "./sources/legislators";
import { seatLabel } from "./people";
import { currentCongress, getAllVotes, participation } from "./sources/votes";
import { currentCycle, getCycleTotals } from "./sources/fec";

// One row per member, combining the bulk sources. Used by the members table and
// the home page leaderboards.
export interface MemberRow {
  id: string;
  name: string;
  sortName: string;
  party: Party;
  state: string;
  seat: string;
  chamber: Chamber;
  since: string;
  years: number;
  eligible: number | null;
  missed: number | null;
  participation: number | null;
  raised: number | null;
  cash: number | null;
}

export async function getMemberRows(): Promise<{ rows: MemberRow[]; financeAvailable: boolean; votesAvailable: boolean }> {
  "use cache";
  cacheLife("hours");

  const [members, votes, totals] = await Promise.all([getMembers(), attempt(getAllVotes), attempt(getCycleTotals)]);
  const financeAvailable = !!totals && Object.keys(totals).length > 0;

  const rows = members.map((m): MemberRow => {
    const a = votes?.[m.chamber].attendance[m.id];
    const t = totals?.[m.id];
    return {
      id: m.id,
      name: m.name,
      sortName: m.sortName,
      party: m.party,
      state: m.state,
      seat: seatLabel(m),
      chamber: m.chamber,
      since: m.inChamberSince,
      years: m.yearsServed,
      eligible: a?.eligible ?? null,
      missed: a?.missed ?? null,
      participation: participation(a),
      raised: financeAvailable ? t?.receipts ?? 0 : null,
      cash: t?.cash ?? null,
    };
  });

  return { rows, financeAvailable, votesAvailable: !!votes };
}

// The current Congress and FEC cycle, cached so pages don't read the clock while rendering.
export async function getPeriod() {
  "use cache";
  cacheLife("days");
  return { congress: currentCongress(), cycle: currentCycle() };
}

export function cycleLabel(cycle: number) {
  return `${cycle - 1}–${String(cycle).slice(2)}`;
}

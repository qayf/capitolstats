import { cacheLife } from "next/cache";
import { attempt } from "./http";
import { getMember } from "./sources/legislators";
import { getChamberVotes, participation, type RollCall } from "./sources/votes";
import { getCycleTotals } from "./sources/fec";
import { getLegislation, getMemberDetail } from "./sources/congress";

// Everything the profile header needs, in one cached call per member.
export async function getProfileSummary(id: string) {
  "use cache";
  cacheLife("hours");

  const member = await getMember(id);
  if (!member) return null;

  const [votes, totals, detail] = await Promise.all([
    attempt(() => getChamberVotes(member.chamber)),
    attempt(getCycleTotals),
    attempt(() => getMemberDetail(member.id)),
  ]);

  const attendance = votes?.attendance[member.id];
  return {
    member,
    attendance: attendance ? { eligible: attendance.eligible, missed: attendance.missed, rate: participation(attendance) } : null,
    raised: totals && Object.keys(totals).length ? totals[member.id]?.receipts ?? 0 : null,
    detail,
  };
}

export interface MemberVote extends RollCall {
  missed: boolean;
}

// The member's recent roll calls, marked voted or missed. No positions.
export async function getMemberVotes(id: string, limit = 100) {
  "use cache";
  cacheLife("hours");

  const member = await getMember(id);
  if (!member) return null;
  const votes = await getChamberVotes(member.chamber);
  const a = votes.attendance[member.id];
  if (!a) return { congress: votes.congress, votes: [] as MemberVote[], attendance: null };

  const missed = new Set(a.missedRolls);
  const list = votes.rollcalls
    .filter((r) => r.roll >= a.firstRoll && r.roll <= a.lastRoll)
    .slice(0, limit)
    .map((r) => ({ ...r, missed: missed.has(r.roll) }));

  return {
    congress: votes.congress,
    votes: list,
    attendance: { eligible: a.eligible, missed: a.missed, rate: participation(a) },
  };
}

export async function getMemberBills(id: string) {
  "use cache";
  cacheLife("hours");

  const [sponsored, cosponsored] = await Promise.all([
    attempt(() => getLegislation(id, "sponsored")),
    attempt(() => getLegislation(id, "cosponsored")),
  ]);
  return { sponsored, cosponsored };
}

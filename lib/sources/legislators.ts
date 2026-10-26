import { cacheLife } from "next/cache";
import { DAY, fetchJSON } from "../http";

// Bio, terms, contact info and cross-reference IDs for every sitting member,
// from the unitedstates/congress-legislators project.
const BASE = "https://unitedstates.github.io/congress-legislators";

export type Party = "D" | "R" | "I";
export type Chamber = "senate" | "house";

export interface Term {
  chamber: Chamber;
  start: string;
  end: string;
  state: string;
  district: number | null;
  party: string;
}

export interface Committee {
  name: string;
  parent: string | null; // set for subcommittees
  title: string | null; // Chair, Ranking Member, ...
  rank: number | null;
}

export interface Member {
  id: string; // bioguide
  name: string;
  first: string;
  last: string;
  sortName: string;
  party: Party;
  state: string;
  district: number | null;
  chamber: Chamber;
  senateClass: number | null;
  inChamberSince: string;
  inCongressSince: string;
  termEnd: string;
  yearsServed: number;
  birthday: string | null;
  age: number | null;
  website: string | null;
  phone: string | null;
  office: string | null;
  contactForm: string | null;
  fecIds: string[];
  icpsr: number | null;
  ids: { govtrack: number | null; opensecrets: string | null; wikipedia: string | null; ballotpedia: string | null };
  terms: Term[];
  committees: Committee[];
}

interface RawTerm {
  type: "rep" | "sen";
  start: string;
  end: string;
  state: string;
  district?: number;
  class?: number;
  party: string;
  url?: string;
  phone?: string;
  address?: string;
  contact_form?: string;
}

interface RawLegislator {
  id: { bioguide: string; fec?: string[]; icpsr?: number; govtrack?: number; opensecrets?: string; wikipedia?: string; ballotpedia?: string };
  name: { first: string; last: string; nickname?: string; official_full?: string; suffix?: string };
  bio: { birthday?: string; gender?: string };
  terms: RawTerm[];
}

interface RawCommittee {
  thomas_id: string;
  name: string;
  type: string;
  subcommittees?: { thomas_id: string; name: string }[];
}

type RawMembership = Record<string, { bioguide: string; title?: string; rank?: number }[]>;

function partyCode(p: string): Party {
  if (p.startsWith("Democrat")) return "D";
  if (p.startsWith("Republican")) return "R";
  return "I";
}

function yearsBetween(a: string, b: number) {
  return (b - Date.parse(a)) / (365.25 * 86400000);
}

async function loadCommittees(): Promise<Map<string, Committee[]>> {
  const [committees, membership] = await Promise.all([
    fetchJSON<RawCommittee[]>(`${BASE}/committees-current.json`, DAY),
    fetchJSON<RawMembership>(`${BASE}/committee-membership-current.json`, DAY),
  ]);

  const names = new Map<string, { name: string; parent: string | null }>();
  for (const c of committees) {
    names.set(c.thomas_id, { name: c.name, parent: null });
    for (const sub of c.subcommittees ?? []) {
      names.set(c.thomas_id + sub.thomas_id, { name: sub.name, parent: c.name });
    }
  }

  const byMember = new Map<string, Committee[]>();
  for (const [code, seats] of Object.entries(membership)) {
    const info = names.get(code);
    if (!info) continue;
    for (const seat of seats) {
      const list = byMember.get(seat.bioguide) ?? [];
      list.push({ name: info.name, parent: info.parent, title: seat.title ?? null, rank: seat.rank ?? null });
      byMember.set(seat.bioguide, list);
    }
  }
  return byMember;
}

export async function getMembers(): Promise<Member[]> {
  "use cache";
  cacheLife("hours");

  const [raw, committees] = await Promise.all([
    fetchJSON<RawLegislator[]>(`${BASE}/legislators-current.json`, DAY),
    loadCommittees().catch(() => new Map<string, Committee[]>()),
  ]);
  const now = Date.now();

  return raw.map((r): Member => {
    const current = r.terms[r.terms.length - 1];
    const chamber: Chamber = current.type === "sen" ? "senate" : "house";

    // Walk back through consecutive terms in the same chamber.
    let inChamberSince = current.start;
    for (let i = r.terms.length - 2; i >= 0 && r.terms[i].type === current.type; i--) {
      inChamberSince = r.terms[i].start;
    }

    const served = r.terms.reduce((sum, t) => {
      const end = Math.min(Date.parse(t.end), now);
      return end > Date.parse(t.start) ? sum + (end - Date.parse(t.start)) : sum;
    }, 0);

    const first = r.name.nickname || r.name.first;
    const name = r.name.official_full || `${first} ${r.name.last}${r.name.suffix ? " " + r.name.suffix : ""}`;
    const fecPrefix = chamber === "senate" ? "S" : "H";

    return {
      id: r.id.bioguide,
      name,
      first,
      last: r.name.last,
      sortName: `${r.name.last}, ${first}`,
      party: partyCode(current.party),
      state: current.state,
      district: chamber === "house" ? current.district ?? null : null,
      chamber,
      senateClass: current.class ?? null,
      inChamberSince,
      inCongressSince: r.terms[0].start,
      termEnd: current.end,
      yearsServed: served / (365.25 * 86400000),
      birthday: r.bio.birthday ?? null,
      age: r.bio.birthday ? Math.floor(yearsBetween(r.bio.birthday, now)) : null,
      website: current.url ?? null,
      phone: current.phone ?? null,
      office: current.address ?? null,
      contactForm: current.contact_form ?? null,
      fecIds: (r.id.fec ?? []).filter((id) => id.startsWith(fecPrefix)),
      icpsr: r.id.icpsr ?? null,
      ids: {
        govtrack: r.id.govtrack ?? null,
        opensecrets: r.id.opensecrets ?? null,
        wikipedia: r.id.wikipedia ?? null,
        ballotpedia: r.id.ballotpedia ?? null,
      },
      terms: r.terms.map((t) => ({
        chamber: t.type === "sen" ? "senate" : "house",
        start: t.start,
        end: t.end,
        state: t.state,
        district: t.district ?? null,
        party: t.party,
      })),
      committees: (committees.get(r.id.bioguide) ?? []).sort(
        (a, b) => Number(a.parent !== null) - Number(b.parent !== null) || a.name.localeCompare(b.name),
      ),
    };
  });
}

export async function getMember(id: string): Promise<Member | null> {
  const members = await getMembers();
  return members.find((m) => m.id === id.toUpperCase()) ?? null;
}

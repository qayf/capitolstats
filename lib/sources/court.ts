import { cacheLife } from "next/cache";
import { DAY, fetchJSON, HOUR, mapLimit } from "../http";

// Supreme Court decisions and justice votes from the Oyez project
// (Chicago-Kent College of Law), https://www.oyez.org. Oyez content is
// licensed CC BY-NC 4.0, so pages that show its text credit it.
const BASE = "https://api.oyez.org";

export interface Justice {
  id: string; // Oyez identifier, e.g. "sonia_sotomayor"
  name: string;
  lastName: string;
  title: string; // "Chief Justice" | "Associate Justice"
  appointedBy: string;
  appointedByParty: "D" | "R" | null;
  joined: string; // ISO date
  photo: string | null;
  seniority: number;
}

export type CourtVote = "majority" | "minority" | "other";

export interface JusticeVote {
  justiceId: string;
  name: string;
  lastName: string;
  vote: CourtVote;
  opinion: string; // "majority", "concurrence", "dissent", "plurality", "none", ...
}

export interface Opinion {
  author: string | null;
  type: string; // "Majority opinion", "Dissenting opinion", ...
}

export interface CourtCase {
  term: number;
  docket: string;
  name: string;
  decided: string | null;
  argued: string | null;
  granted: string | null;
  question: string;
  holding: string;
  firstParty: string;
  secondParty: string;
  winningParty: string | null;
  decisionType: string | null;
  majority: number | null;
  minority: number | null;
  votes: JusticeVote[];
  opinions: Opinion[];
  lowerCourt: string | null;
  citation: string | null;
  justiaUrl: string | null;
  oyezUrl: string;
}

// The Court's term starts on the first Monday in October and is named for that year.
export function currentTerm(now = new Date()) {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 9 ? y : y - 1;
}

const PRESIDENT_PARTY: Record<string, "D" | "R"> = {
  "Ronald Reagan": "R",
  "George H. W. Bush": "R",
  "George H.W. Bush": "R",
  "Bill Clinton": "D",
  "William J. Clinton": "D",
  "George W. Bush": "R",
  "Barack Obama": "D",
  "Donald J. Trump": "R",
  "Donald Trump": "R",
  "Joseph R. Biden, Jr.": "D",
  "Joe Biden": "D",
};

// Oyez leaves a few appointing presidents blank.
const APPOINTED_BY_FALLBACK: Record<string, string> = {
  ketanji_brown_jackson: "Joseph R. Biden, Jr.",
};

function isoFromUnix(sec: number | undefined | null) {
  if (!sec) return null;
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function stripHtml(html: string | null | undefined) {
  return (html ?? "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

interface RawPerson {
  identifier: string;
  name: string;
  last_name: string;
  roles?: { type: string; date_start: number; appointing_president?: string; role_title?: string }[] | null;
  thumbnail?: { href: string } | null;
}

interface RawVote {
  member: RawPerson;
  vote: string | null;
  opinion_type: string | null;
  seniority?: number;
}

interface RawCase {
  name: string;
  docket_number: string;
  term: string;
  href: string;
  timeline?: ({ event: string; dates: number[] } | null)[] | null;
  question?: string | null;
  description?: string | null;
  conclusion?: string | null;
  first_party?: string | null;
  second_party?: string | null;
  decisions?: { votes?: RawVote[] | null; majority_vote?: number; minority_vote?: number; winning_party?: string | null; decision_type?: string | null; description?: string | null }[] | null;
  written_opinion?: { type?: { label: string } | null; judge_full_name?: string | null }[] | null;
  lower_court?: { name: string } | null;
  citation?: { volume?: string | null; page?: string | null } | null;
  justia_url?: string | null;
}

function event(c: RawCase, name: string) {
  const e = (c.timeline ?? []).find((t) => t?.event === name);
  return e ? isoFromUnix(Math.max(...e.dates)) : null;
}

function justiceFrom(p: RawPerson, seniority: number): Justice {
  const role = (p.roles ?? []).filter((r) => r.type === "scotus_justice").sort((a, b) => b.date_start - a.date_start)[0];
  const appointedBy = role?.appointing_president || APPOINTED_BY_FALLBACK[p.identifier] || "";
  return {
    id: p.identifier,
    name: p.name,
    lastName: p.last_name,
    title: role?.role_title?.startsWith("Chief") ? "Chief Justice" : "Associate Justice",
    appointedBy,
    appointedByParty: PRESIDENT_PARTY[appointedBy] ?? null,
    joined: isoFromUnix(role?.date_start) ?? "",
    photo: p.thumbnail?.href ?? null,
    seniority,
  };
}

function toCase(c: RawCase): CourtCase {
  const d = c.decisions?.[0];
  return {
    term: Number(c.term),
    docket: c.docket_number,
    name: c.name.trim(),
    decided: event(c, "Decided"),
    argued: event(c, "Argued"),
    granted: event(c, "Granted"),
    question: stripHtml(c.question),
    holding: stripHtml(d?.description || c.description || c.conclusion),
    firstParty: (c.first_party ?? "").trim(),
    secondParty: (c.second_party ?? "").trim(),
    winningParty: d?.winning_party?.trim() || null,
    decisionType: d?.decision_type ?? null,
    majority: d?.majority_vote ?? null,
    minority: d?.minority_vote ?? null,
    votes: (d?.votes ?? [])
      .filter((v) => v.member)
      .map((v) => ({
        justiceId: v.member.identifier,
        name: v.member.name,
        lastName: v.member.last_name,
        vote: v.vote === "majority" ? "majority" : v.vote === "minority" ? "minority" : "other",
        opinion: v.opinion_type ?? "none",
      })),
    opinions: (c.written_opinion ?? [])
      .filter((o) => o.type?.label && !/^(syllabus|oral argument)$/i.test(o.type.label))
      .map((o) => ({
        author: o.judge_full_name ?? null,
        type: o.type!.label === "Opinion of the Court" ? "Majority opinion" : o.type!.label,
      }))
      .sort((a, b) => Number(b.type === "Majority opinion") - Number(a.type === "Majority opinion")),
    lowerCourt: c.lower_court?.name ?? null,
    citation: c.citation?.volume ? `${c.citation.volume} U.S. ${c.citation.page ?? "___"}` : null,
    justiaUrl: c.justia_url ?? null,
    oyezUrl: `https://www.oyez.org/cases/${c.term}/${c.docket_number}`,
  };
}

export interface CourtData {
  term: number; // current term
  decisionsTerm: number; // most recent term with decisions
  justices: Justice[];
  decided: CourtCase[]; // newest first, current and previous term
  pending: CourtCase[]; // current term, argued or granted, not yet decided
  asOf: string; // date the data was assembled
}

export async function getCourt(): Promise<CourtData> {
  "use cache";
  cacheLife("hours");

  const term = currentTerm();
  const terms = [term, term - 1];
  const lists = await Promise.all(
    terms.map((t) => fetchJSON<RawCase[]>(`${BASE}/cases?per_page=0&filter=term:${t}`, 6 * HOUR).catch(() => [] as RawCase[])),
  );

  const all = lists.flat();
  const decidedRefs = all.filter((c) => (c.timeline ?? []).some((t) => t?.event === "Decided"));
  // Decided cases are final, so their detail pages can be cached for longer.
  const details = await mapLimit(decidedRefs, 6, (c) =>
    fetchJSON<RawCase>(`${BASE}/cases/${c.term}/${c.docket_number}`, DAY).catch(() => null),
  );

  const decided = details
    .filter((c): c is RawCase => !!c)
    .map(toCase)
    .filter((c) => c.decided)
    .sort((a, b) => b.decided!.localeCompare(a.decided!) || a.name.localeCompare(b.name));

  // The current bench: everyone who voted in the most recent decision with a recorded vote.
  const latestWithVotes = decided.find((c) => c.votes.length > 0);
  const latestRaw = details.find((c) => c && c.docket_number === latestWithVotes?.docket && Number(c.term) === latestWithVotes?.term);
  const justices = (latestRaw?.decisions?.[0]?.votes ?? [])
    .filter((v) => v.member)
    .map((v) => justiceFrom(v.member, v.seniority ?? 99))
    .sort((a, b) => a.seniority - b.seniority);

  const pending = all
    .filter((c) => Number(c.term) === term && !(c.timeline ?? []).some((t) => t?.event === "Decided"))
    .map(toCase)
    .sort((a, b) => (b.argued ?? "").localeCompare(a.argued ?? ""));

  return {
    term,
    decisionsTerm: decided[0]?.term ?? term - 1,
    justices,
    decided,
    pending,
    asOf: new Date().toISOString().slice(0, 10),
  };
}

export async function getCase(term: number, docket: string): Promise<CourtCase | null> {
  "use cache";
  cacheLife("hours");
  const court = await getCourt();
  const found = court.decided.find((c) => c.term === term && c.docket === docket) ?? court.pending.find((c) => c.term === term && c.docket === docket);
  if (found) return found;
  const raw = await fetchJSON<RawCase>(`${BASE}/cases/${term}/${docket}`, DAY).catch(() => null);
  return raw ? toCase(raw) : null;
}

export interface JusticeBio {
  born: string | null;
  birthplace: string | null;
  lawSchool: string | null;
}

export async function getJusticeBio(id: string): Promise<JusticeBio | null> {
  "use cache";
  cacheLife("days");
  const p = await fetchJSON<{ date_of_birth?: number; place_of_birth?: string | null; law_school?: string | null }>(
    `${BASE}/people/${id}`,
    7 * DAY,
  ).catch(() => null);
  if (!p) return null;
  return {
    born: p.date_of_birth ? new Date(p.date_of_birth * 1000).toISOString().slice(0, 10) : null,
    birthplace: p.place_of_birth ?? null,
    lawSchool: p.law_school ?? null,
  };
}

// ---------- derived stats ----------

export interface JusticeStats {
  cases: number;
  inMajority: number;
  majorityOpinions: number;
  dissents: number;
  concurrences: number;
  agreement: { id: string; name: string; rate: number }[];
}

export function justiceStats(justiceId: string, cases: CourtCase[]): JusticeStats {
  const mine = cases.filter((c) => c.votes.some((v) => v.justiceId === justiceId));
  const together = new Map<string, { name: string; same: number; total: number }>();
  let inMajority = 0;
  let majorityOpinions = 0;
  let dissents = 0;
  let concurrences = 0;

  for (const c of mine) {
    const me = c.votes.find((v) => v.justiceId === justiceId)!;
    if (me.vote === "majority") inMajority++;
    if (me.opinion === "majority" || me.opinion === "plurality") majorityOpinions++;
    if (me.opinion.includes("dissent")) dissents++;
    if (me.opinion.includes("concurrence")) concurrences++;
    for (const other of c.votes) {
      if (other.justiceId === justiceId || other.vote === "other" || me.vote === "other") continue;
      const t = together.get(other.justiceId) ?? { name: other.name, same: 0, total: 0 };
      t.total++;
      if (other.vote === me.vote) t.same++;
      together.set(other.justiceId, t);
    }
  }

  return {
    cases: mine.length,
    inMajority,
    majorityOpinions,
    dissents,
    concurrences,
    agreement: [...together.entries()]
      .map(([id, t]) => ({ id, name: t.name, rate: t.total ? t.same / t.total : 0 }))
      .sort((a, b) => b.rate - a.rate),
  };
}

export function split(c: Pick<CourtCase, "majority" | "minority">) {
  return c.majority != null ? `${c.majority}–${c.minority ?? 0}` : "—";
}

// Oyez sometimes publishes a ruling before entering how each justice voted.
export function hasVotes(c: Pick<CourtCase, "votes">) {
  return c.votes.length > 0;
}

export function casePath(c: Pick<CourtCase, "term" | "docket">) {
  return `/court/case/${c.term}/${c.docket}`;
}

export function majorityAuthor(c: CourtCase) {
  return c.votes.find((v) => v.opinion === "majority" || v.opinion === "plurality") ?? null;
}

export function shortCaseName(name: string) {
  return name.length > 34 ? name.slice(0, 32).trimEnd() + "…" : name;
}

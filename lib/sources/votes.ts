import { cacheLife } from "next/cache";
import { fetchText, HOUR } from "../http";
import { getMembers, type Chamber } from "./legislators";

// Roll-call votes for both chambers from Voteview (UCLA), which republishes the
// House Clerk and Senate records as bulk CSVs. Member profiles only use
// attendance; individual positions are returned per roll call by getRollCall.
const BASE = "https://voteview.com/static/data/out";

export interface RollCall {
  chamber: Chamber;
  roll: number; // Voteview's running number across the whole Congress
  clerkRoll: number; // official roll number within the session
  session: number;
  date: string;
  measure: string; // e.g. "HR1234", "PN1129", may be empty
  question: string;
  description: string;
  result: string;
  majority: string; // "1/2", "3/5", "2/3"
  yeas: number;
  nays: number;
}

export interface Attendance {
  eligible: number;
  missed: number;
  firstRoll: number;
  lastRoll: number;
  missedRolls: number[];
}

export interface ChamberVotes {
  chamber: Chamber;
  congress: number;
  rollcalls: RollCall[]; // newest first
  attendance: Record<string, Attendance>; // keyed by bioguide ID
}

export function currentCongress(now = new Date()) {
  // A new Congress starts on January 3 of each odd year.
  const year = now.getUTCFullYear();
  const startedThisYear = now.getUTCMonth() > 0 || now.getUTCDate() >= 3;
  const effective = year % 2 === 1 && !startedThisYear ? year - 1 : year;
  return Math.floor((effective - 1789) / 2) + 1;
}

// Minimal CSV parser that handles quoted fields with commas and doubled quotes.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

function decode(s: string) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  });
}

function toObjects(rows: string[][]) {
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// Voteview cast codes: 1 yea, 6 nay, 7/8 present count as voting;
// 2-5 (paired / announced) and 9 (not voting) count as missed; 0 = not in office.
const VOTED = new Set(["1", "6", "7", "8"]);
const MISSED = new Set(["2", "3", "4", "5", "9"]);

function filePrefix(chamber: Chamber, congress: number) {
  return `${chamber === "house" ? "H" : "S"}${congress}`;
}

function fileUrl(kind: "rollcalls" | "members" | "votes", prefix: string) {
  return `${BASE}/${kind}/${prefix}_${kind}.csv`;
}

export async function getChamberVotes(chamber: Chamber): Promise<ChamberVotes> {
  "use cache";
  cacheLife("hours");

  const congress = currentCongress();
  const prefix = filePrefix(chamber, congress);

  const [rollcallsCsv, membersCsv, votesCsv] = await Promise.all([
    fetchText(fileUrl("rollcalls", prefix), 6 * HOUR),
    fetchText(fileUrl("members", prefix), 6 * HOUR),
    fetchText(fileUrl("votes", prefix), 6 * HOUR),
  ]);

  const rollcalls: RollCall[] = toObjects(parseCSV(rollcallsCsv))
    .map((r) => ({
      chamber,
      roll: Number(r.rollnumber),
      clerkRoll: Number(r.clerk_rollnumber || r.rollnumber),
      session: Number(r.session),
      date: r.date,
      measure: r.bill_number ?? "",
      question: decode(r.vote_question ?? ""),
      description: decode(r.vote_desc || r.dtl_desc || ""),
      result: r.vote_result ?? "",
      majority: r.majority_requirement ?? "",
      yeas: Number(r.yea_count),
      nays: Number(r.nay_count),
    }))
    .sort((a, b) => b.roll - a.roll);

  const bioguideByIcpsr = new Map<string, string>();
  for (const m of toObjects(parseCSV(membersCsv))) {
    if (m.bioguide_id) bioguideByIcpsr.set(m.icpsr, m.bioguide_id);
  }

  // The votes file is large and has no quoted fields, so split it directly.
  const attendance: Record<string, Attendance> = {};
  const lines = votesCsv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;
    const id = bioguideByIcpsr.get(cols[3]);
    const code = cols[4].trim();
    if (!id || (!VOTED.has(code) && !MISSED.has(code))) continue;

    const roll = Number(cols[2]);
    const a = (attendance[id] ??= { eligible: 0, missed: 0, firstRoll: roll, lastRoll: roll, missedRolls: [] });
    a.eligible++;
    a.firstRoll = Math.min(a.firstRoll, roll);
    a.lastRoll = Math.max(a.lastRoll, roll);
    if (MISSED.has(code)) {
      a.missed++;
      a.missedRolls.push(roll);
    }
  }
  for (const a of Object.values(attendance)) a.missedRolls.sort((x, y) => x - y);

  return { chamber, congress, rollcalls, attendance };
}

export async function getAllVotes() {
  const [house, senate] = await Promise.all([getChamberVotes("house"), getChamberVotes("senate")]);
  return { house, senate };
}

export function participation(a: Attendance | undefined) {
  return a && a.eligible > 0 ? (a.eligible - a.missed) / a.eligible : null;
}

export function rollCallUrl(r: RollCall, congress: number) {
  const year = Number(r.date.slice(0, 4));
  if (r.chamber === "house") return `https://clerk.house.gov/Votes/${year}${r.clerkRoll}`;
  const roll = String(r.clerkRoll).padStart(5, "0");
  return `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${r.session}/vote_${congress}_${r.session}_${roll}.htm`;
}

// Our own page for a roll call, keyed by year and official roll number.
export function votePath(r: Pick<RollCall, "chamber" | "date" | "clerkRoll">) {
  return `/vote/${r.chamber}/${r.date.slice(0, 4)}/${r.clerkRoll}`;
}

export type Position = "yea" | "nay" | "present" | "notVoting";

export interface MemberPosition {
  id: string | null; // bioguide, when known
  name: string;
  sortName: string;
  party: "D" | "R" | "I";
  state: string;
  position: Position;
}

const POSITION: Record<string, Position> = {
  "1": "yea",
  "6": "nay",
  "7": "present",
  "8": "present",
  "2": "notVoting",
  "3": "notVoting",
  "4": "notVoting",
  "5": "notVoting",
  "9": "notVoting",
};

// "OCASIO-CORTEZ, Alexandria" / "TUBERVILLE, Thomas Hawley (Tommy)" -> display name
function displayName(bioname: string) {
  const [last, rest = ""] = bioname.split(", ");
  const nick = /\(([^)]+)\)/.exec(rest)?.[1];
  const first = nick ?? rest.split(" ")[0];
  const cased = last.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/^Mc([a-z])/, (_, c) => "Mc" + c.toUpperCase());
  return { name: `${first} ${cased}`.trim(), sortName: `${cased}, ${first}` };
}

export async function getRollCall(chamber: Chamber, year: number, clerkRoll: number) {
  "use cache";
  cacheLife("hours");

  const votes = await getChamberVotes(chamber);
  const rollcall = votes.rollcalls.find((r) => r.clerkRoll === clerkRoll && r.date.startsWith(String(year)));
  if (!rollcall) return null;

  const prefix = filePrefix(chamber, votes.congress);
  const [current, membersCsv, votesCsv] = await Promise.all([
    getMembers().catch(() => []),
    fetchText(fileUrl("members", prefix), 6 * HOUR),
    fetchText(fileUrl("votes", prefix), 6 * HOUR),
  ]);

  const people = new Map<string, Omit<MemberPosition, "position">>();
  for (const m of toObjects(parseCSV(membersCsv))) {
    if (m.chamber.toLowerCase() !== chamber) continue;
    const party = m.party_code === "100" ? "D" : m.party_code === "200" ? "R" : "I";
    // Prefer the name a sitting member goes by ("Ted Budd", not "Theodore Budd").
    const known = current.find((c) => c.id === m.bioguide_id);
    const names = known ? { name: known.name, sortName: known.sortName } : displayName(m.bioname);
    people.set(m.icpsr, { id: m.bioguide_id || null, ...names, party, state: m.state_abbrev });
  }

  const roll = String(rollcall.roll);
  const positions: MemberPosition[] = [];
  for (const line of votesCsv.split("\n")) {
    const cols = line.split(",");
    if (cols[2] !== roll) continue;
    const person = people.get(cols[3]);
    const position = POSITION[cols[4]?.trim()];
    if (person && position) positions.push({ ...person, position });
  }
  positions.sort((a, b) => a.sortName.localeCompare(b.sortName));

  return { congress: votes.congress, rollcall, positions };
}

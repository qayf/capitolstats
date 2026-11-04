import { DAY, fetchText, HOUR } from "../http";
import { getMembers, type Chamber } from "./legislators";
import { liveData } from "../live";

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

// Voteview writes the same number differently across files and Congresses
// ("14009" vs "14009.0", "200" vs "200.0"), so IDs and codes are normalized
// before they are compared.
function num(value: string | undefined) {
  return value === undefined || value.trim() === "" ? "" : String(Number(value));
}

// Voteview cast codes: 1 yea, 6 nay, 7/8 present count as voting;
// 2-5 (paired / announced) and 9 (not voting) count as missed; 0 = not in office.
const VOTED = new Set(["1", "6", "7", "8"]);
const MISSED = new Set(["2", "3", "4", "5", "9"]);

function filePrefix(chamber: Chamber, congress: number) {
  return `${chamber === "house" ? "H" : "S"}${String(congress).padStart(3, "0")}`;
}

function fileUrl(kind: "rollcalls" | "members" | "votes", prefix: string) {
  return `${BASE}/${kind}/${prefix}_${kind}.csv`;
}

// Older Voteview records (before about 1990) have no question, result or
// session fields; everything is in one upper-case description such as
// "TO PASS H.R. 4242. (PASSED)". These helpers recover what they can.
function sentenceCase(s: string) {
  if (!s || s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[.!?]\s+|\(\s*)([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(h\.\s?r|s|h\.\s?res|s\.\s?res|h\.\s?j\.\s?res|s\.\s?j\.\s?res|h\.\s?con\.\s?res|s\.\s?con\.\s?res)\.(?=\s?\d)/g, (m) => m.toUpperCase())
    .replace(/\b(u\.s\.|u\.s\.c\.|d\.c\.)/g, (m) => m.toUpperCase());
}

function legacyResult(desc: string) {
  const m = /\(([^()]*\b(PASSED|AGREED|ADOPTED|REJECTED|FAILED|CONFIRMED|SUSTAINED|OVERRIDDEN|TABLED|NOT)\b[^()]*)\)\s*\.?\s*$/i.exec(desc);
  return m ? sentenceCase(m[1].trim()) : "";
}

function legacyQuestion(desc: string) {
  // Split at a real sentence end, not at abbreviations like "H.R. 4242".
  const first = desc.replace(/\s*\([^()]*\)\s*\.?\s*$/, "").split(/\.\s+(?=[A-Z][a-z])/)[0].replace(/\.$/, "");
  return first.length > 110 ? first.slice(0, 107).trimEnd() + "…" : first;
}

function sessionFor(date: string, congress: number) {
  const startYear = 1789 + (congress - 1) * 2;
  return Number(date.slice(0, 4)) > startYear ? 2 : 1;
}

export async function getChamberVotes(chamber: Chamber, congress = currentCongress()): Promise<ChamberVotes> {
  "use cache";
  liveData();

  // Past Congresses are final, so their files can be cached much longer.
  const ttl = congress < currentCongress() ? 30 * DAY : HOUR;
  const prefix = filePrefix(chamber, congress);

  const [rollcallsCsv, membersCsv, votesCsv] = await Promise.all([
    fetchText(fileUrl("rollcalls", prefix), ttl),
    fetchText(fileUrl("members", prefix), ttl),
    fetchText(fileUrl("votes", prefix), ttl),
  ]);

  const rollcalls: RollCall[] = toObjects(parseCSV(rollcallsCsv))
    .map((r) => {
      const description = sentenceCase(decode(r.vote_desc || r.dtl_desc || ""));
      const question = decode(r.vote_question ?? "") || legacyQuestion(description);
      return {
        chamber,
        roll: Number(r.rollnumber),
        clerkRoll: Number(r.clerk_rollnumber || r.rollnumber),
        session: Number(r.session) || sessionFor(r.date, congress),
        date: r.date,
        measure: r.bill_number ?? "",
        question,
        description: description.startsWith(question.replace(/…$/, "")) && description.length < question.length + 20 ? "" : description,
        result: r.vote_result || legacyResult(r.dtl_desc ?? ""),
        majority: r.majority_requirement ?? "",
        yeas: Number(r.yea_count),
        nays: Number(r.nay_count),
      };
    })
    .sort((a, b) => b.roll - a.roll);

  const bioguideByIcpsr = new Map<string, string>();
  for (const m of toObjects(parseCSV(membersCsv))) {
    if (m.bioguide_id) bioguideByIcpsr.set(num(m.icpsr), m.bioguide_id);
  }

  // The votes file is large and has no quoted fields, so split it directly.
  const attendance: Record<string, Attendance> = {};
  const lines = votesCsv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;
    const id = bioguideByIcpsr.get(num(cols[3]));
    const code = num(cols[4]);
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
  // The official online records start in 1990 (House) and 1989 (Senate).
  if ((r.chamber === "house" && year < 1990) || (r.chamber === "senate" && congress < 101)) {
    return `https://voteview.com/rollcall/R${r.chamber === "house" ? "H" : "S"}${String(congress).padStart(3, "0")}${String(r.roll).padStart(4, "0")}`;
  }
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
  liveData();

  // A Congress runs from January 3 of an odd year, so a year maps to one Congress
  // (votes on January 1–2 of an odd year belong to the one before).
  const congress = Math.floor((year - 1789) / 2) + 1;
  if (congress < 1 || congress > currentCongress()) return null;
  const votes = await getChamberVotes(chamber, congress);
  const rollcall = votes.rollcalls.find((r) => r.clerkRoll === clerkRoll && r.date.startsWith(String(year)));
  if (!rollcall) return null;

  const ttl = congress < currentCongress() ? 30 * DAY : HOUR;
  const prefix = filePrefix(chamber, votes.congress);
  const [current, membersCsv, votesCsv] = await Promise.all([
    getMembers().catch(() => []),
    fetchText(fileUrl("members", prefix), ttl),
    fetchText(fileUrl("votes", prefix), ttl),
  ]);

  const people = new Map<string, Omit<MemberPosition, "position">>();
  for (const m of toObjects(parseCSV(membersCsv))) {
    if (m.chamber.toLowerCase() !== chamber) continue;
    const party = num(m.party_code) === "100" ? "D" : num(m.party_code) === "200" ? "R" : "I";
    // Prefer the name a sitting member goes by ("Ted Budd", not "Theodore Budd").
    const known = current.find((c) => c.id === m.bioguide_id);
    const names = known ? { name: known.name, sortName: known.sortName } : displayName(m.bioname);
    people.set(num(m.icpsr), { id: m.bioguide_id || null, ...names, party, state: m.state_abbrev });
  }

  const roll = String(rollcall.roll);
  const positions: MemberPosition[] = [];
  for (const line of votesCsv.split("\n")) {
    const cols = line.split(",");
    if (num(cols[2]) !== roll) continue;
    const person = people.get(num(cols[3]));
    const position = POSITION[num(cols[4])];
    if (person && position) positions.push({ ...person, position });
  }
  positions.sort((a, b) => a.sortName.localeCompare(b.sortName));

  return { congress: votes.congress, rollcall, positions };
}

// Every recorded vote on a bill or resolution, in both chambers, oldest first.
// `measure` uses Voteview's form, e.g. "HR3684".
export async function getMeasureVotes(congress: number, measure: string): Promise<RollCall[]> {
  "use cache";
  liveData();
  const code = measure.toUpperCase();
  const [house, senate] = await Promise.all([getChamberVotes("house", congress), getChamberVotes("senate", congress)]);
  return [...house.rollcalls, ...senate.rollcalls]
    .filter((r) => r.measure.toUpperCase() === code)
    .sort((a, b) => a.date.localeCompare(b.date) || a.roll - b.roll);
}

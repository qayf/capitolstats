import { cacheLife } from "next/cache";
import { attempt } from "./http";
import { getAllVotes, getRollCall, votePath, type MemberPosition, type RollCall } from "./sources/votes";
import { getBillOverview, type BillOverview } from "./sources/congress";
import type { Chamber } from "./sources/legislators";
import { date, parseMeasure } from "./format";

// Original news recaps written from roll-call data, in the spirit of automated
// sports game recaps. Recent floor votes are scored for newsworthiness, and the
// top ones get a headline, a one-line dek and a short article.

type Kind = "nomination" | "nominationCloture" | "passage" | "cloture" | "resolution" | "procedural" | "amendment";

const BILL_TYPES = /^(HR|S|HRES|SRES|HJRES|SJRES|HCONRES|SCONRES)(\d+)$/;
const BIG_TOPICS = /impeach|war powers|appropriations|defense authorization|budget|debt limit|supreme court|secretary of|tariff|border|health care|tax/i;

function classify(r: RollCall): Kind {
  const q = r.question.toLowerCase();
  const isNomination = r.measure.toUpperCase().startsWith("PN");
  if (q.includes("cloture")) return isNomination ? "nominationCloture" : "cloture";
  if (isNomination && q.includes("nomination")) return "nomination";
  if (/amendment/.test(q) && !/concur in|senate amendment/.test(q)) return "amendment";
  if (/recommit|previous question|table|journal|quorum|adjourn|motion to proceed|discharge|reconsider|point of order|waive/.test(q)) return "procedural";
  if (/^providing for consideration/i.test(r.description)) return "procedural";
  if (/passage|pass|conference report|concur in|veto|override/.test(q)) return "passage";
  if (/agreeing to the resolution|joint resolution|concurrent resolution/.test(q)) return "resolution";
  return "procedural";
}

const WEIGHT: Record<Kind, number> = {
  nomination: 9,
  passage: 9,
  resolution: 7,
  cloture: 6,
  nominationCloture: 3,
  amendment: 2,
  procedural: 1,
};

export function passed(r: RollCall) {
  return !/reject|fail|not agreed|not sustained|defeated/i.test(r.result);
}

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
}

function score(r: RollCall, newest: string) {
  const kind = classify(r);
  const total = r.yeas + r.nays;
  const margin = total ? Math.abs(r.yeas - r.nays) / total : 1;
  let s = WEIGHT[kind];
  s += 4 * (1 - margin); // close votes are bigger news
  if (margin > 0.9) s -= 2; // near-unanimous votes are rarely news
  if (BIG_TOPICS.test(`${r.description} ${r.question}`)) s += 3;
  s -= 0.3 * daysBetween(r.date, newest);
  return s;
}

// ---------- headline writing ----------

function chamberName(c: Chamber) {
  return c === "house" ? "House" : "Senate";
}

// "Keith Sonderling, of Florida, to be Secretary of Labor"
function parseNominee(description: string) {
  const m = /^(.+?), of [^,]+, to be (.+?)(?:, vice .*)?$/i.exec(description.trim());
  if (!m) return null;
  return { name: m[1].trim(), position: m[2].replace(/\.$/, "").trim() };
}

// Turn an official title into something that fits in a headline.
function shortTitle(r: RollCall, overview: BillOverview | null, congress: number) {
  const title = overview?.title || r.description;
  const warPowers = /war powers resolution.*hostilities (?:with|in|against) (?:the )?(.+?)(?:\.|,|$)/i.exec(title);
  if (warPowers) return { text: `${warPowers[1]} war powers resolution`, disapproval: false };
  const disapproval = /disapproval .* rule (?:submitted|issued) by the (.+?)(?: relating to|$)/i.exec(title);
  if (disapproval) return { text: `${disapproval[1].replace(/^Department of /, "")} rule`, disapproval: true };
  if (title && title.length <= 70 && !/^(a bill|a joint resolution|a resolution|an act|to amend)/i.test(title)) {
    return { text: title.replace(/\.$/, ""), disapproval: false };
  }
  return { text: parseMeasure(r.measure, congress).label, disapproval: false };
}

function headlineFor(r: RollCall, overview: BillOverview | null, congress: number) {
  const ch = chamberName(r.chamber);
  const ok = passed(r);
  const kind = classify(r);
  const q = r.question.toLowerCase();

  if (kind === "nomination" || kind === "nominationCloture") {
    const n = parseNominee(r.description);
    const who = n ? n.name : "nominee";
    if (kind === "nomination") {
      return n
        ? ok
          ? `Senate confirms ${n.name} as ${n.position}`
          : `Senate rejects ${n.name} for ${n.position}`
        : `Senate ${ok ? "confirms" : "rejects"} ${parseMeasure(r.measure, congress).label}`;
    }
    return ok ? `Senate clears way for final vote on ${who}` : `Senate blocks nomination of ${who}`;
  }

  const t = shortTitle(r, overview, congress);
  if (t.disapproval) {
    return ok ? `${ch} votes to overturn ${t.text}` : `${ch} effort to overturn ${t.text} fails`;
  }
  if (kind === "cloture") return ok ? `Senate advances ${t.text}` : `${t.text} stalls in Senate as cloture vote falls short`;
  if (q.includes("concur in")) return ok ? `${ch} signs off on final version of ${t.text}` : `${ch} rejects changes to ${t.text}`;
  if (q.includes("veto")) return ok ? `Congress overrides veto of ${t.text}` : `Veto of ${t.text} stands after override fails`;
  if (q.includes("suspend the rules") && !ok) return `${t.text} falls short of two-thirds in the ${ch}`;
  if (kind === "passage") return ok ? `${ch} passes ${t.text}` : `${ch} rejects ${t.text}`;
  if (kind === "resolution") return ok ? `${ch} adopts ${t.text}` : `${ch} rejects ${t.text}`;
  if (q.includes("table")) return ok ? `${ch} sets aside ${t.text}` : `${ch} refuses to set aside ${t.text}`;
  if (q.includes("discharge")) return ok ? `${ch} forces vote on ${t.text}` : `${ch} turns back effort to force vote on ${t.text}`;
  return `${ch} ${ok ? "approves" : "rejects"} ${r.question.replace(/^On /, "").toLowerCase()} on ${t.text}`;
}

// ---------- party breakdown ----------

export interface PartyCount {
  yea: number;
  nay: number;
  notVoting: number;
}

export interface Breakdown {
  D: PartyCount;
  R: PartyCount;
  I: PartyCount;
  crossovers: MemberPosition[];
  notVoting: MemberPosition[];
  shape: "party-line" | "mostly-party-line" | "bipartisan" | "split";
}

function breakdown(positions: MemberPosition[]): Breakdown {
  const empty = () => ({ yea: 0, nay: 0, notVoting: 0 });
  const b = { D: empty(), R: empty(), I: empty() };
  for (const p of positions) {
    if (p.position === "yea" || p.position === "nay") b[p.party][p.position]++;
    else b[p.party].notVoting++;
  }
  const side = (c: PartyCount) => (c.yea >= c.nay ? "yea" : "nay");
  const dSide = side(b.D);
  const rSide = side(b.R);

  // Independents are compared with Democrats, the caucus they sit with.
  const crossovers = positions.filter((p) => {
    if (p.position !== "yea" && p.position !== "nay") return false;
    return p.position !== (p.party === "R" ? rSide : dSide);
  });

  const voting = positions.filter((p) => p.position === "yea" || p.position === "nay").length;
  let shape: Breakdown["shape"];
  if (dSide === rSide) shape = "bipartisan";
  else if (crossovers.length === 0) shape = "party-line";
  else if (crossovers.length / Math.max(voting, 1) <= 0.06) shape = "mostly-party-line";
  else shape = "split";

  return { ...b, crossovers, notVoting: positions.filter((p) => p.position === "notVoting"), shape };
}

const SHAPE_TEXT: Record<Breakdown["shape"], string> = {
  "party-line": "along party lines",
  "mostly-party-line": "largely along party lines",
  bipartisan: "with support from both parties",
  split: "with both parties divided",
};

function dekFor(r: RollCall, b: Breakdown) {
  const tally = `${r.yeas}–${r.nays}`;
  let dek = `The vote was ${tally}, ${SHAPE_TEXT[b.shape]}`;
  if (b.shape === "mostly-party-line" && b.crossovers.length <= 6) {
    const groups = (["D", "R", "I"] as const)
      .map((p) => ({ p, n: b.crossovers.filter((c) => c.party === p).length }))
      .filter((g) => g.n > 0)
      .map((g) => `${g.n} ${g.p === "D" ? "Democrat" : g.p === "R" ? "Republican" : "independent"}${g.n === 1 ? "" : "s"}`);
    dek += `, with ${listNames(groups)} crossing over`;
  }
  if (b.shape === "bipartisan" && r.majority === "2/3" && passed(r)) dek += ", clearing the two-thirds bar";
  if (r.majority === "3/5" && !passed(r)) dek += `, short of the 60 votes needed`;
  return dek + ".";
}

// ---------- stories ----------

export interface StorySummary {
  slug: string;
  chamber: Chamber;
  date: string;
  headline: string;
  dek: string;
  measure: string;
  tally: string;
  passed: boolean;
  outcome: string;
}

export function outcome(r: RollCall) {
  const ok = passed(r);
  const kind = classify(r);
  if (kind === "nomination") return ok ? "Confirmed" : "Rejected";
  if (kind === "cloture" || kind === "nominationCloture") return ok ? "Advanced" : "Blocked";
  if (kind === "resolution") return ok ? "Adopted" : "Rejected";
  return ok ? "Passed" : "Failed";
}

export function storySlug(r: Pick<RollCall, "chamber" | "date" | "clerkRoll">) {
  return `${r.chamber}-${r.date.slice(0, 4)}-${r.clerkRoll}`;
}

function parseSlug(slug: string) {
  const m = /^(house|senate)-(\d{4})-(\d+)$/.exec(slug);
  return m ? { chamber: m[1] as Chamber, year: Number(m[2]), roll: Number(m[3]) } : null;
}

async function overviewFor(r: RollCall, congress: number) {
  const m = BILL_TYPES.exec(r.measure.toUpperCase());
  return m ? attempt(() => getBillOverview(congress, m[1], m[2])) : null;
}

export async function getTopStories(limit = 5): Promise<{ stories: StorySummary[]; latest: string } | null> {
  "use cache";
  cacheLife("hours");

  const { house, senate } = await getAllVotes();
  const all = [...house.rollcalls, ...senate.rollcalls];
  if (all.length === 0) return null;
  const newest = all.reduce((d, r) => (r.date > d ? r.date : d), "");
  const congress = house.congress;

  // One candidate per measure per chamber: its most newsworthy vote in the last month.
  const best = new Map<string, { r: RollCall; s: number }>();
  for (const r of all) {
    if (daysBetween(r.date, newest) > 30) continue;
    const key = `${r.chamber}:${r.measure || `roll${r.roll}`}`;
    const s = score(r, newest);
    const current = best.get(key);
    if (!current || s > current.s) best.set(key, { r, s });
  }
  // Keep both chambers in the mix: no more than limit - 2 stories from either one.
  const ranked = [...best.values()].sort((a, b) => b.s - a.s);
  const perChamber = { house: 0, senate: 0 };
  const picked: { r: RollCall; s: number }[] = [];
  for (const c of ranked) {
    if (picked.length === limit) break;
    if (perChamber[c.r.chamber] >= limit - 2) continue;
    perChamber[c.r.chamber]++;
    picked.push(c);
  }
  for (const c of ranked) {
    if (picked.length === limit) break;
    if (!picked.includes(c)) picked.push(c);
  }

  const stories = await Promise.all(
    picked.map(async ({ r }) => {
      const [detail, overview] = await Promise.all([
        getRollCall(r.chamber, Number(r.date.slice(0, 4)), r.clerkRoll),
        overviewFor(r, congress),
      ]);
      const b = breakdown(detail?.positions ?? []);
      return {
        slug: storySlug(r),
        chamber: r.chamber,
        date: r.date,
        headline: headlineFor(r, overview, congress),
        dek: dekFor(r, b),
        measure: parseMeasure(r.measure, congress).label,
        tally: `${r.yeas}–${r.nays}`,
        passed: passed(r),
        outcome: outcome(r),
      };
    }),
  );

  return { stories, latest: newest };
}

function honorific(r: RollCall, p: MemberPosition) {
  return `${r.chamber === "senate" ? "Sen." : "Rep."} ${p.name} (${p.party}-${p.state})`;
}

function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export async function getStory(slug: string) {
  "use cache";
  cacheLife("hours");

  const key = parseSlug(slug);
  if (!key) return null;
  const detail = await getRollCall(key.chamber, key.year, key.roll);
  if (!detail) return null;

  const { rollcall: r, positions, congress } = detail;
  const overview = await overviewFor(r, congress);
  const b = breakdown(positions);
  const ch = chamberName(r.chamber);
  const kind = classify(r);
  const ok = passed(r);
  const nominee = parseNominee(r.description);

  // Other votes on the same measure this Congress, in either chamber.
  const { house, senate } = await getAllVotes();
  const related = r.measure
    ? [...house.rollcalls, ...senate.rollcalls]
        .filter((x) => x.measure === r.measure && !(x.chamber === r.chamber && x.roll === r.roll))
        .sort((a, c) => c.date.localeCompare(a.date) || c.roll - a.roll)
        .slice(0, 8)
        .map((x) => ({ ...x, path: votePath(x) }))
    : [];

  // ---- body ----
  const paragraphs: string[] = [];
  const when = `on ${weekday(r.date)}, ${date(r.date)}`;
  const tally = `${r.yeas}–${r.nays}`;

  const measure = parseMeasure(r.measure, congress).label;
  const what = overview?.title && overview.title.length <= 120 ? `${overview.title.replace(/\.$/, "")} (${measure})` : measure || "the measure";
  const q = r.question.toLowerCase();
  if (kind === "nomination" && nominee) {
    paragraphs.push(`The Senate ${ok ? "confirmed" : "rejected"} ${nominee.name} to be ${nominee.position} ${when}, ${tally}.`);
  } else if (kind === "nominationCloture" && nominee) {
    paragraphs.push(
      ok
        ? `The Senate voted ${tally} ${when} to end debate on the nomination of ${nominee.name} to be ${nominee.position}, setting up a final confirmation vote.`
        : `A Senate vote to end debate on the nomination of ${nominee.name} to be ${nominee.position} failed ${when}, ${tally}.`,
    );
  } else if (kind === "cloture") {
    paragraphs.push(
      ok
        ? `The Senate voted ${tally} ${when} to advance ${what}.`
        : `A Senate vote to advance ${what} fell short ${when}, ${tally}.`,
    );
  } else if (kind === "passage" && !q.includes("concur in") && !q.includes("veto")) {
    paragraphs.push(`The ${ch} ${ok ? "passed" : "rejected"} ${what} ${when}, ${tally}.`);
  } else if (kind === "resolution") {
    paragraphs.push(`The ${ch} ${ok ? "adopted" : "rejected"} ${what} ${when}, ${tally}.`);
  } else {
    paragraphs.push(
      `The ${ch} voted ${tally} ${when} on ${r.question ? `"${r.question.replace(/^On /, "")}"` : "a motion"} for ${what}. The motion ${ok ? "was agreed to" : "failed"}.`,
    );
  }

  if (r.majority === "3/5") paragraphs.push(`The vote needed 60 votes to succeed under the Senate's cloture rule.`);
  if (r.majority === "2/3") paragraphs.push(`Because it came up under a two-thirds requirement, it needed a supermajority to succeed.`);

  const partyLine = (label: string, c: PartyCount) =>
    c.yea + c.nay > 0 ? `${label} voted ${c.yea}–${c.nay}` : null;
  const parts = [partyLine("Republicans", b.R), partyLine("Democrats", b.D), partyLine("independents", b.I)].filter(Boolean);
  const shapeSentence: Record<Breakdown["shape"], string> = {
    "party-line": "The vote fell entirely along party lines.",
    "mostly-party-line": "The vote fell largely along party lines.",
    bipartisan: "Majorities of both parties voted the same way.",
    split: "Both parties were divided.",
  };
  paragraphs.push(`${parts.join(", ")}. ${shapeSentence[b.shape]}`);

  if (b.crossovers.length > 0 && b.crossovers.length <= 12) {
    const names = b.crossovers.map((p) => `${honorific(r, p)} (${p.position === "yea" ? "yes" : "no"})`);
    paragraphs.push(`Breaking with the majority of their party: ${listNames(names)}.`);
  } else if (b.crossovers.length > 12) {
    paragraphs.push(`${b.crossovers.length} members broke with the majority of their party.`);
  }

  if (b.notVoting.length > 0) {
    const n = b.notVoting.length;
    paragraphs.push(
      n <= 6
        ? `${listNames(b.notVoting.map((p) => honorific(r, p)))} did not vote.`
        : `${n} members did not vote: ${listNames(
            (["R", "D", "I"] as const)
              .map((p) => ({ p, k: b.notVoting.filter((x) => x.party === p).length }))
              .filter((g) => g.k > 0)
              .map((g) => `${g.k} ${g.p === "R" ? "Republican" : g.p === "D" ? "Democrat" : "independent"}${g.k === 1 ? "" : "s"}`),
          )}.`,
    );
  }

  const otherChamber = related.find((x) => x.chamber !== r.chamber && classify(x) === "passage" && passed(x));
  if (otherChamber) {
    paragraphs.push(
      `The ${chamberName(otherChamber.chamber)} passed the measure ${otherChamber.yeas}–${otherChamber.nays} on ${date(otherChamber.date)}.`,
    );
  }

  return {
    slug,
    congress,
    rollcall: r,
    positions,
    headline: headlineFor(r, overview, congress),
    dek: dekFor(r, b),
    paragraphs,
    overview,
    nominee,
    breakdown: b,
    related,
  };
}

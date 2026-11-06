import { API_KEY, attempt, fetchJSON, HOUR, mapLimit } from "../http";
import { liveData } from "../live";
import { classify, passed } from "../news";
import { furthest, isCommitteeText, originOf, stageFromText, type Stage } from "../billStage";
import { getBillActions } from "./congress";
import { getLawsForCongress } from "./presidents";
import { currentCongress, getAllVotes } from "./votes";

// Every bill in the current Congress that can become law, with its stage.

const TYPES = ["hr", "s", "hjres", "sjres"];
const PAGE = 250;

export interface PipelineBill {
  congress: number;
  type: string;
  number: string;
  title: string;
  stage: Stage;
  introduced: string | null;
  action: { date: string; text: string };
  updated: string;
}

interface RawBill {
  type: string;
  number: string;
  title: string;
  introducedDate?: string;
  updateDate: string;
  latestAction?: { actionDate: string; text: string };
}

async function getBillList() {
  "use cache";
  liveData();

  const congress = currentCongress();
  const url = (type: string, offset: number) =>
    `https://api.congress.gov/v3/bill/${congress}/${type}?format=json&limit=${PAGE}&offset=${offset}&api_key=${API_KEY}`;

  const firsts = await mapLimit(TYPES, 4, (type) => fetchJSON<{ bills: RawBill[]; pagination: { count: number } }>(url(type, 0), HOUR));
  const rest: [string, number][] = [];
  TYPES.forEach((type, i) => {
    for (let o = PAGE; o < firsts[i].pagination.count; o += PAGE) rest.push([type, o]);
  });
  const pages = await mapLimit(rest, 6, ([type, o]) => fetchJSON<{ bills: RawBill[] }>(url(type, o), HOUR));

  const bills = [...firsts, ...pages]
    .flatMap((p) => p.bills)
    .filter((b) => b.latestAction)
    .map((b) => ({
      type: b.type,
      number: b.number,
      title: b.title,
      introduced: b.introducedDate ?? null,
      action: { date: b.latestAction!.actionDate, text: b.latestAction!.text },
      updated: b.updateDate,
    }));

  return { congress, bills, fetchedAt: new Date().toISOString() };
}

// Not cached itself: the list, laws and votes are each cached, and other parts
// of the page load the votes at the same time. Next rejects a cached function
// that waits on a cached call still running for a different scope.
export async function getPipeline() {
  const { congress, bills, fetchedAt } = await getBillList();
  const [laws, votes] = await Promise.all([attempt(() => getLawsForCongress(congress)), attempt(getAllVotes)]);

  const enacted = new Set((laws ?? []).map((l) => `${l.type}${l.number}`.toUpperCase()));

  // Chambers that passed each measure on a recorded vote.
  const passedBy = new Map<string, Set<string>>();
  for (const r of votes ? [...votes.house.rollcalls, ...votes.senate.rollcalls] : []) {
    if (!r.measure || !passed(r)) continue;
    const kind = classify(r);
    if (kind !== "passage" && kind !== "resolution") continue;
    const key = r.measure.toUpperCase();
    if (!passedBy.has(key)) passedBy.set(key, new Set());
    passedBy.get(key)!.add(r.chamber);
  }

  const result: PipelineBill[] = bills.map((b) => {
    const key = `${b.type}${b.number}`.toUpperCase();
    let stage = stageFromText(b.action.text, b.type);
    const chambers = passedBy.get(key);
    if (chambers) {
      const started = originOf(b.type).toLowerCase();
      stage = furthest(stage, chambers.has(started) && chambers.size === 2 ? "bothChambers" : "firstChamber");
    }
    if (enacted.has(key)) stage = "law";
    return { congress, ...b, stage };
  });

  // A few dozen bills look like they're in committee only because their latest
  // action is a generic floor note, as with vetoed bills after a failed override.
  // Their full histories settle it.
  const unclear = result.filter((b) => b.stage === "committee" && !isCommitteeText(b.action.text));
  await mapLimit(unclear, 6, async (b) => {
    const actions = await attempt(() => getBillActions(congress, b.type, b.number));
    b.stage = (actions ?? []).reduce<Stage>((stage, a) => furthest(stage, stageFromText(a.text, b.type)), b.stage);
  });

  return {
    congress,
    bills: result,
    updatedAt: fetchedAt,
    // The votes and law list sharpen the stages but aren't required for them.
    complete: !!laws && !!votes,
  };
}

// "hr 7008", "H.R. 7008" and words from a title all work.
export function searchBills(bills: PipelineBill[], query: string, limit = 25) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const code = q.replace(/[.\s]/g, "");
  const words = q.split(/\s+/);
  const numbered = bills.filter((b) => `${b.type}${b.number}`.toLowerCase() === code);
  const titled = bills
    .filter((b) => {
      const title = b.title.toLowerCase();
      return words.every((w) => title.includes(w));
    })
    .sort((a, b) => b.action.date.localeCompare(a.action.date));
  return [...numbered, ...titled.filter((b) => !numbered.includes(b))].slice(0, limit);
}

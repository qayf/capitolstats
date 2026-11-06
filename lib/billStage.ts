// Where a bill stands on the way to becoming law. Congress.gov has no stage
// field, so stages are read from action text, which uses fairly fixed wording.
// Safe to import from client components.

export type Stage = "committee" | "reported" | "firstChamber" | "bothChambers" | "president" | "vetoed" | "law";

// In order of progress, so the furthest evidence for a bill wins.
export const STAGES: Stage[] = ["committee", "reported", "firstChamber", "bothChambers", "president", "vetoed", "law"];

export const STAGE_LABELS: Record<Stage, string> = {
  committee: "In Committee",
  reported: "Out of Committee",
  firstChamber: "Passed First Chamber",
  bothChambers: "Passed Both Chambers",
  president: "To the President",
  vetoed: "Vetoed",
  law: "Became Law",
};

export function furthest(a: Stage, b: Stage): Stage {
  return STAGES.indexOf(a) >= STAGES.indexOf(b) ? a : b;
}

export function originOf(type: string): "House" | "Senate" {
  return type.toUpperCase().startsWith("H") ? "House" : "Senate";
}

// Only bills and joint resolutions go to the President.
export function canBecomeLaw(type: string) {
  return ["HR", "S", "HJRES", "SJRES"].includes(type.toUpperCase());
}

const PASSED_HOUSE = /passed house|passed\/agreed to in house|on passage passed|motion to suspend the rules and pass.*agreed to/;
const PASSED_SENATE = /passed senate|passed\/agreed to in senate/;

export function stageFromText(text: string, type: string): Stage {
  const t = text.toLowerCase();
  const fromHouse = originOf(type) === "House";

  if (/became public law|became private law|signed by president/.test(t)) return "law";
  if (/\bvetoed\b|\bveto\b|objections of the president/.test(t)) return "vetoed";
  if (/presented to president/.test(t)) return "president";
  if (/resolving differences|conference|enrolled|measure signed in|cleared for white house/.test(t)) return "bothChambers";

  // "Rule H. Res. 123 passed House" is the rule for debating a bill, not the bill.
  if (/^rule h\.? ?res/.test(t)) return "committee";

  // Passage in the chamber a bill started in is the first step; passage in the
  // other chamber means both have now acted on it.
  const house = PASSED_HOUSE.test(t) || /message on house action (sent|received)|message from the house|house message/.test(t);
  const senate = PASSED_SENATE.test(t) || /message on senate action (sent|received)|message from the senate|senate message/.test(t);
  if (house || senate) return house === fromHouse ? "firstChamber" : "bothChambers";

  // Activity in the other chamber means the first chamber already passed it.
  const onSenateFloor = /cloture|motion to proceed/.test(t);
  const inSenate = onSenateFloor || /received in the senate|read twice and referred|placed on senate|reported by senator|held at the desk/.test(t);
  const inHouse = /received in the house|house committee|union calendar|house calendar|held at the desk/.test(t);
  if (fromHouse ? inSenate : inHouse) return "firstChamber";

  // This follows a floor vote in the chamber that took it.
  if (/motion to reconsider laid on the table/.test(t)) return "firstChamber";

  if (onSenateFloor || /placed on .*calendar|ordered to be reported|reported by|reported \(|discharged/.test(t)) return "reported";
  return "committee";
}

// Text that really is committee-stage activity. A bill marked "committee" whose
// latest action is anything else, such as a generic floor note, needs its full
// history checked; the latest action alone says little about it.
export function isCommitteeText(text: string) {
  return /referred|committee|subcommittee|hearing|mark-?up|sponsor introductory|introduced/i.test(text);
}

export interface ProgressStep {
  label: string;
  state: "done" | "current" | "todo" | "stopped";
}

// The six steps shown on progress bars, with the chamber a bill started in first.
export function progressSteps(stage: Stage, type: string): ProgressStep[] {
  const [first, second] = originOf(type) === "House" ? ["House", "Senate"] : ["Senate", "House"];
  const labels = ["Introduced", "Committee", first, second, "President", "Law"];
  const done = { committee: 1, reported: 2, firstChamber: 3, bothChambers: 4, president: 4, vetoed: 4, law: 6 }[stage];
  return labels.map((label, i) => ({
    label: stage === "vetoed" && i === 4 ? "Vetoed" : label,
    state: i < done ? "done" : i !== done ? "todo" : stage === "vetoed" ? "stopped" : "current",
  }));
}

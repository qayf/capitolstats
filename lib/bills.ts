import { cacheLife } from "next/cache";
import { attempt } from "./http";
import { classify, passed } from "./news";
import { getBillOverview } from "./sources/congress";
import { getLawsForCongress, PRESIDENCIES } from "./sources/presidents";
import { getMeasureVotes, getRollCall, type RollCall } from "./sources/votes";
import type { Chamber } from "./sources/legislators";

// Everything for a bill's page: its details and summary, the enactment record
// if it became law, and the recorded floor votes, with the deciding vote in
// each chamber.

// The vote that sent the bill on in each chamber: the last successful passage
// (or conference report / concurrence) vote, else the last vote of any kind.
function decidingVote(votes: RollCall[], chamber: Chamber) {
  const mine = votes.filter((v) => v.chamber === chamber);
  const passage = mine.filter((v) => (classify(v) === "passage" || classify(v) === "resolution") && passed(v));
  const vote = passage[passage.length - 1] ?? mine[mine.length - 1] ?? null;
  return { vote, isPassage: passage.length > 0 };
}

export async function getBill(congress: number, type: string, number: string) {
  "use cache";
  cacheLife("hours");

  const code = type.toUpperCase();
  const [laws, overview, votes] = await Promise.all([
    congress >= 91 ? attempt(() => getLawsForCongress(congress)) : null,
    attempt(() => getBillOverview(congress, code, number)),
    attempt(() => getMeasureVotes(congress, `${code}${number}`)),
  ]);
  const law = laws?.find((l) => l.type === code && l.number === number) ?? null;
  if (!overview && !law) return null;

  const deciding = await Promise.all(
    (["house", "senate"] as Chamber[]).map(async (chamber) => {
      const { vote: v, isPassage } = votes ? decidingVote(votes, chamber) : { vote: null, isPassage: false };
      const detail = v ? await attempt(() => getRollCall(chamber, Number(v.date.slice(0, 4)), v.clerkRoll)) : null;
      return { chamber, vote: v, isPassage, positions: detail?.positions ?? [] };
    }),
  );

  // Where a bill that didn't become law got to, judged by its recorded votes.
  const passedHouse = deciding.some((d) => d.chamber === "house" && d.isPassage);
  const passedSenate = deciding.some((d) => d.chamber === "senate" && d.isPassage);
  const stage = passedHouse && passedSenate ? "Passed both chambers" : passedHouse ? "Passed House" : passedSenate ? "Passed Senate" : null;

  const president = law ? PRESIDENCIES.find((p) => law.date > p.start && law.date <= (p.end ?? "9999-12-31")) ?? null : null;

  return { congress, type: code, number, law, stage, overview, votes: votes ?? [], votesAvailable: votes !== null, deciding, president };
}

import { cacheLife } from "next/cache";
import { attempt } from "./http";
import { classify, passed } from "./news";
import { getBillOverview } from "./sources/congress";
import { getLawsForCongress, PRESIDENCIES } from "./sources/presidents";
import { getMeasureVotes, getRollCall, type RollCall } from "./sources/votes";
import type { Chamber } from "./sources/legislators";

// Everything for a law's page: the enactment record, the bill's details and
// summary, and the recorded floor votes, with the deciding vote in each chamber.

// The vote that sent the bill on in each chamber: the last successful passage
// (or conference report / concurrence) vote, else the last vote of any kind.
function decidingVote(votes: RollCall[], chamber: Chamber) {
  const mine = votes.filter((v) => v.chamber === chamber);
  const passage = mine.filter((v) => (classify(v) === "passage" || classify(v) === "resolution") && passed(v));
  return passage[passage.length - 1] ?? mine[mine.length - 1] ?? null;
}

export async function getLaw(congress: number, type: string, number: string) {
  "use cache";
  cacheLife("hours");

  const laws = await getLawsForCongress(congress);
  const law = laws.find((l) => l.type.toLowerCase() === type.toLowerCase() && l.number === number);
  if (!law) return null;

  const [overview, votes] = await Promise.all([
    attempt(() => getBillOverview(congress, law.type, law.number)),
    attempt(() => getMeasureVotes(congress, `${law.type}${law.number}`)),
  ]);

  const deciding = await Promise.all(
    (["house", "senate"] as Chamber[]).map(async (chamber) => {
      const v = votes ? decidingVote(votes, chamber) : null;
      const detail = v ? await attempt(() => getRollCall(chamber, Number(v.date.slice(0, 4)), v.clerkRoll)) : null;
      return { chamber, vote: v, positions: detail?.positions ?? [] };
    }),
  );

  const president = PRESIDENCIES.find((p) => law.date > p.start && law.date <= (p.end ?? "9999-12-31")) ?? null;

  return { law, overview, votes: votes ?? [], votesAvailable: votes !== null, deciding, president };
}

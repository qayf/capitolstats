import { cacheLife } from "next/cache";
import Link from "next/link";
import { getAllVotes, votePath, type RollCall } from "@/lib/sources/votes";
import { casePath, getCourt, majorityAuthor, split, type CourtCase } from "@/lib/sources/court";
import { attempt } from "@/lib/http";
import { date, parseMeasure } from "@/lib/format";

type Item = { kind: "congress"; r: RollCall; congress: number } | { kind: "court"; c: CourtCase };

// ESPN-style strip of the latest floor votes and Supreme Court decisions,
// shown under the top bar. The Court decides cases on its own calendar, so its
// decisions are slotted in after every two congressional votes instead of
// strictly by date; otherwise they would scroll out of view.
export async function Scoreboard() {
  "use cache";
  cacheLife("hours");

  const [votes, court] = await Promise.all([attempt(getAllVotes), attempt(getCourt)]);

  const congress: Item[] = votes
    ? [
        ...votes.house.rollcalls.slice(0, 12).map((r) => ({ kind: "congress" as const, r, congress: votes.house.congress })),
        ...votes.senate.rollcalls.slice(0, 12).map((r) => ({ kind: "congress" as const, r, congress: votes.senate.congress })),
      ]
        .sort((a, b) => b.r.date.localeCompare(a.r.date) || b.r.roll - a.r.roll)
        .slice(0, 12)
    : [];
  const decisions: Item[] = (court?.decided ?? []).filter((c) => c.votes.length > 0).slice(0, 6).map((c) => ({ kind: "court" as const, c }));
  if (congress.length === 0 && decisions.length === 0) return null;

  const items: Item[] = [];
  while (congress.length || decisions.length) {
    items.push(...congress.splice(0, 2));
    if (decisions.length) items.push(decisions.shift()!);
  }

  return (
    <div className="scoreboard">
      <div className="scoreboard-inner">
        <div className="score-label">Latest Votes</div>
        {items.map((item) => {
          if (item.kind === "court") {
            const c = item.c;
            const author = majorityAuthor(c);
            return (
              <Link key={`court-${c.term}-${c.docket}`} className="score court" href={casePath(c)}>
                <div className="score-top">
                  <span>Supreme Court</span>
                  <span>{date(c.decided, false)}</span>
                </div>
                <div className="score-measure">{c.name}</div>
                <div className="score-bottom">
                  <span className="score-result">
                    {c.minority === 0 ? "Unanimous" : author ? `Op. ${author.lastName}` : c.decisionType ?? ""}
                  </span>
                  <span className="score-tally">{split(c)}</span>
                </div>
              </Link>
            );
          }
          const { r, congress: n } = item;
          const m = parseMeasure(r.measure, n);
          return (
            <Link key={`${r.chamber}-${r.roll}`} className="score" href={votePath(r)}>
              <div className="score-top">
                <span>
                  {r.chamber === "house" ? "House" : "Senate"} · {r.clerkRoll}
                </span>
                <span>{date(r.date, false)}</span>
              </div>
              <div className="score-measure">{r.measure ? m.label : r.question || "Procedural"}</div>
              <div className="score-bottom">
                <span className="score-result">{r.result}</span>
                <span className="score-tally">
                  {r.yeas}–{r.nays}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

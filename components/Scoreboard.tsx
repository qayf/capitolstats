import { cacheLife } from "next/cache";
import Link from "next/link";
import { getAllVotes, votePath, type RollCall } from "@/lib/sources/votes";
import { date, parseMeasure } from "@/lib/format";

// ESPN-style strip of the latest floor votes, shown under the top bar.
export async function Scoreboard() {
  "use cache";
  cacheLife("hours");

  let latest: { r: RollCall; congress: number }[] = [];
  try {
    const { house, senate } = await getAllVotes();
    latest = [
      ...house.rollcalls.slice(0, 12).map((r) => ({ r, congress: house.congress })),
      ...senate.rollcalls.slice(0, 12).map((r) => ({ r, congress: senate.congress })),
    ]
      .sort((a, b) => b.r.date.localeCompare(a.r.date) || b.r.roll - a.r.roll)
      .slice(0, 16);
  } catch {
    return null;
  }

  return (
    <div className="scoreboard">
      <div className="scoreboard-inner">
        <div className="score-label">Latest Votes</div>
        {latest.map(({ r, congress }) => {
          const m = parseMeasure(r.measure, congress);
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

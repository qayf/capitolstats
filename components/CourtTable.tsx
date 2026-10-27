import Link from "next/link";
import { casePath, majorityAuthor, split, type CourtCase } from "@/lib/sources/court";
import { date } from "@/lib/format";

// Recent decisions; with `justiceId`, adds how that justice voted.
export function DecisionsTable({ cases, justiceId }: { cases: CourtCase[]; justiceId?: string }) {
  if (cases.length === 0) return <p className="empty">No decisions yet this term.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Decided</th>
            <th>Case</th>
            <th className="r">Split</th>
            {justiceId ? (
              <>
                <th>Vote</th>
                <th>Wrote</th>
              </>
            ) : (
              <th>Majority Opinion</th>
            )}
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const me = justiceId ? c.votes.find((v) => v.justiceId === justiceId) : null;
            const author = majorityAuthor(c);
            return (
              <tr key={`${c.term}-${c.docket}`}>
                <td className="nw">{date(c.decided)}</td>
                <td className="clip">
                  <Link className="link" href={casePath(c)}>
                    {c.name}
                  </Link>
                  {c.holding && <span className="sub">{c.holding}</span>}
                </td>
                <td className="r">{c.votes.length ? split(c) : <span className="dim">Pending</span>}</td>
                {justiceId ? (
                  <>
                    <td>
                      {me?.vote === "majority" ? (
                        <span className="pill">Majority</span>
                      ) : me?.vote === "minority" ? (
                        <span className="pill missed">Dissent</span>
                      ) : (
                        <span className="pill">—</span>
                      )}
                    </td>
                    <td className="nw dim">{me && me.opinion !== "none" ? me.opinion.replace(/^./, (x) => x.toUpperCase()) : "—"}</td>
                  </>
                ) : (
                  <td className="nw">{author ? author.lastName : c.decisionType === "per curiam" ? "Per curiam" : "—"}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

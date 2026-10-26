import Link from "next/link";
import { votePath, type ChamberVotes } from "@/lib/sources/votes";
import { date, parseMeasure } from "@/lib/format";

export function RollCallTable({ data, limit }: { data: ChamberVotes; limit: number }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th className="r">Roll</th>
            <th>Measure</th>
            <th>Question</th>
            <th>Result</th>
            <th className="r">Yea–Nay</th>
          </tr>
        </thead>
        <tbody>
          {data.rollcalls.slice(0, limit).map((r) => {
            const m = parseMeasure(r.measure, data.congress);
            return (
              <tr key={r.roll}>
                <td className="nw">{date(r.date)}</td>
                <td className="r">
                  <Link className="link" href={votePath(r)}>
                    {r.clerkRoll}
                  </Link>
                </td>
                <td className="nw">
                  <Link className="link" href={votePath(r)}>
                    {m.label}
                  </Link>
                </td>
                <td className="clip">
                  <Link href={votePath(r)}>{r.question || "—"}</Link>
                  {r.description && <span className="sub">{r.description}</span>}
                </td>
                <td className="dim">{r.result}</td>
                <td className="r">
                  {r.yeas}–{r.nays}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

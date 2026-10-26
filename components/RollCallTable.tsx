import { rollCallUrl, type ChamberVotes } from "@/lib/sources/votes";
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
                  <a className="link" href={rollCallUrl(r, data.congress)} target="_blank" rel="noreferrer">
                    {r.clerkRoll}
                  </a>
                </td>
                <td className="nw">
                  {m.url ? (
                    <a className="link" href={m.url} target="_blank" rel="noreferrer">
                      {m.label}
                    </a>
                  ) : (
                    m.label
                  )}
                </td>
                <td className="clip">
                  {r.question || "—"}
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

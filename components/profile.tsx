import type { Bill } from "@/lib/sources/congress";
import { billStatus } from "@/lib/sources/congress";
import { rollCallUrl } from "@/lib/sources/votes";
import type { MemberVote } from "@/lib/profile";
import { billLabel, billUrl, date, ordinal, parseMeasure } from "@/lib/format";

export function VotesTable({ votes, congress, compact = false }: { votes: MemberVote[]; congress: number; compact?: boolean }) {
  if (votes.length === 0) return <p className="empty">No roll-call votes recorded for this member yet.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            {!compact && <th className="r">Roll</th>}
            <th>Measure</th>
            <th>Question</th>
            {!compact && <th>Result</th>}
            <th>Attendance</th>
          </tr>
        </thead>
        <tbody>
          {votes.map((v) => {
            const m = parseMeasure(v.measure, congress);
            return (
              <tr key={v.roll}>
                <td className="nw">{date(v.date)}</td>
                {!compact && (
                  <td className="r">
                    <a className="link" href={rollCallUrl(v, congress)} target="_blank" rel="noreferrer">
                      {v.clerkRoll}
                    </a>
                  </td>
                )}
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
                  {v.question || "—"}
                  {v.description && <span className="sub">{v.description}</span>}
                </td>
                {!compact && <td className="dim">{v.result}</td>}
                <td>{v.missed ? <span className="pill missed">Missed</span> : <span className="pill">Voted</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BillsTable({ bills, showPolicy = true }: { bills: Bill[]; showPolicy?: boolean }) {
  if (bills.length === 0) return <p className="empty">No bills found.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Bill</th>
            <th>Title</th>
            {showPolicy && <th>Policy Area</th>}
            <th>Introduced</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => {
            const status = billStatus(b);
            const href = billUrl(b.congress, b.type, b.number);
            return (
              <tr key={`${b.congress}-${b.type}-${b.number}`}>
                <td className="nw">
                  {href ? (
                    <a className="link" href={href} target="_blank" rel="noreferrer">
                      {billLabel(b.type, b.number)}
                    </a>
                  ) : (
                    billLabel(b.type, b.number)
                  )}
                  <span className="sub">{ordinal(b.congress)} Congress</span>
                </td>
                <td className="clip">
                  {b.title}
                  {b.latestAction && (
                    <span className="sub">
                      {date(b.latestAction.date)}: {b.latestAction.text}
                    </span>
                  )}
                </td>
                {showPolicy && <td className="dim">{b.policyArea ?? "—"}</td>}
                <td className="nw">{date(b.introduced)}</td>
                <td>
                  <span className={`pill ${status === "Law" ? "law" : ""}`}>{status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

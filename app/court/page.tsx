import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { BarList, Card, JusticeLink, Skeleton, StatStrip, Unavailable } from "@/components/ui";
import { DecisionsTable } from "@/components/CourtTable";
import { casePath, getCourt, hasVotes, justiceStats } from "@/lib/sources/court";
import { attempt } from "@/lib/http";
import { date, num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Supreme Court" };

async function Court() {
  const court = await attempt(getCourt);
  if (!court) {
    return (
      <Card title="Supreme Court">
        <Unavailable what="Supreme Court data" />
      </Card>
    );
  }

  const termCases = court.decided.filter((c) => c.term === court.decisionsTerm);
  const withVotes = termCases.filter(hasVotes);
  const awaiting = termCases.length - withVotes.length;
  const unanimous = termCases.filter((c) => c.minority === 0).length;
  const sixThree = termCases.filter((c) => c.majority === 6 && c.minority === 3).length;
  const fiveFour = termCases.filter((c) => c.majority === 5 && c.minority === 4).length;
  const majorityRates = court.justices
    .map((j) => {
      const s = justiceStats(j.id, termCases);
      return { key: j.id, label: j.name, value: s.cases ? s.inMajority / s.cases : 0 };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <div className="cols">
      <div className="stack">
        <section className="card">
          <header className="card-head">
            <h2>October Term {court.decisionsTerm} at a Glance</h2>
          </header>
          <StatStrip
            stats={[
              { label: "Decisions", value: num(termCases.length), sub: `OT${court.decisionsTerm}` },
              { label: "Unanimous", value: num(unanimous), sub: pct(withVotes.length ? unanimous / withVotes.length : null, 0) },
              { label: "6–3", value: num(sixThree) },
              { label: "5–4", value: num(fiveFour) },
              { label: "Justices", value: num(court.justices.length) },
              { label: "On the Docket", value: num(court.pending.length), sub: `OT${court.term}` },
            ]}
          />
        </section>

        <Card
          title="Recent Decisions"
          aside={`${court.decided.length} decisions`}
          footer={awaiting ? `Justice-by-justice votes for ${awaiting} recent decisions haven't been published by Oyez yet.` : undefined}
          flush
        >
          <DecisionsTable cases={court.decided.slice(0, 40)} />
        </Card>

        {court.pending.length > 0 && (
          <Card title={`On the Docket · October Term ${court.term}`} flush>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Argued</th>
                  </tr>
                </thead>
                <tbody>
                  {court.pending.slice(0, 30).map((c) => (
                    <tr key={c.docket}>
                      <td className="clip">
                        <Link className="link" href={casePath(c)}>
                          {c.name}
                        </Link>
                        {c.question && <span className="sub">{c.question}</span>}
                      </td>
                      <td className="nw">{c.argued ? date(c.argued) : "Not yet argued"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <div className="stack">
        <Card title="The Justices" flush>
          <table className="data">
            <tbody>
              {court.justices.map((j) => (
                <tr key={j.id}>
                  <td>
                    <JusticeLink
                      id={j.id}
                      name={j.name}
                      photo={j.photo}
                      sub={`${j.title} · Appointed by ${j.appointedBy || "—"}, ${j.joined.slice(0, 4)}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={`In the Majority · OT${court.decisionsTerm}`} footer="Share of decided cases in which each justice joined the majority.">
          <BarList items={majorityRates} format={(n) => pct(n, 0)} />
        </Card>
        <p className="note">
          Case data from{" "}
          <a className="link" href="https://www.oyez.org" target="_blank" rel="noreferrer">
            Oyez
          </a>{" "}
          (CC BY-NC 4.0).
        </p>
      </div>
    </div>
  );
}

export default function CourtPage() {
  return (
    <main className="page">
      <h1 className="page-title">Supreme Court</h1>
      <Suspense fallback={<Skeleton />}>
        <Court />
      </Suspense>
    </main>
  );
}

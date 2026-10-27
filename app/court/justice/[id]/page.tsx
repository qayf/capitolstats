import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarList, Card, StatStrip, Unavailable } from "@/components/ui";
import { DecisionsTable } from "@/components/CourtTable";
import { getCourt, getJusticeBio, justiceStats } from "@/lib/sources/court";
import { attempt } from "@/lib/http";
import { date, num, pct } from "@/lib/format";

type Params = Promise<{ id: string }>;

async function load(params: Params) {
  const { id } = await params;
  const court = await attempt(getCourt);
  return { id, court, justice: court?.justices.find((j) => j.id === id) ?? null };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { justice } = await load(params);
  return { title: justice ? `${justice.name} — Stats` : "Justice not found" };
}

async function Justice({ params }: { params: Params }) {
  const { id, court, justice: j } = await load(params);
  if (!court) {
    return (
      <main className="page">
        <Card title="Justice">
          <Unavailable what="Supreme Court data" />
        </Card>
      </main>
    );
  }
  if (!j) notFound();

  const bio = await attempt(() => getJusticeBio(id));
  const termCases = court.decided.filter((c) => c.term === court.decisionsTerm);
  const s = justiceStats(j.id, termCases);
  const myCases = court.decided.filter((c) => c.votes.some((v) => v.justiceId === j.id));
  const yearsOnCourt = (Date.parse(court.asOf) - Date.parse(j.joined)) / (365.25 * 86400000);
  const nameById = new Map(court.justices.map((x) => [x.id, x.name]));

  return (
    <>
      <div className="profile">
        <div className="profile-inner">
          <div className="profile-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="profile-photo" src={j.photo ?? ""} alt={j.name} />
            <div>
              <h1 className="profile-name">{j.name}</h1>
              <div className="profile-meta">
                <span>{j.title} of the United States</span>
                <span className="sep">|</span>
                <span>Appointed by {j.appointedBy || "—"}</span>
                <span className="sep">|</span>
                <span>On the Court since {date(j.joined)}</span>
              </div>
            </div>
          </div>
          <StatStrip
            stats={[
              { label: "Yrs on Court", value: yearsOnCourt.toFixed(1), sub: `Since ${j.joined.slice(0, 4)}` },
              { label: "Cases", value: num(s.cases), sub: `OT${court.decisionsTerm}` },
              { label: "In Majority", value: pct(s.cases ? s.inMajority / s.cases : null, 0), sub: `${s.inMajority} of ${s.cases}` },
              { label: "Majority Opinions", value: num(s.majorityOpinions), sub: "Authored" },
              { label: "Dissents", value: num(s.dissents), sub: "Authored" },
              { label: "Concurrences", value: num(s.concurrences), sub: "Authored" },
            ]}
          />
        </div>
      </div>
      <main className="page">
        <div className="cols">
          <div className="stack">
            <Card
              title="Decisions"
              aside={`${myCases.length} cases`}
              footer="Majority or dissent shows which side of the ruling the justice joined."
              flush
            >
              <DecisionsTable cases={myCases} justiceId={j.id} />
            </Card>
          </div>
          <div className="stack">
            <Card title={`Agrees Most With · OT${court.decisionsTerm}`} footer="How often two justices landed on the same side of a decision.">
              <BarList
                items={s.agreement.map((a) => ({
                  key: a.id,
                  label: (
                    <Link className="link" href={`/court/justice/${a.id}`}>
                      {nameById.get(a.id) ?? a.name}
                    </Link>
                  ),
                  value: a.rate,
                }))}
                format={(n) => pct(n, 0)}
              />
            </Card>
            <Card title="Bio">
              <ul className="bars">
                {bio?.born && (
                  <li className="bar-row">
                    <span>Born</span>
                    <span className="v">{date(bio.born)}</span>
                  </li>
                )}
                {bio?.birthplace && (
                  <li className="bar-row">
                    <span>Birthplace</span>
                    <span className="v">{bio.birthplace}</span>
                  </li>
                )}
                {bio?.lawSchool && (
                  <li className="bar-row">
                    <span>Law school</span>
                    <span className="v">{bio.lawSchool}</span>
                  </li>
                )}
                <li className="bar-row">
                  <span>Appointed by</span>
                  <span className="v">{j.appointedBy || "—"}</span>
                </li>
                <li className="bar-row">
                  <span>Joined the Court</span>
                  <span className="v">{date(j.joined)}</span>
                </li>
              </ul>
            </Card>
            <Card title="Elsewhere">
              <ul className="bars">
                <li>
                  <a className="link" href={`https://www.oyez.org/justices/${j.id}`} target="_blank" rel="noreferrer">
                    Oyez
                  </a>
                </li>
                <li>
                  <a className="link" href="https://www.supremecourt.gov/about/biographies.aspx" target="_blank" rel="noreferrer">
                    Supreme Court biographies
                  </a>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

export default function JusticePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="profile" style={{ height: 290 }} />}>
      <Justice params={params} />
    </Suspense>
  );
}

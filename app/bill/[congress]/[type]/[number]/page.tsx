import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Unavailable } from "@/components/ui";
import { PartyTally } from "@/components/PartyTally";
import { getBill } from "@/lib/bills";
import { outcome } from "@/lib/news";
import { billStatus, summaryParagraphs, type Bill } from "@/lib/sources/congress";
import { getMembers } from "@/lib/sources/legislators";
import { votePath } from "@/lib/sources/votes";
import { billLabel, date, ordinal } from "@/lib/format";

type Params = Promise<{ congress: string; type: string; number: string }>;

async function load(params: Params) {
  const { congress, type, number } = await params;
  const valid = /^\d{2,3}$/.test(congress) && /^[a-z]+$/i.test(type) && /^\d+$/.test(number);
  let data: Awaited<ReturnType<typeof getBill>> = null;
  let failed = false;
  if (valid) {
    try {
      data = await getBill(Number(congress), type, number);
    } catch (err) {
      console.warn((err as Error).message);
      failed = true;
    }
  }
  return { valid, failed, data, label: billLabel(type.toUpperCase(), number) };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { data, label } = await load(params);
  if (!data) return { title: `${label} not found` };
  const title = data.overview?.title ?? data.law?.title ?? label;
  return { title: data.law ? `${title} (P.L. ${data.law.law})` : `${title} (${label})` };
}

async function BillView({ params }: { params: Params }) {
  const { valid, failed, data, label } = await load(params);
  if (!valid || (!data && !failed)) notFound();
  if (!data) {
    return (
      <main className="page">
        <Card title={label}>
          <Unavailable what="This bill" />
        </Card>
      </main>
    );
  }

  const { congress, type, number, law, stage, overview, votes, votesAvailable, deciding, president } = data;
  const title = overview?.title ?? law?.title ?? label;
  const status = law ? "Became law" : stage ? stage : overview?.latestAction ? billStatus({ latestAction: overview.latestAction } as Bill) : "Introduced";
  const summary = overview ? summaryParagraphs(overview, 1400) : [];
  const members = overview?.sponsor ? await getMembers().catch(() => []) : [];
  const sponsorHasPage = !!overview?.sponsor && members.some((m) => m.id === overview.sponsor!.id);
  const recorded = deciding.filter((d) => d.vote);

  return (
    <>
      <div className="profile">
        <div className="profile-inner vote-head">
          <div className="eyebrow">
            {law && <>Public Law {law.law} · </>}
            {billLabel(type, number)} · {ordinal(congress)} Congress
          </div>
          <h1 className="profile-name">{title}</h1>
          {law && title !== law.title && <p className="vote-desc">{law.title}</p>}
          <div className="vote-score">
            <div>
              <div className="stat-label">{law ? "Enacted" : "Status"}</div>
              <div className="vote-result">{law ? date(law.date) : status}</div>
            </div>
            {president && (
              <div>
                <div className="stat-label">President</div>
                <div className="vote-result">
                  <Link href={`/presidents/${president.slug}`}>{president.name}</Link>
                </div>
              </div>
            )}
            {deciding.map((d) => (
              <div key={d.chamber}>
                <div className="stat-label">{d.chamber === "house" ? "House" : "Senate"}</div>
                {d.vote ? (
                  <div className="stat-value">
                    {d.vote.yeas}–{d.vote.nays}
                  </div>
                ) : (
                  <div className="vote-result">{votesAvailable ? (law ? "No roll call" : "No vote") : "—"}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="page">
        <div className="cols">
          <div className="stack">
            <Card
              title={law ? "What the Law Does" : "What the Bill Does"}
              footer={summary.length ? "Summary written by the Congressional Research Service." : undefined}
            >
              <dl className="facts">
                {overview?.sponsor && (
                  <div>
                    <dt>Sponsor</dt>
                    <dd>
                      {sponsorHasPage ? (
                        <Link className="link" href={`/member/${overview.sponsor.id}`}>
                          {overview.sponsor.name}
                        </Link>
                      ) : (
                        overview.sponsor.name
                      )}
                    </dd>
                  </div>
                )}
                {overview?.introduced && (
                  <div>
                    <dt>Introduced</dt>
                    <dd>{date(overview.introduced)}</dd>
                  </div>
                )}
                {overview?.policyArea && (
                  <div>
                    <dt>Policy Area</dt>
                    <dd>{overview.policyArea}</dd>
                  </div>
                )}
                {law ? (
                  <div>
                    <dt>Enacted</dt>
                    <dd>
                      {date(law.date)} as Public Law {law.law}
                    </dd>
                  </div>
                ) : (
                  overview?.latestAction && (
                    <div>
                      <dt>Latest Action</dt>
                      <dd>
                        {date(overview.latestAction.date)}: {overview.latestAction.text}
                      </dd>
                    </div>
                  )
                )}
              </dl>
              {summary.length ? (
                summary.map((p, i) => (
                  <p key={i} className="summary">
                    {p}
                  </p>
                ))
              ) : (
                <p className="summary note">No summary has been published for this {law ? "law" : "bill"} yet.</p>
              )}
            </Card>

            {recorded.map((d) => (
              <Card
                key={d.chamber}
                title={`${d.isPassage ? "" : "Latest "}${d.chamber === "house" ? "House" : "Senate"} ${d.isPassage ? "Passage" : "Vote"} · ${d.vote!.yeas}–${d.vote!.nays}`}
                aside={date(d.vote!.date)}
                footer={
                  <Link href={votePath(d.vote!)}>See how every {d.chamber === "house" ? "representative" : "senator"} voted</Link>
                }
                flush
              >
                <div className="card-body">
                  <strong>{d.vote!.question || "Roll call vote"}</strong>
                  {d.vote!.result && <span className="dim"> · {d.vote!.result}</span>}
                </div>
                {d.positions.length > 0 && <PartyTally positions={d.positions} bare />}
              </Card>
            ))}

            {law && votesAvailable && recorded.length < 2 && (
              <Card title="How It Passed">
                <p style={{ margin: 0 }}>
                  {recorded.length === 0
                    ? "Neither chamber held a recorded roll-call vote on this measure. It passed by voice vote or unanimous consent, which is common for less contested bills."
                    : `The ${recorded[0].chamber === "house" ? "Senate" : "House"} did not hold a recorded roll-call vote on this measure; it passed by voice vote or unanimous consent.`}
                </p>
              </Card>
            )}
          </div>

          <div className="stack">
            <Card title="All Recorded Votes" aside={votes.length ? `${votes.length}` : undefined} flush>
              {votes.length ? (
                <table className="data">
                  <tbody>
                    {votes.map((v) => (
                      <tr key={`${v.chamber}-${v.roll}`}>
                        <td className="nw">
                          {date(v.date)}
                          <span className="sub">{v.chamber === "house" ? "House" : "Senate"}</span>
                        </td>
                        <td>
                          <Link href={votePath(v)}>{v.question || "Roll call"}</Link>
                          <span className="sub">{outcome(v)}</span>
                        </td>
                        <td className="r">
                          {v.yeas}–{v.nays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty">{votesAvailable ? "No recorded votes." : "Vote data is temporarily unavailable."}</p>
              )}
            </Card>
            {president && (
              <p className="note">
                Enacted during{" "}
                <Link className="link" href={`/presidents/${president.slug}`}>
                  {president.name}&apos;s {president.term === 2 ? "second" : "first"} term
                </Link>
                . Votes from Voteview; bill details from Congress.gov.
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export default function BillPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="profile" style={{ height: 220 }} />}>
      <BillView params={params} />
    </Suspense>
  );
}

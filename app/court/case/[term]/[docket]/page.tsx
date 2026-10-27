import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Unavailable } from "@/components/ui";
import { getCase, getCourt, majorityAuthor, split, type CourtCase, type JusticeVote } from "@/lib/sources/court";
import { attempt } from "@/lib/http";
import { date } from "@/lib/format";

type Params = Promise<{ term: string; docket: string }>;

async function load(params: Params) {
  const { term, docket } = await params;
  const valid = /^\d{4}$/.test(term) && /^[\w-]+$/.test(docket);
  let found: CourtCase | null = null;
  let failed = false;
  if (valid) {
    try {
      found = await getCase(Number(term), docket);
    } catch (err) {
      console.warn((err as Error).message);
      failed = true;
    }
  }
  return { valid, failed, found };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { found } = await load(params);
  return { title: found ? found.name : "Case not found" };
}

function role(v: JusticeVote) {
  if (v.opinion === "majority") return "Wrote the opinion";
  if (v.opinion === "plurality") return "Wrote the plurality opinion";
  if (v.opinion.includes("dissent")) return "Wrote a dissent";
  if (v.opinion.includes("concurrence")) return "Wrote a concurrence";
  return v.vote === "majority" ? "Joined" : v.vote === "minority" ? "Joined dissent" : "";
}

function Side({ title, votes, photos }: { title: string; votes: JusticeVote[]; photos: Map<string, string | null> }) {
  if (votes.length === 0) return null;
  return (
    <div className="roster-group">
      <h3 className={`roster-head ${title === "Majority" ? "yea" : "nay"}`}>
        {title} <span>{votes.length}</span>
      </h3>
      <table className="data">
        <tbody>
          {votes.map((v) => (
            <tr key={v.justiceId}>
              <td>
                <Link href={`/court/justice/${v.justiceId}`} className="who">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="thumb" src={photos.get(v.justiceId) ?? ""} alt="" loading="lazy" />
                  {v.name}
                </Link>
              </td>
              <td className="r dim">{role(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function CaseView({ params }: { params: Params }) {
  const { valid, failed, found: c } = await load(params);
  if (!valid || (!c && !failed)) notFound();
  if (!c) {
    return (
      <main className="page">
        <Card title="Case">
          <Unavailable what="This case" />
        </Card>
      </main>
    );
  }

  const court = await attempt(getCourt);
  const photos = new Map((court?.justices ?? []).map((j) => [j.id, j.photo]));
  const author = majorityAuthor(c);
  const majority = c.votes.filter((v) => v.vote === "majority");
  const minority = c.votes.filter((v) => v.vote === "minority");

  return (
    <>
      <div className="profile">
        <div className="profile-inner vote-head">
          <div className="eyebrow">
            Supreme Court · No. {c.docket} · {c.decided ? `Decided ${date(c.decided)}` : c.argued ? `Argued ${date(c.argued)}` : "Pending"} ·
            October Term {c.term}
          </div>
          <h1 className="profile-name">{c.name}</h1>
          {c.holding && <p className="vote-desc">{c.holding}</p>}
          <div className="vote-score">
            <div>
              <div className="stat-label">Decision</div>
              {c.decided && c.votes.length === 0 ? (
                <div className="vote-result">Decided · vote breakdown not yet published</div>
              ) : (
                <div className="stat-value">{c.decided ? split(c) : "Pending"}</div>
              )}
            </div>
            {c.winningParty && (
              <div>
                <div className="stat-label">Ruled For</div>
                <div className="vote-result">{c.winningParty}</div>
              </div>
            )}
            {(author || c.decisionType) && (
              <div>
                <div className="stat-label">Opinion</div>
                <div className="vote-result">{author ? `Justice ${author.lastName}` : c.decisionType}</div>
              </div>
            )}
            {c.citation && (
              <div>
                <div className="stat-label">Citation</div>
                <div className="vote-result">{c.citation}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <main className="page">
        <div className="cols">
          <div className="stack">
            {c.question && (
              <Card title="The Question">
                {c.question.split("\n").map((p, i) => (
                  <p key={i} className="summary">
                    {p}
                  </p>
                ))}
              </Card>
            )}
            {c.votes.length > 0 && (
              <Card title="How the Justices Voted" flush>
                <Side title="Majority" votes={majority} photos={photos} />
                <Side title="Dissent" votes={minority} photos={photos} />
              </Card>
            )}
          </div>
          <div className="stack">
            <Card title="The Case">
              <dl className="facts">
                <div>
                  <dt>Petitioner</dt>
                  <dd>{c.firstParty || "—"}</dd>
                </div>
                <div>
                  <dt>Respondent</dt>
                  <dd>{c.secondParty || "—"}</dd>
                </div>
                {c.lowerCourt && (
                  <div>
                    <dt>From</dt>
                    <dd>{c.lowerCourt}</dd>
                  </div>
                )}
                {c.argued && (
                  <div>
                    <dt>Argued</dt>
                    <dd>{date(c.argued)}</dd>
                  </div>
                )}
                {c.decided && (
                  <div>
                    <dt>Decided</dt>
                    <dd>{date(c.decided)}</dd>
                  </div>
                )}
              </dl>
            </Card>
            {c.opinions.length > 0 && (
              <Card title="Opinions" flush>
                <table className="data">
                  <tbody>
                    {c.opinions.map((o, i) => (
                      <tr key={i}>
                        <td>{o.type}</td>
                        <td className="r">{o.author ?? "Per curiam"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
            <p className="note">
              Case summary from{" "}
              <a className="link" href={c.oyezUrl} target="_blank" rel="noreferrer">
                Oyez
              </a>{" "}
              (CC BY-NC 4.0).
              {c.justiaUrl && (
                <>
                  {" "}
                  Full opinions at{" "}
                  <a className="link" href={c.justiaUrl} target="_blank" rel="noreferrer">
                    Justia
                  </a>
                  .
                </>
              )}
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

export default function CasePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="profile" style={{ height: 220 }} />}>
      <CaseView params={params} />
    </Suspense>
  );
}

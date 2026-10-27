import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PartyTag, Skeleton, Unavailable } from "@/components/ui";
import { PartyTally } from "@/components/PartyTally";
import { getStory, outcome, passed } from "@/lib/news";
import { summaryParagraphs } from "@/lib/sources/congress";
import { getMembers } from "@/lib/sources/legislators";
import { votePath } from "@/lib/sources/votes";
import { date, parseMeasure } from "@/lib/format";
import { getCourtStory, parseCaseSlug } from "@/lib/courtNews";
import { casePath, split, type JusticeVote } from "@/lib/sources/court";

type Params = Promise<{ slug: string }>;

// Reads params outside the try/catch so Next's prerender rejection isn't swallowed.
async function load(params: Params) {
  const { slug } = await params;
  try {
    return { story: await getStory(slug), failed: false };
  } catch (err) {
    console.warn((err as Error).message);
    return { story: null, failed: true };
  }
}

async function loadCourt(params: Params) {
  const { slug } = await params;
  const key = parseCaseSlug(slug);
  if (!key) return null;
  try {
    return { story: await getCourtStory(key.term, key.docket), failed: false };
  } catch (err) {
    console.warn((err as Error).message);
    return { story: null, failed: true };
  }
}

export async function generateMetadata({ params }: { params: Params }) {
  const court = await loadCourt(params);
  if (court) return { title: court.story ? court.story.headline : "Story not found", description: court.story?.dek };
  const { story } = await load(params);
  return { title: story ? story.headline : "Story not found", description: story?.dek };
}

function JusticeList({ votes, photos }: { votes: JusticeVote[]; photos: Record<string, string | null> }) {
  return (
    <table className="data">
      <tbody>
        {votes.map((v) => (
          <tr key={v.justiceId}>
            <td>
              <Link href={`/court/justice/${v.justiceId}`} className="who">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="thumb" src={photos[v.justiceId] ?? ""} alt="" loading="lazy" />
                {v.name}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function CourtArticle({ params }: { params: Params }) {
  const loaded = await loadCourt(params);
  if (!loaded || (!loaded.story && !loaded.failed)) notFound();
  if (!loaded.story) {
    return (
      <Card title="Story">
        <Unavailable what="This story" />
      </Card>
    );
  }
  const { case: c, headline, dek, paragraphs, majority, minority, photos } = loaded.story;

  return (
    <div className="cols">
      <article className="article">
        <div className="story-meta">Supreme Court · {date(c.decided)} · Decision Recap</div>
        <h1>{headline}</h1>
        <p className="dek">{dek}</p>
        <div className="byline">By Capitol Stats · Written from the Court&apos;s recorded votes in No. {c.docket}</div>
        <div className="article-body">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {c.holding && (
            <>
              <h2>The Ruling</h2>
              <p>{c.holding}</p>
            </>
          )}
          {c.question && (
            <>
              <h2>The Question</h2>
              {c.question.split("\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </>
          )}
          <p className="note">
            Ruling and question summaries from{" "}
            <a href={c.oyezUrl} target="_blank" rel="noreferrer">
              Oyez
            </a>{" "}
            (CC BY-NC 4.0).
          </p>
        </div>
      </article>
      <div className="stack">
        <Card title="Box Score" flush>
          <div className="card-body">
            <div className="story-meta" style={{ color: "var(--muted)" }}>
              {c.name}
            </div>
            <div className="story-score won" style={{ marginTop: 8 }}>
              <strong>{split(c)}</strong>
              <span>{c.winningParty ? `For ${c.winningParty}` : "Decided"}</span>
            </div>
          </div>
          <div className="card-foot">
            <Link href={casePath(c)}>Full case page</Link>
          </div>
        </Card>
        <Card title={`Majority · ${majority.length}`} flush>
          <JusticeList votes={majority} photos={photos} />
        </Card>
        {minority.length > 0 && (
          <Card title={`Dissent · ${minority.length}`} flush>
            <JusticeList votes={minority} photos={photos} />
          </Card>
        )}
      </div>
    </div>
  );
}

async function Article({ params }: { params: Params }) {
  const { slug } = await params;
  if (slug.startsWith("scotus-")) return <CourtArticle params={params} />;
  const { story, failed } = await load(params);
  if (!story && !failed) notFound();
  if (!story) {
    return (
      <Card title="Story">
        <Unavailable what="This story" />
      </Card>
    );
  }

  const { rollcall: r, congress, overview, breakdown: b, related } = story;
  const members = await getMembers();
  const currentIds = new Set(members.map((m) => m.id));
  const chamber = r.chamber === "house" ? "House" : "Senate";
  const summary = overview ? summaryParagraphs(overview, 1200) : [];
  const sponsorHasPage = !!overview?.sponsor && currentIds.has(overview.sponsor.id);

  return (
    <div className="cols">
      <article className="article">
        <div className="story-meta">
          {chamber} · {date(r.date)} · Floor Recap
        </div>
        <h1>{story.headline}</h1>
        <p className="dek">{story.dek}</p>
        <div className="byline">
          By Capitol Stats · Written from the official {chamber} roll call, roll no. {r.clerkRoll}
        </div>

        <div className="article-body">
          {story.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}

          {overview && (
            <>
              <h2>Background</h2>
              <p>
                <strong>{overview.title.replace(/\.$/, "")}</strong>
                {overview.sponsor && (
                  <>
                    {" "}
                    was introduced
                    {overview.introduced ? ` on ${date(overview.introduced)}` : ""} by{" "}
                    {sponsorHasPage ? <Link href={`/member/${overview.sponsor.id}`}>{overview.sponsor.name}</Link> : overview.sponsor.name}
                  </>
                )}
                {overview.policyArea ? ` and falls under ${overview.policyArea.toLowerCase()}` : ""}.
              </p>
              {summary.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {summary.length > 0 && <p className="note">Bill summary by the Congressional Research Service.</p>}
              {overview.latestAction && (
                <p>
                  <strong>Latest action ({date(overview.latestAction.date)}):</strong> {overview.latestAction.text}
                </p>
              )}
            </>
          )}

          {story.nominee && (
            <>
              <h2>The Nomination</h2>
              <p>
                {story.nominee.name} was nominated to be {story.nominee.position}. The Senate considers presidential nominations
                under its advice-and-consent power, and a simple majority is needed to confirm.
              </p>
            </>
          )}

          {related.length > 0 && (
            <>
              <h2>Other Votes on This Measure</h2>
              <div className="table-wrap article-table">
                <table className="data">
                  <tbody>
                    {related.map((x) => (
                      <tr key={`${x.chamber}-${x.roll}`}>
                        <td className="nw">{date(x.date)}</td>
                        <td className="nw">{x.chamber === "house" ? "House" : "Senate"}</td>
                        <td>
                          <Link href={x.path}>{x.question || "Vote"}</Link>
                        </td>
                        <td className="nw dim">{outcome(x)}</td>
                        <td className="r">
                          {x.yeas}–{x.nays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </article>

      <div className="stack">
        <Card title="Box Score" flush>
          <div className="card-body">
            <div className="story-meta" style={{ color: "var(--muted)" }}>
              {parseMeasure(r.measure, congress).label || "Roll call"} · {r.question}
            </div>
            <div className={`story-score ${passed(r) ? "won" : "lost"}`} style={{ marginTop: 8 }}>
              <strong>
                {r.yeas}–{r.nays}
              </strong>
              <span>{r.result}</span>
            </div>
          </div>
          <div className="card-foot">
            <Link href={votePath(r)}>See how every member voted</Link>
          </div>
        </Card>
        <PartyTally positions={story.positions} />
        {b.crossovers.length > 0 && b.crossovers.length <= 30 && (
          <Card title="Crossed Party Lines" flush>
            <table className="data">
              <tbody>
                {b.crossovers.map((p) => (
                  <tr key={p.sortName + p.state}>
                    <td>
                      <PartyTag party={p.party} />{" "}
                      {p.id && currentIds.has(p.id) ? <Link href={`/member/${p.id}`}>{p.name}</Link> : p.name}{" "}
                      <span className="dim">{p.state}</span>
                    </td>
                    <td className="r">{p.position === "yea" ? "Yea" : "Nay"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="note">
          Capitol Stats recaps are generated automatically from official roll-call records and Congress.gov bill data.
        </p>
      </div>
    </div>
  );
}

export default function NewsArticlePage({ params }: { params: Params }) {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <Article params={params} />
      </Suspense>
    </main>
  );
}

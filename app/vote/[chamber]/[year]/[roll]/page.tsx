import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PartyTag, Skeleton, Unavailable } from "@/components/ui";
import { GROUPS, PartyTally } from "@/components/PartyTally";
import { getRollCall, rollCallUrl, type MemberPosition } from "@/lib/sources/votes";
import { getBillOverview, summaryParagraphs } from "@/lib/sources/congress";
import { getMembers } from "@/lib/sources/legislators";
import { attempt } from "@/lib/http";
import { date, ordinal, parseMeasure } from "@/lib/format";

type Params = Promise<{ chamber: string; year: string; roll: string }>;

const MAJORITY: Record<string, string> = {
  "1/2": "Simple majority",
  "3/5": "Three-fifths",
  "2/3": "Two-thirds",
};

// Reads params outside of attempt(): during prerendering Next rejects params on
// purpose, and that rejection must not be swallowed.
async function load(params: Params) {
  const { chamber, year, roll } = await params;
  const valid = (chamber === "house" || chamber === "senate") && /^\d{4}$/.test(year) && /^\d+$/.test(roll);
  let data: Awaited<ReturnType<typeof getRollCall>> = null;
  let failed = false;
  if (valid) {
    try {
      data = await getRollCall(chamber, Number(year), Number(roll));
    } catch (err) {
      console.warn((err as Error).message);
      failed = true;
    }
  }
  return { valid, failed, year, roll, data };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { data } = await load(params);
  if (!data) return { title: "Vote not found" };
  const r = data.rollcall;
  const m = parseMeasure(r.measure, data.congress);
  return { title: `${r.chamber === "house" ? "House" : "Senate"} Roll Call ${r.clerkRoll}${r.measure ? ` · ${m.label}` : ""}` };
}

async function Overview({ congress, measure, fallback }: { congress: number; measure: string; fallback: string }) {
  const m = /^(HR|S|HRES|SRES|HJRES|SJRES|HCONRES|SCONRES)(\d+)$/.exec(measure.toUpperCase());
  const bill = m ? await attempt(() => getBillOverview(congress, m[1], m[2])) : null;
  const members = bill?.sponsor ? await getMembers() : [];
  const sponsorHasPage = !!bill?.sponsor && members.some((x) => x.id === bill.sponsor!.id);

  if (!bill) {
    return (
      <Card title="What Was Voted On">
        <p style={{ margin: 0 }}>{fallback || "No description was published for this vote."}</p>
      </Card>
    );
  }

  const summary = summaryParagraphs(bill).join("\n");

  return (
    <Card title="What Was Voted On" footer={bill.summary ? "Summary written by the Congressional Research Service." : undefined}>
      <h3 className="vote-bill-title">{bill.title}</h3>
      <dl className="facts">
        {bill.sponsor && (
          <div>
            <dt>Sponsor</dt>
            <dd>
              {sponsorHasPage ? (
                <Link className="link" href={`/member/${bill.sponsor.id}`}>
                  {bill.sponsor.name}
                </Link>
              ) : (
                bill.sponsor.name
              )}
            </dd>
          </div>
        )}
        {bill.introduced && (
          <div>
            <dt>Introduced</dt>
            <dd>{date(bill.introduced)}</dd>
          </div>
        )}
        {bill.policyArea && (
          <div>
            <dt>Policy Area</dt>
            <dd>{bill.policyArea}</dd>
          </div>
        )}
        {bill.latestAction && (
          <div>
            <dt>Latest Action</dt>
            <dd>
              {date(bill.latestAction.date)}: {bill.latestAction.text}
            </dd>
          </div>
        )}
      </dl>
      {summary ? (
        summary.split("\n").map((p, i) => (
          <p key={i} className="summary">
            {p}
          </p>
        ))
      ) : (
        <p className="summary note">{fallback || "A summary has not been published for this bill yet."}</p>
      )}
    </Card>
  );
}

function Roster({ positions, currentIds }: { positions: MemberPosition[]; currentIds: Set<string> }) {
  return (
    <Card title="How Members Voted" flush>
      {GROUPS.map((g) => {
        const list = positions.filter((p) => p.position === g.key);
        if (list.length === 0) return null;
        return (
          <div key={g.key} className="roster-group">
            <h3 className={`roster-head ${g.key}`}>
              {g.label} <span>{list.length}</span>
            </h3>
            <ul className="roster">
              {list.map((p) => (
                <li key={`${p.sortName}-${p.state}`}>
                  <PartyTag party={p.party} />{" "}
                  {p.id && currentIds.has(p.id) ? <Link href={`/member/${p.id}`}>{p.sortName}</Link> : p.sortName}
                  <span className="st">{p.state}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}

async function Vote({ params }: { params: Params }) {
  const { valid, failed, year, roll, data } = await load(params);
  if (!valid || (!data && !failed)) notFound();
  if (!data) {
    return (
      <main className="page">
        <Card title={`Roll Call ${roll} · ${year}`}>
          <Unavailable what="This vote" />
        </Card>
      </main>
    );
  }

  const { congress, rollcall: r, positions } = data;
  const m = parseMeasure(r.measure, congress);
  const chamberName = r.chamber === "house" ? "House" : "Senate";
  const members = await getMembers();
  const currentIds = new Set(members.map((x) => x.id));
  const yeas = positions.filter((p) => p.position === "yea").length;
  const nays = positions.filter((p) => p.position === "nay").length;

  return (
    <>
      <div className="profile">
        <div className="profile-inner vote-head">
          <div className="eyebrow">
            {chamberName} · Roll Call {r.clerkRoll} · {date(r.date)} · {ordinal(congress)} Congress
          </div>
          <h1 className="profile-name">{r.measure ? `${m.label}: ${r.question}` : r.question || "Roll Call Vote"}</h1>
          {r.description && <p className="vote-desc">{r.description}</p>}
          <div className="vote-score">
            <div>
              <div className="stat-label">Result</div>
              <div className="vote-result">{r.result || "—"}</div>
            </div>
            <div>
              <div className="stat-label">Yea</div>
              <div className="stat-value">{yeas}</div>
            </div>
            <div>
              <div className="stat-label">Nay</div>
              <div className="stat-value">{nays}</div>
            </div>
            <div>
              <div className="stat-label">Required</div>
              <div className="vote-result">{MAJORITY[r.majority] ?? (r.majority || "—")}</div>
            </div>
          </div>
        </div>
      </div>
      <main className="page">
        <div className="cols">
          <div className="stack">
            <Suspense fallback={<Skeleton />}>
              <Overview congress={congress} measure={r.measure} fallback={r.description} />
            </Suspense>
            <Roster positions={positions} currentIds={currentIds} />
          </div>
          <div className="stack">
            <PartyTally positions={positions} />
            <p className="note">
              Vote record from Voteview, compiled from the{" "}
              <a className="link" href={rollCallUrl(r, congress)} target="_blank" rel="noreferrer">
                official {chamberName} roll call
              </a>
              . Members who have since left Congress are listed without a profile link.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

export default function VotePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="profile" style={{ height: 220 }} />}>
      <Vote params={params} />
    </Suspense>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { Card, MemberLink, Skeleton, Unavailable } from "@/components/ui";
import { RollCallTable } from "@/components/RollCallTable";
import { cycleLabel, getMemberRows, getPeriod, type MemberRow } from "@/lib/stats";
import { getChamberVotes } from "@/lib/sources/votes";
import { getTopStories } from "@/lib/news";
import { attempt } from "@/lib/http";
import { date, moneyShort, num, ordinal, pct } from "@/lib/format";

function Leaderboard({ rows, value }: { rows: MemberRow[]; value: (r: MemberRow) => string }) {
  return (
    <table className="data">
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id}>
            <td className="rank">{i + 1}</td>
            <td>
              <MemberLink id={r.id} name={r.name} party={r.party} sub={`${r.chamber === "senate" ? "Sen." : "Rep."} · ${r.seat}`} />
            </td>
            <td className="r" style={{ verticalAlign: "middle", fontWeight: 600 }}>
              {value(r)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function Glance() {
  const [{ rows }, house, senate, { congress }] = await Promise.all([
    getMemberRows(),
    attempt(() => getChamberVotes("house")),
    attempt(() => getChamberVotes("senate")),
    getPeriod(),
  ]);

  const chamberBlock = (chamber: "senate" | "house", rollcalls: number | null) => {
    const members = rows.filter((r) => r.chamber === chamber && !(chamber === "house" && ["DC", "PR", "GU", "VI", "AS", "MP"].includes(r.state)));
    const count = { D: 0, R: 0, I: 0 };
    for (const m of members) count[m.party]++;
    const total = members.length;
    return (
      <div>
        <h3>{chamber === "senate" ? "Senate" : "House"}</h3>
        <div className="split" aria-hidden>
          <div className="D" style={{ width: `${(count.D / total) * 100}%` }} />
          <div className="I" style={{ width: `${(count.I / total) * 100}%` }} />
          <div className="R" style={{ width: `${(count.R / total) * 100}%` }} />
        </div>
        <div className="split-nums">
          <span className="D">{count.D} D</span>
          {count.I > 0 && <span style={{ color: "var(--ind)" }}>{count.I} I</span>}
          <span className="R">{count.R} R</span>
        </div>
        <div className="note">
          {total} seated voting members{rollcalls != null && <> · {num(rollcalls)} roll calls this Congress</>}
        </div>
      </div>
    );
  };

  return (
    <Card title={`${ordinal(congress)} Congress at a Glance`} flush>
      <div className="glance">
        {chamberBlock("senate", senate?.rollcalls.length ?? null)}
        {chamberBlock("house", house?.rollcalls.length ?? null)}
      </div>
    </Card>
  );
}

async function LatestVotes({ chamber }: { chamber: "senate" | "house" }) {
  const data = await attempt(() => getChamberVotes(chamber));
  const name = chamber === "senate" ? "Senate" : "House";
  return (
    <Card title={`Latest ${name} Votes`} aside={<Link href="/votes">All floor votes</Link>} flush>
      {data ? <RollCallTable data={data} limit={8} /> : <Unavailable what="Vote data" />}
    </Card>
  );
}

async function TopStories() {
  const data = await attempt(() => getTopStories(5));
  if (!data || data.stories.length === 0) {
    return (
      <Card title="Top Stories">
        <Unavailable what="News" />
      </Card>
    );
  }
  const [lead, ...rest] = data.stories;
  return (
    <Card title="Top Stories" aside={`Latest floor action ${date(data.latest)}`} flush>
      <Link href={`/news/${lead.slug}`} className="lead-story">
        <div className="story-meta">
          {lead.chamber === "house" ? "House" : "Senate"} · {date(lead.date)}
        </div>
        <h3 className="lead-headline">{lead.headline}</h3>
        <p className="lead-dek">{lead.dek}</p>
        <div className={`story-score ${lead.passed ? "won" : "lost"}`}>
          {lead.measure && <span>{lead.measure}</span>}
          <strong>{lead.tally}</strong>
          <span>{lead.outcome}</span>
        </div>
      </Link>
      <ul className="stories">
        {rest.map((s) => (
          <li key={s.slug}>
            <Link href={`/news/${s.slug}`}>
              <span className="story-meta">
                {s.chamber === "house" ? "House" : "Senate"} · {date(s.date, false)} · {s.tally}
              </span>
              <span className="story-headline">{s.headline}</span>
              <span className="story-dek">{s.dek}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function Leaders() {
  const [{ rows, financeAvailable, votesAvailable }, { cycle }] = await Promise.all([getMemberRows(), getPeriod()]);

  const topRaised = (chamber: "senate" | "house") =>
    rows
      .filter((r) => r.chamber === chamber && r.raised != null)
      .sort((a, b) => b.raised! - a.raised!)
      .slice(0, 5);

  const mostMissed = rows
    .filter((r) => r.eligible != null && r.eligible >= 100 && r.missed != null)
    .sort((a, b) => b.missed! - a.missed!)
    .slice(0, 8);

  const longest = [...rows].sort((a, b) => b.years - a.years).slice(0, 5);

  return (
    <>
      <Card title={`Top Fundraisers · ${cycleLabel(cycle)}`} aside={<Link href="/members">All members</Link>} flush>
        {financeAvailable ? (
          <>
            <Leaderboard rows={topRaised("senate")} value={(r) => moneyShort(r.raised)} />
            <div style={{ borderTop: "1px solid var(--line)" }} />
            <Leaderboard rows={topRaised("house")} value={(r) => moneyShort(r.raised)} />
          </>
        ) : (
          <Unavailable what="Campaign finance data" />
        )}
      </Card>
      <Card title="Most Missed Votes" footer="Roll calls missed this Congress. Long absences are often due to illness, family leave or a campaign." flush>
        {votesAvailable ? (
          <Leaderboard rows={mostMissed} value={(r) => `${r.missed} · ${pct(r.participation ?? null, 0)}`} />
        ) : (
          <Unavailable what="Vote data" />
        )}
      </Card>
      <Card title="Longest Serving" flush>
        <Leaderboard rows={longest} value={(r) => `${r.years.toFixed(1)} yrs`} />
      </Card>
    </>
  );
}

export default function Home() {
  return (
    <main className="page">
      <div className="cols">
        <div className="stack">
          <Suspense fallback={<Skeleton />}>
            <Glance />
          </Suspense>
          <Suspense fallback={<Skeleton />}>
            <TopStories />
          </Suspense>
          <Suspense fallback={<Skeleton />}>
            <LatestVotes chamber="house" />
          </Suspense>
        </div>
        <div className="stack">
          <Suspense fallback={<Skeleton />}>
            <Leaders />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

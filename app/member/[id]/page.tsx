import { Suspense } from "react";
import Link from "next/link";
import { BarList, Card, Skeleton, StackedBar, Unavailable } from "@/components/ui";
import { BillsTable, VotesTable } from "@/components/profile";
import { getMemberBills, getMemberVotes } from "@/lib/profile";
import { getMember } from "@/lib/sources/legislators";
import { policyAreas } from "@/lib/sources/congress";
import { getFunding } from "@/lib/sources/fec";
import { attempt } from "@/lib/http";
import { cycleLabel } from "@/lib/stats";
import { date, money, moneyShort } from "@/lib/format";

type Params = Promise<{ id: string }>;

async function RecentVotes({ id }: { id: string }) {
  const data = await attempt(() => getMemberVotes(id, 10));
  return (
    <Card title="Recent Votes" aside={<Link href={`/member/${id}/votes`}>All votes</Link>} flush>
      {data ? <VotesTable votes={data.votes} congress={data.congress} compact /> : <Unavailable what="Vote data" />}
    </Card>
  );
}

async function RecentBills({ id }: { id: string }) {
  const { sponsored } = await getMemberBills(id);
  return (
    <Card title="Recently Sponsored" aside={<Link href={`/member/${id}/legislation`}>All legislation</Link>} flush>
      {sponsored ? <BillsTable bills={sponsored.slice(0, 8)} showPolicy={false} /> : <Unavailable what="Legislation data" />}
    </Card>
  );
}

async function PolicyFocus({ id }: { id: string }) {
  const { sponsored, cosponsored } = await getMemberBills(id);
  if (!sponsored && !cosponsored) {
    return (
      <Card title="Policy Focus">
        <Unavailable what="Legislation data" />
      </Card>
    );
  }
  const areas = policyAreas([...(sponsored ?? []), ...(cosponsored ?? [])]);
  return (
    <Card title="Policy Focus" footer="Policy areas of recently sponsored and cosponsored bills.">
      {areas.length ? <BarList items={areas} /> : <p className="note">No policy areas assigned yet.</p>}
    </Card>
  );
}

async function FundingSnapshot({ id }: { id: string }) {
  const f = await attempt(() => getFunding(id));
  if (!f) {
    return (
      <Card title="Funding">
        <Unavailable what="Campaign finance data" />
      </Card>
    );
  }
  return (
    <Card
      title={`Funding · ${cycleLabel(f.cycle)}`}
      aside={<Link href={`/member/${id}/funding`}>Full breakdown</Link>}
      footer={`Total raised ${money(f.receipts)} through ${date(f.coverageEnd)}.`}
    >
      <StackedBar items={f.sources.filter((s) => s.value > 0)} format={moneyShort} />
    </Card>
  );
}

async function Committees({ id }: { id: string }) {
  const m = await getMember(id);
  const main = m?.committees.filter((c) => !c.parent) ?? [];
  return (
    <Card title="Committees" aside={<Link href={`/member/${id}/bio`}>Details</Link>}>
      {main.length ? (
        <ul className="bars">
          {main.map((c) => (
            <li key={c.name} className="bar-row">
              <span>{c.name}</span>
              {c.title && <span className="v">{c.title}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="note">No committee assignments listed.</p>
      )}
    </Card>
  );
}

async function Overview({ params }: { params: Params }) {
  const { id } = await params;
  return (
    <div className="cols">
      <div className="stack">
        <Suspense fallback={<Skeleton />}>
          <RecentVotes id={id} />
        </Suspense>
        <Suspense fallback={<Skeleton />}>
          <RecentBills id={id} />
        </Suspense>
      </div>
      <div className="stack">
        <Suspense fallback={<Skeleton />}>
          <FundingSnapshot id={id} />
        </Suspense>
        <Suspense fallback={<Skeleton />}>
          <PolicyFocus id={id} />
        </Suspense>
        <Suspense fallback={<Skeleton />}>
          <Committees id={id} />
        </Suspense>
      </div>
    </div>
  );
}

export default function MemberOverview({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

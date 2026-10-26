import { Suspense } from "react";
import { BarList, Card, Skeleton, Unavailable } from "@/components/ui";
import { BillsTable } from "@/components/profile";
import { getMemberBills } from "@/lib/profile";
import { billStatus, getMemberDetail, policyAreas } from "@/lib/sources/congress";
import { attempt } from "@/lib/http";
import { num } from "@/lib/format";

type Params = Promise<{ id: string }>;

async function Legislation({ params }: { params: Params }) {
  const { id } = await params;
  const [{ sponsored, cosponsored }, detail] = await Promise.all([getMemberBills(id), attempt(() => getMemberDetail(id))]);

  const statuses = new Map<string, number>();
  for (const b of sponsored ?? []) statuses.set(billStatus(b), (statuses.get(billStatus(b)) ?? 0) + 1);
  const statusItems = [...statuses.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return (
    <div className="cols">
      <div className="stack">
        <Card title="Sponsored" aside={detail ? `${num(detail.sponsored)} career total` : undefined} flush>
          {sponsored ? <BillsTable bills={sponsored.slice(0, 50)} /> : <Unavailable what="Legislation data" />}
        </Card>
        <Card title="Cosponsored" aside={detail ? `${num(detail.cosponsored)} career total` : undefined} flush>
          {cosponsored ? <BillsTable bills={cosponsored.slice(0, 50)} /> : <Unavailable what="Legislation data" />}
        </Card>
      </div>
      <div className="stack">
        <Card title="Where Sponsored Bills Stand" footer={`Based on the ${num(sponsored?.length ?? 0)} most recent sponsored bills.`}>
          {statusItems.length ? <BarList items={statusItems} /> : <p className="note">No sponsored bills.</p>}
        </Card>
        <Card title="Policy Areas · Sponsored">
          <BarList items={policyAreas(sponsored ?? [], 10)} />
        </Card>
        <Card title="Policy Areas · Cosponsored">
          <BarList items={policyAreas(cosponsored ?? [], 10)} />
        </Card>
      </div>
    </div>
  );
}

export default function MemberLegislationPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Legislation params={params} />
    </Suspense>
  );
}

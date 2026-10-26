import type { Metadata } from "next";
import { Suspense } from "react";
import { MembersTable } from "@/components/MembersTable";
import { Skeleton } from "@/components/ui";
import { cycleLabel, getMemberRows, getPeriod } from "@/lib/stats";
import { ordinal } from "@/lib/format";

export const metadata: Metadata = { title: "Members of Congress" };

async function Table() {
  const [{ rows, financeAvailable }, { congress, cycle }] = await Promise.all([getMemberRows(), getPeriod()]);
  return (
    <>
      <MembersTable rows={rows} cycleLabel={cycleLabel(cycle)} />
      <p className="note" style={{ marginTop: 10 }}>
        Votes cast and missed cover roll-call votes in the {ordinal(congress)} Congress. Raised is total receipts
        of the member&apos;s campaign committee for the {cycle - 1}–{cycle} cycle, as reported to the FEC.
        {!financeAvailable && " Campaign finance data is temporarily unavailable."}
      </p>
    </>
  );
}

export default function MembersPage() {
  return (
    <main className="page">
      <h1 className="page-title">Members of Congress</h1>
      <Suspense fallback={<Skeleton />}>
        <Table />
      </Suspense>
    </main>
  );
}

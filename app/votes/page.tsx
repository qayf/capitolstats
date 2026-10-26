import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Skeleton, Unavailable } from "@/components/ui";
import { RollCallTable } from "@/components/RollCallTable";
import { getChamberVotes } from "@/lib/sources/votes";
import { attempt } from "@/lib/http";
import { ordinal } from "@/lib/format";

export const metadata: Metadata = { title: "Floor Votes" };

async function Chamber({ chamber }: { chamber: "senate" | "house" }) {
  const data = await attempt(() => getChamberVotes(chamber));
  const name = chamber === "senate" ? "Senate" : "House";
  if (!data) {
    return (
      <Card title={name}>
        <Unavailable what="Vote data" />
      </Card>
    );
  }
  return (
    <Card title={`${name} · ${ordinal(data.congress)} Congress`} aside={`${data.rollcalls.length} roll calls`} flush>
      <RollCallTable data={data} limit={50} />
    </Card>
  );
}

export default function VotesPage() {
  return (
    <main className="page">
      <h1 className="page-title">Floor Votes</h1>
      <div className="stack">
        <Suspense fallback={<Skeleton />}>
          <Chamber chamber="senate" />
        </Suspense>
        <Suspense fallback={<Skeleton />}>
          <Chamber chamber="house" />
        </Suspense>
        <p className="note">Yea–Nay is the chamber-wide tally. Click a roll number for the official record.</p>
      </div>
    </main>
  );
}

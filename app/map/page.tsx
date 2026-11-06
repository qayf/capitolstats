import type { Metadata } from "next";
import { Suspense } from "react";
import { StateMap, type MapMember } from "@/components/StateMap";
import { Card, Skeleton, Unavailable } from "@/components/ui";
import { STATES } from "@/lib/format";
import { attempt } from "@/lib/http";
import { titleFor } from "@/lib/people";
import { getMembers } from "@/lib/sources/legislators";

export const metadata: Metadata = {
  title: "Map of Congress",
  description: "Find the senators and representatives for every state.",
};

async function MapLoader() {
  const members = await attempt(getMembers);
  if (!members) {
    return (
      <Card title="Map of Congress">
        <Unavailable what="Member data" />
      </Card>
    );
  }
  const list: MapMember[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    party: m.party,
    state: m.state,
    chamber: m.chamber,
    district: m.district ?? 0,
    sub: m.chamber === "senate" ? "U.S. Senator" : m.district ? `District ${m.district}` : titleFor(m) === "U.S. Representative" ? "At large" : titleFor(m),
  }));
  return <StateMap members={list} stateNames={STATES} />;
}

export default function MapPage() {
  return (
    <main className="page">
      <h1 className="page-title">Map of Congress</h1>
      <Suspense fallback={<Skeleton />}>
        <MapLoader />
      </Suspense>
    </main>
  );
}

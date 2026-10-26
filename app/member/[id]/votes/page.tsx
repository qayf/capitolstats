import { Suspense } from "react";
import { Card, Skeleton, StatStrip, Unavailable } from "@/components/ui";
import { VotesTable } from "@/components/profile";
import { getMemberVotes } from "@/lib/profile";
import { attempt } from "@/lib/http";
import { num, ordinal, pct } from "@/lib/format";

type Params = Promise<{ id: string }>;

async function Votes({ params }: { params: Params }) {
  const { id } = await params;
  const data = await attempt(() => getMemberVotes(id, 100));
  if (!data) {
    return (
      <Card title="Floor Votes">
        <Unavailable what="Vote data" />
      </Card>
    );
  }
  const a = data.attendance;
  return (
    <div className="stack">
      <section className="card">
        <StatStrip
          stats={[
            { label: "Roll Calls", value: num(a?.eligible), sub: `${ordinal(data.congress)} Congress` },
            { label: "Voted", value: num(a ? a.eligible - a.missed : null) },
            { label: "Missed", value: num(a?.missed) },
            { label: "Participation", value: pct(a?.rate) },
          ]}
        />
      </section>
      <Card
        title="Floor Votes"
        aside={`Last ${data.votes.length}`}
        footer="Shows each roll call the member was eligible for and whether they cast a vote. How they voted is intentionally not shown."
        flush
      >
        <VotesTable votes={data.votes} congress={data.congress} />
      </Card>
    </div>
  );
}

export default function MemberVotesPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Votes params={params} />
    </Suspense>
  );
}

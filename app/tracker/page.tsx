import type { Metadata } from "next";
import { Suspense } from "react";
import { BillPipeline, BillRows, BillSearch } from "@/components/BillPipeline";
import { Card, Skeleton, StatStrip, Unavailable } from "@/components/ui";
import { attempt } from "@/lib/http";
import { STAGE_LABELS, type Stage } from "@/lib/billStage";
import { getPipeline } from "@/lib/sources/pipeline";
import { num, ordinal, timestampET } from "@/lib/format";

export const metadata: Metadata = {
  title: "Bill Tracker",
  description: "Bills moving through Congress and to the President, and how far each has gotten.",
};

// Shortens action text so the page doesn't carry long floor notes for every row.
function trim<T extends { action: { date: string; text: string } }>(bill: T): T {
  const { text } = bill.action;
  return text.length <= 180 ? bill : { ...bill, action: { ...bill.action, text: `${text.slice(0, 177).trimEnd()}…` } };
}

async function Tracker() {
  const data = await attempt(getPipeline);
  if (!data) {
    return (
      <Card title="Bill Tracker">
        <Unavailable what="Bill data" />
      </Card>
    );
  }

  const byStage = (s: Stage) => data.bills.filter((b) => b.stage === s);
  const newest = <T extends { action: { date: string } }>(list: T[]) => [...list].sort((a, b) => b.action.date.localeCompare(a.action.date));
  const committee = byStage("committee");
  const toPresident = newest(byStage("president")).map(trim);
  const moving = newest(data.bills.filter((b) => !["committee", "president", "law"].includes(b.stage))).map(trim);
  const laws = newest(byStage("law")).slice(0, 25).map(trim);
  const active = newest(committee).slice(0, 50).map(trim);

  const count = (s: Stage) => num(byStage(s).length);

  return (
    <div className="stack">
      <section className="card">
        <header className="card-head">
          <h2>{ordinal(data.congress)} Congress Pipeline</h2>
          <div className="aside">Updated {timestampET(data.updatedAt)}</div>
        </header>
        <StatStrip
          stats={[
            { label: STAGE_LABELS.committee, value: count("committee"), sub: "Most never advance" },
            { label: STAGE_LABELS.reported, value: count("reported"), sub: "Awaiting a floor vote" },
            { label: STAGE_LABELS.firstChamber, value: count("firstChamber"), sub: "Now in the other chamber" },
            { label: STAGE_LABELS.bothChambers, value: count("bothChambers"), sub: "Final steps pending" },
            { label: STAGE_LABELS.president, value: count("president"), sub: `${count("vetoed")} vetoed` },
            { label: STAGE_LABELS.law, value: count("law"), sub: "This Congress" },
          ]}
        />
      </section>

      {toPresident.length > 0 && (
        <Card title="On the President's Desk" aside={`${toPresident.length} bills`} flush>
          <BillRows bills={toPresident} />
        </Card>
      )}

      <BillPipeline bills={moving} />

      <BillSearch />

      <Card title="Recently Active in Committee" aside={`${num(committee.length)} in committee`} flush>
        <BillRows bills={active} />
      </Card>

      <Card title="Recently Became Law" flush>
        <BillRows bills={laws} />
      </Card>

      <p className="note">
        Covers bills and joint resolutions, the measures that can become law. Congress.gov publishes updates about daily, so
        this is current to within about a day. Stages are worked out from each bill&apos;s latest action, recorded floor votes
        and the list of enacted laws, so a bill passed by voice vote can occasionally show one stage behind. Each bill&apos;s own
        page uses its full history.
        {!data.complete && " Floor votes or the law list could not be loaded just now, so some stages may be behind."}
      </p>
    </div>
  );
}

export default function TrackerPage() {
  return (
    <main className="page">
      <h1 className="page-title">Bill Tracker</h1>
      <Suspense fallback={<Skeleton />}>
        <Tracker />
      </Suspense>
    </main>
  );
}

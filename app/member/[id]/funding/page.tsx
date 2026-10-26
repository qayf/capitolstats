import { Suspense } from "react";
import { BarList, Card, Skeleton, StackedBar, StatStrip, Unavailable } from "@/components/ui";
import { getMember } from "@/lib/sources/legislators";
import { fecCandidateUrl, getFunding } from "@/lib/sources/fec";
import { attempt } from "@/lib/http";
import { cycleLabel } from "@/lib/stats";
import { STATES, date, money, moneyShort, num } from "@/lib/format";

type Params = Promise<{ id: string }>;

async function Funding({ params }: { params: Params }) {
  const { id } = await params;
  const [member, f] = await Promise.all([getMember(id), attempt(() => getFunding(id))]);
  if (!member || !f) {
    return (
      <Card title="Campaign Funding">
        <Unavailable what="Campaign finance data" />
      </Card>
    );
  }

  const stateTotal = f.byState.reduce((s, x) => s + x.value, 0);
  const home = f.byState.find((s) => s.state === member.state)?.value ?? 0;
  const individual = f.bySize.reduce((s, x) => s + x.value, 0);
  const small = f.bySize.find((s) => s.label === "Under $200")?.value ?? 0;
  const pacs = f.sources.find((s) => s.label.startsWith("PACs"))?.value ?? 0;

  return (
    <div className="stack">
      <section className="card">
        <StatStrip
          stats={[
            { label: "Raised", value: moneyShort(f.receipts), sub: `${cycleLabel(f.cycle)} cycle` },
            { label: "Spent", value: moneyShort(f.disbursements) },
            { label: "Cash on Hand", value: moneyShort(f.cash), sub: `As of ${date(f.coverageEnd)}` },
            { label: "Small Donors", value: individual ? `${Math.round((small / individual) * 100)}%` : "—", sub: "Of individual money" },
            { label: "From PACs", value: f.receipts ? `${Math.round((pacs / f.receipts) * 100)}%` : "—", sub: "Of total raised" },
            { label: "In-State", value: stateTotal ? `${Math.round((home / stateTotal) * 100)}%` : "—", sub: "Of itemized individual $" },
          ]}
        />
      </section>

      <div className="cols">
        <div className="stack">
          <Card title="Where the Money Comes From" aside={`${cycleLabel(f.cycle)} · ${money(f.receipts)} total`}>
            <StackedBar items={f.sources} format={money} />
          </Card>

          <Card
            title="Top Employers of Individual Donors"
            footer="Contributions from individuals, grouped by the employer they reported. Companies themselves cannot give directly to campaigns."
            flush
          >
            {f.employers.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="rank">#</th>
                      <th>Employer</th>
                      <th className="r">Donations</th>
                      <th className="r">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.employers.map((e, i) => (
                      <tr key={e.employer}>
                        <td className="rank">{i + 1}</td>
                        <td>{e.employer}</td>
                        <td className="r">{num(e.count)}</td>
                        <td className="r">{money(e.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">No employer data reported yet for this cycle.</p>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card
            title="Donation Size"
            footer="Individual contributions grouped by each donor's total for the cycle. Includes money raised through joint fundraising committees, so it can exceed the individual totals at left."
          >
            {f.bySize.length ? <BarList items={f.bySize} format={moneyShort} /> : <p className="note">No data reported yet.</p>}
          </Card>
          <Card
            title="Top States"
            footer={`Itemized individual contributions. ${member.state} is the member's home state.`}
          >
            {f.byState.length ? (
              <BarList
                items={f.byState.slice(0, 10).map((s) => ({
                  key: s.state,
                  label: s.state === member.state ? <strong>{STATES[s.state] ?? s.state}</strong> : STATES[s.state] ?? s.state,
                  value: s.value,
                }))}
                format={moneyShort}
              />
            ) : (
              <p className="note">No data reported yet.</p>
            )}
          </Card>
        </div>
      </div>

      <p className="note">
        Source: FEC filings for {f.committee?.name ?? "the member's principal campaign committee"}, through {date(f.coverageEnd)}.{" "}
        <a className="link" href={fecCandidateUrl(f.candidateId)} target="_blank" rel="noreferrer">
          View on FEC.gov
        </a>
      </p>
    </div>
  );
}

export default function MemberFundingPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Funding params={params} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { BarList, Card, PartyTag, Skeleton, Unavailable } from "@/components/ui";
import { getAllPresidencies, termLabel } from "@/lib/sources/presidents";
import { attempt } from "@/lib/http";
import { date, num, ordinal } from "@/lib/format";

export const metadata: Metadata = { title: "Presidents" };

async function Presidents() {
  const all = await attempt(getAllPresidencies);
  if (!all) {
    return (
      <Card title="Presidents">
        <Unavailable what="Law data" />
      </Card>
    );
  }

  return (
    <div className="cols">
      <div className="stack">
        <Card
          title="Laws Enacted by Term"
          footer="Public laws counted by the date they were enacted. Ceremonial laws include post office namings, commemorative coins and similar designations."
          flush
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>President</th>
                  <th>Term</th>
                  <th className="r">Laws</th>
                  <th className="r">Per Year</th>
                  <th className="r">Substantive</th>
                  <th className="r">Ceremonial</th>
                </tr>
              </thead>
              <tbody>
                {all.map((s) => {
                  const p = s.presidency;
                  return (
                    <tr key={p.slug}>
                      <td>
                        <Link href={`/presidents/${p.slug}`} className="who">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img className="portrait" src={s.photo ?? ""} alt="" loading="lazy" />
                          <span>
                            {p.name} <PartyTag party={p.party} />
                            <span className="sub">
                              {ordinal(p.number)} President{p.term === 2 ? " · 2nd term" : ""}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="nw">
                        {termLabel(p)}
                        <span className="sub">
                          {date(p.start)} – {p.end ? date(p.end) : "present"}
                        </span>
                      </td>
                      <td className="r">{num(s.laws)}</td>
                      <td className="r">{s.perYear.toFixed(0)}</td>
                      <td className="r">{num(s.laws - s.ceremonial)}</td>
                      <td className="r dim">{num(s.ceremonial)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <div className="stack">
        <Card title="Laws per Year in Office" footer="Total laws divided by years served in that term.">
          <BarList
            items={all.map((s) => ({
              key: s.presidency.slug,
              label: (
                <Link className="link" href={`/presidents/${s.presidency.slug}`}>
                  {s.presidency.name.split(" ").slice(-1)[0]} {termLabel(s.presidency)}
                </Link>
              ),
              value: s.perYear,
            }))}
            format={(n) => n.toFixed(0)}
          />
        </Card>
        <p className="note">Law data from Congress.gov, beginning with the 91st Congress (1969). Portraits via Wikipedia.</p>
      </div>
    </div>
  );
}

export default function PresidentsPage() {
  return (
    <main className="page">
      <h1 className="page-title">Presidents</h1>
      <Suspense fallback={<Skeleton />}>
        <Presidents />
      </Suspense>
    </main>
  );
}

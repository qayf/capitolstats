import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarList, Card, PartyTag, StatStrip, Unavailable } from "@/components/ui";
import { LawsTable } from "@/components/LawsTable";
import { getPresidency, PRESIDENCIES, termLabel, type PresidencyDetail } from "@/lib/sources/presidents";
import { billLabel, date, lawPath, num, ordinal, partyName } from "@/lib/format";

type Params = Promise<{ slug: string }>;

async function load(params: Params) {
  const { slug } = await params;
  let detail: PresidencyDetail | null = null;
  let failed = false;
  try {
    detail = await getPresidency(slug);
  } catch (err) {
    console.warn((err as Error).message);
    failed = true;
  }
  return { slug, detail, failed };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const p = PRESIDENCIES.find((x) => x.slug === slug);
  return { title: p ? `${p.name} (${termLabel(p)}) — Laws Enacted` : "President not found" };
}

async function President({ params }: { params: Params }) {
  const { slug, detail: d, failed } = await load(params);
  const p = PRESIDENCIES.find((x) => x.slug === slug);
  if (!p) notFound();
  if (!d) {
    return (
      <main className="page">
        <Card title={p.name}>
          <Unavailable what={failed ? "Law data" : "This presidency"} />
        </Card>
      </main>
    );
  }

  const otherTerms = PRESIDENCIES.filter((x) => x.number === p.number && x.slug !== p.slug);
  const sameName = PRESIDENCIES.filter((x) => x.name === p.name && x.number !== p.number);
  const years = d.days / 365.25;
  const substantive = d.laws - d.ceremonial;

  return (
    <>
      <div className="profile">
        <div className="profile-inner">
          <div className="profile-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="profile-photo" style={{ objectPosition: "top" }} src={d.photo ?? ""} alt={p.name} />
            <div>
              <h1 className="profile-name">{p.name}</h1>
              <div className="profile-meta">
                <span>
                  <PartyTag party={p.party} /> {partyName(p.party)}
                </span>
                <span className="sep">|</span>
                <span>
                  {ordinal(p.number)} President{p.term === 2 ? " · Second term" : otherTerms.length ? " · First term" : ""}
                </span>
                <span className="sep">|</span>
                <span>
                  {date(p.start)} – {p.end ? date(p.end) : "present"}
                </span>
              </div>
              {(otherTerms.length > 0 || sameName.length > 0) && (
                <div className="term-links">
                  {[...otherTerms, ...sameName].map((x) => (
                    <Link key={x.slug} href={`/presidents/${x.slug}`}>
                      {x.number !== p.number ? `${ordinal(x.number)} presidency` : x.term === 1 ? "First term" : "Second term"} ({termLabel(x)}) →
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          <StatStrip
            stats={[
              { label: "Laws Enacted", value: num(d.laws), sub: p.end ? "This term" : "So far" },
              { label: "Per Year", value: d.perYear.toFixed(0), sub: `${years.toFixed(1)} yrs in office` },
              { label: "Substantive", value: num(substantive), sub: d.laws ? `${Math.round((substantive / d.laws) * 100)}% of laws` : undefined },
              { label: "Ceremonial", value: num(d.ceremonial), sub: "Namings, coins, etc." },
              { label: "Signature Laws", value: num(d.signature.length), sub: "Highlighted below" },
              { label: "Congresses", value: num(d.congresses.length), sub: d.congresses.map((c) => ordinal(c)).join(", ") },
            ]}
          />
        </div>
      </div>
      <main className="page">
        <div className="cols">
          <div className="stack">
            {d.signature.length > 0 && (
              <Card title="Signature Legislation" footer="A selection of landmark laws from this term, shown with their official titles." flush>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Enacted</th>
                        <th>Law</th>
                        <th>Public Law</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.signature.map((l) => (
                          <tr key={l.law}>
                            <td className="nw">{date(l.date)}</td>
                            <td className="clip">
                              <strong>
                                <Link className="link" href={lawPath(l)}>
                                  {l.name}
                                </Link>
                              </strong>
                              <span className="sub">{l.title}</span>
                            </td>
                            <td className="nw">
                              P.L. {l.law}
                              <span className="sub">{billLabel(l.type, l.number)}</span>
                            </td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <LawsTable laws={d.allLaws} categories={d.byCategory.map((c) => c.label)} />
          </div>
          <div className="stack">
            <Card title="Laws by Year">
              <BarList items={d.byYear} />
            </Card>
            <Card title="By Category" footer="Categories are assigned from each law's official title, so they are approximate.">
              <BarList items={d.byCategory} />
            </Card>
            <Card title="By Congress">
              <BarList items={d.byCongress} />
            </Card>
            <p className="note">
              Laws are credited to the president in office on the date each became law, including the few enacted over a veto or
              without a signature. Data from Congress.gov.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

export default function PresidentPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="profile" style={{ height: 290 }} />}>
      <President params={params} />
    </Suspense>
  );
}

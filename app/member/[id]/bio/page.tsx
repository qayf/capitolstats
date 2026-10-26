import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Card, Skeleton } from "@/components/ui";
import { getMember } from "@/lib/sources/legislators";
import { seatLabel } from "@/lib/people";
import { STATES, date } from "@/lib/format";

type Params = Promise<{ id: string }>;

async function Bio({ params }: { params: Params }) {
  const { id } = await params;
  const m = await getMember(id);
  if (!m) notFound();

  const links = [
    { label: "Official website", href: m.website },
    { label: "Contact form", href: m.contactForm },
    { label: "Congress.gov", href: `https://www.congress.gov/member/${m.id}` },
    { label: "Biographical Directory", href: `https://bioguide.congress.gov/search/bio/${m.id}` },
    { label: "FEC filings", href: m.fecIds.length ? `https://www.fec.gov/data/candidate/${m.fecIds[m.fecIds.length - 1]}/` : null },
    { label: "GovTrack", href: m.ids.govtrack ? `https://www.govtrack.us/congress/members/${m.ids.govtrack}` : null },
    { label: "OpenSecrets", href: m.ids.opensecrets ? `https://www.opensecrets.org/members-of-congress/summary?cid=${m.ids.opensecrets}` : null },
    { label: "Ballotpedia", href: m.ids.ballotpedia ? `https://ballotpedia.org/${encodeURIComponent(m.ids.ballotpedia.replace(/ /g, "_"))}` : null },
    { label: "Wikipedia", href: m.ids.wikipedia ? `https://en.wikipedia.org/wiki/${encodeURIComponent(m.ids.wikipedia.replace(/ /g, "_"))}` : null },
  ].filter((l): l is { label: string; href: string } => !!l.href);

  const terms = [...m.terms].reverse();

  return (
    <div className="cols">
      <div className="stack">
        <Card title="Terms Served" aside={`${terms.length} terms`} flush>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Chamber</th>
                  <th>Seat</th>
                  <th>Party</th>
                  <th>Start</th>
                  <th>End</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.start + t.chamber}>
                    <td>{t.chamber === "senate" ? "Senate" : "House"}</td>
                    <td>{t.chamber === "senate" ? STATES[t.state] ?? t.state : seatLabel(t)}</td>
                    <td>{t.party}</td>
                    <td className="nw">{date(t.start)}</td>
                    <td className="nw">{date(t.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Committee Assignments" flush>
          {m.committees.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Committee</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {m.committees.map((c) => (
                    <tr key={(c.parent ?? "") + c.name}>
                      <td>
                        {c.parent ? (
                          <>
                            <span className="dim">Subcommittee:</span> {c.name}
                            <span className="sub">{c.parent}</span>
                          </>
                        ) : (
                          <strong>{c.name}</strong>
                        )}
                      </td>
                      <td className="nw">{c.title ?? "Member"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No committee assignments listed.</p>
          )}
        </Card>
      </div>
      <div className="stack">
        <Card title="Personal">
          <ul className="bars">
            <li className="bar-row">
              <span>Born</span>
              <span className="v">{date(m.birthday)}</span>
            </li>
            <li className="bar-row">
              <span>Current term ends</span>
              <span className="v">{date(m.termEnd)}</span>
            </li>
            {m.senateClass && (
              <li className="bar-row">
                <span>Senate class</span>
                <span className="v">{["", "I", "II", "III"][m.senateClass]}</span>
              </li>
            )}
          </ul>
        </Card>
        <Card title="Contact">
          <ul className="bars">
            {m.office && (
              <li>
                <div className="sub">Office</div>
                {m.office}
              </li>
            )}
            {m.phone && (
              <li>
                <div className="sub">Phone</div>
                <a className="link" href={`tel:${m.phone}`}>
                  {m.phone}
                </a>
              </li>
            )}
          </ul>
        </Card>
        <Card title="Elsewhere">
          <ul className="bars">
            {links.map((l) => (
              <li key={l.label}>
                <a className="link" href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default function MemberBioPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Bio params={params} />
    </Suspense>
  );
}

import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { ProfileTabs } from "@/components/ProfileTabs";
import { PartyTag, StatStrip } from "@/components/ui";
import { getProfileSummary } from "@/lib/profile";
import { photoUrl, seatLabel, titleFor } from "@/lib/people";
import { cycleLabel, getPeriod } from "@/lib/stats";
import { STATES, date, moneyShort, num, partyName, pct } from "@/lib/format";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const summary = await getProfileSummary(id);
  return { title: summary ? `${summary.member.name} — Stats` : "Member not found" };
}

async function ProfileHeader({ params }: { params: Params }) {
  const { id } = await params;
  const [summary, { cycle }] = await Promise.all([getProfileSummary(id), getPeriod()]);
  if (!summary) notFound();
  const { member: m, attendance, raised, detail } = summary;

  const leadership = detail?.leadership.filter((l) => l.congress === Math.max(...detail.leadership.map((x) => x.congress)));

  return (
    <div className="profile">
      <div className="profile-inner">
        <div className="profile-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="profile-photo" src={photoUrl(m.id)} alt={m.name} />
          <div>
            <h1 className="profile-name">{m.name}</h1>
            {leadership && leadership.length > 0 && <div className="leadership">{leadership.map((l) => l.type).join(" · ")}</div>}
            <div className="profile-meta">
              <span>
                <PartyTag party={m.party} /> {partyName(m.party)}
              </span>
              <span className="sep">|</span>
              <span>
                {titleFor(m)}, {m.chamber === "senate" ? STATES[m.state] : seatLabel(m)}
              </span>
              <span className="sep">|</span>
              <span>In office since {date(m.inChamberSince)}</span>
              {m.age != null && (
                <>
                  <span className="sep">|</span>
                  <span>Age {m.age}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <StatStrip
          stats={[
            { label: "Yrs in Congress", value: m.yearsServed.toFixed(1), sub: `Since ${m.inCongressSince.slice(0, 4)}` },
            { label: "Votes Cast", value: pct(attendance?.rate), sub: attendance ? `${num(attendance.eligible)} roll calls` : "No votes yet" },
            { label: "Missed Votes", value: num(attendance?.missed), sub: "This Congress" },
            { label: "Bills Sponsored", value: num(detail?.sponsored), sub: "Career" },
            { label: "Cosponsored", value: num(detail?.cosponsored), sub: "Career" },
            { label: "Raised", value: moneyShort(raised), sub: `${cycleLabel(cycle)} cycle` },
          ]}
        />
        <ProfileTabs id={m.id} />
      </div>
    </div>
  );
}

export default function MemberLayout({ children, params }: { children: ReactNode; params: Params }) {
  return (
    <>
      <Suspense fallback={<div className="profile" style={{ height: 290 }} />}>
        <ProfileHeader params={params} />
      </Suspense>
      <main className="page">{children}</main>
    </>
  );
}

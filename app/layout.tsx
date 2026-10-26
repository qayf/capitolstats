import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Roboto_Condensed } from "next/font/google";
import { NavLinks, NavLinksFallback } from "@/components/NavLinks";
import { Search, type SearchEntry } from "@/components/Search";
import { Scoreboard } from "@/components/Scoreboard";
import { getMembers } from "@/lib/sources/legislators";
import { seatLabel } from "@/lib/people";
import "./globals.css";

const condensed = Roboto_Condensed({ subsets: ["latin"], weight: ["700", "800"], style: ["normal", "italic"], variable: "--font-cond" });

export const metadata: Metadata = {
  title: { default: "Capitol Stats — Congress by the numbers", template: "%s | Capitol Stats" },
  description: "Floor votes, sponsored bills and campaign funding for every member of the U.S. Congress.",
};

async function SearchLoader() {
  const members = await getMembers().catch(() => []);
  const entries: SearchEntry[] = members.map((m) => ({ id: m.id, name: m.name, seat: seatLabel(m), party: m.party }));
  return <Search entries={entries} />;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={condensed.variable}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              Capitol<span>Stats</span>
            </Link>
            <Suspense fallback={<NavLinksFallback className="nav" />}>
              <NavLinks className="nav" />
            </Suspense>
            <Suspense fallback={<div className="search" />}>
              <SearchLoader />
            </Suspense>
          </div>
          <Suspense fallback={<NavLinksFallback className="mobile-nav" />}>
            <NavLinks className="mobile-nav" />
          </Suspense>
        </header>
        <Suspense fallback={null}>
          <Scoreboard />
        </Suspense>
        {children}
        <footer className="site">
          Data from <a href="https://www.congress.gov/">Congress.gov</a>,{" "}
          <a href="https://www.fec.gov/data/">the Federal Election Commission</a>,{" "}
          <a href="https://voteview.com/">Voteview</a> (House Clerk and Senate roll calls) and the{" "}
          <a href="https://github.com/unitedstates/congress-legislators">congress-legislators</a> project. Capitol Stats shows
          what members vote on and whether they were present, not how they voted.
        </footer>
      </body>
    </html>
  );
}

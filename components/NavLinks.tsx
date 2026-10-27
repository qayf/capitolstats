"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/members", label: "Members" },
  { href: "/members?chamber=senate", label: "Senate" },
  { href: "/members?chamber=house", label: "House" },
  { href: "/court", label: "Supreme Court" },
  { href: "/votes", label: "Floor Votes" },
];

export function NavLinks({ className }: { className: string }) {
  const pathname = usePathname();
  const chamber = useSearchParams().get("chamber");

  function isActive(href: string) {
    const [path, query] = href.split("?");
    if (path === "/") return pathname === "/";
    if (path === "/court") return pathname.startsWith("/court");
    if (path !== pathname) return false;
    const wanted = query ? new URLSearchParams(query).get("chamber") : null;
    return wanted === chamber;
  }

  return (
    <nav className={className}>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function NavLinksFallback({ className }: { className: string }) {
  return (
    <nav className={className}>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

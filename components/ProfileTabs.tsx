"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "/votes", label: "Votes" },
  { slug: "/legislation", label: "Legislation" },
  { slug: "/funding", label: "Funding" },
  { slug: "/bio", label: "Bio" },
];

export function ProfileTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/member/${id}`;
  return (
    <nav className="tabs">
      {TABS.map((t) => {
        const href = base + t.slug;
        return (
          <Link key={t.label} href={href} className={pathname === href ? "active" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

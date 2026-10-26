"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MemberRow } from "@/lib/stats";
import { MemberLink } from "./ui";
import { STATES, moneyShort, pct } from "@/lib/format";

type SortKey = "name" | "seat" | "since" | "years" | "participation" | "missed" | "raised";

const COLUMNS: { key: SortKey; label: string; right?: boolean; desc?: boolean }[] = [
  { key: "name", label: "Member" },
  { key: "seat", label: "Seat" },
  { key: "since", label: "In Chamber Since", right: true },
  { key: "years", label: "Yrs in Congress", right: true, desc: true },
  { key: "participation", label: "Votes Cast %", right: true, desc: true },
  { key: "missed", label: "Missed", right: true, desc: true },
  { key: "raised", label: "Raised", right: true, desc: true },
];

function value(r: MemberRow, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return r.sortName;
    case "seat":
      return r.seat;
    default:
      return r[key];
  }
}

export function MembersTable({ rows, cycleLabel }: { rows: MemberRow[]; cycleLabel: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const chamber = params.get("chamber") ?? "all";
  const [party, setParty] = useState("all");
  const [state, setState] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });

  function setChamber(c: string) {
    router.replace(c === "all" ? pathname : `${pathname}?chamber=${c}`, { scroll: false });
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (chamber === "all" || r.chamber === chamber) &&
        (party === "all" || r.party === party) &&
        (state === "all" || r.state === state) &&
        (!q || r.name.toLowerCase().includes(q)),
    );
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      const av = value(a, sort.key);
      const bv = value(b, sort.key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // missing values always sink
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [rows, chamber, party, state, query, sort]);

  const states = useMemo(() => [...new Set(rows.map((r) => r.state))].sort(), [rows]);

  return (
    <section className="card">
      <div className="filters">
        <div className="seg" role="group" aria-label="Chamber">
          {[
            ["all", "All"],
            ["senate", "Senate"],
            ["house", "House"],
          ].map(([v, l]) => (
            <button key={v} className={chamber === v ? "on" : undefined} onClick={() => setChamber(v)}>
              {l}
            </button>
          ))}
        </div>
        <select value={party} onChange={(e) => setParty(e.target.value)} aria-label="Party">
          <option value="all">All parties</option>
          <option value="D">Democrats</option>
          <option value="R">Republicans</option>
          <option value="I">Independents</option>
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
          <option value="all">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {STATES[s] ?? s}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Filter by name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter by name" />
        <span className="count">{shown.length} members</span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`sortable ${c.right ? "r" : ""} ${sort.key === c.key ? "sorted" : ""}`}
                  onClick={() =>
                    setSort((s) => (s.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: !!c.desc }))
                  }
                  aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}
                >
                  {c.key === "raised" ? `Raised ${cycleLabel}` : c.label}
                  {sort.key === c.key ? (sort.desc ? " ▾" : " ▴") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>
                  <MemberLink id={r.id} name={r.name} party={r.party} />
                </td>
                <td className="nw">
                  {r.seat}
                  <span className="sub">{r.chamber === "senate" ? "Senate" : "House"}</span>
                </td>
                <td className="r">{r.since.slice(0, 4)}</td>
                <td className="r">{r.years.toFixed(1)}</td>
                <td className="r">{pct(r.participation)}</td>
                <td className="r">{r.missed ?? "—"}</td>
                <td className="r">{moneyShort(r.raised)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

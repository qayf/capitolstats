"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Law } from "@/lib/sources/presidents";
import { billLabel, date, billPath } from "@/lib/format";

const CEREMONIAL = new Set(["Naming & designations", "Commemorations"]);
const PAGE = 100;

export function LawsTable({ laws, categories }: { laws: Law[]; categories: string[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [hideCeremonial, setHideCeremonial] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return laws.filter(
      (l) =>
        (category === "all" || l.category === category) &&
        (!hideCeremonial || !CEREMONIAL.has(l.category)) &&
        (!q || l.title.toLowerCase().includes(q) || `p.l. ${l.law}`.includes(q)),
    );
  }, [laws, query, category, hideCeremonial]);

  return (
    <section className="card">
      <header className="card-head">
        <h2>All Laws Enacted</h2>
        <div className="aside">{laws.length.toLocaleString("en-US")} total</div>
      </header>
      <div className="filters">
        <input
          type="search"
          placeholder="Search titles or P.L. number"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          aria-label="Search laws"
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setShown(PAGE);
          }}
          aria-label="Category"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={hideCeremonial} onChange={(e) => setHideCeremonial(e.target.checked)} /> Hide ceremonial
        </label>
        <span className="count">{filtered.length.toLocaleString("en-US")} laws</span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Enacted</th>
              <th>Public Law</th>
              <th>Title</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map((l) => (
                <tr key={l.law}>
                  <td className="nw">{date(l.date)}</td>
                  <td className="nw">
                    P.L. {l.law}
                    <span className="sub">{billLabel(l.type, l.number)}</span>
                  </td>
                  <td className="clip">
                    <Link className="link" href={billPath(l)}>
                      {l.title}
                    </Link>
                  </td>
                  <td className="nw dim">{l.category}</td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > shown && (
        <div className="card-foot">
          <button className="more" onClick={() => setShown((s) => s + PAGE)}>
            Show {Math.min(PAGE, filtered.length - shown)} more
          </button>
        </div>
      )}
    </section>
  );
}

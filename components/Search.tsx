"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface SearchEntry {
  id: string;
  name: string;
  seat: string;
  party: string;
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function Search({ entries }: { entries: SearchEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    const terms = q.split(/\s+/);
    return entries
      .map((e) => {
        const hay = normalize(`${e.name} ${e.seat}`);
        if (!terms.every((t) => hay.includes(t))) return null;
        const words = normalize(e.name).split(/\s+/);
        const score = words.some((w) => w.startsWith(terms[0])) ? 0 : 1;
        return { e, score };
      })
      .filter((r): r is { e: SearchEntry; score: number } => r !== null)
      .sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name))
      .slice(0, 8)
      .map((r) => r.e);
  }, [entries, query]);

  function go(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/member/${id}`);
  }

  return (
    <div
      className="search"
      ref={box}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        type="search"
        placeholder="Search members of Congress"
        aria-label="Search members of Congress"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSel(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(s + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(s - 1, 0));
          } else if (e.key === "Enter" && results[sel]) {
            go(results[sel].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={r.id} className={i === sel ? "sel" : undefined}>
              <Link
                href={`/member/${r.id}`}
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>{r.name}</span>
                <span className="meta">
                  {r.party} · {r.seat}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

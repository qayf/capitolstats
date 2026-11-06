"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BillProgress } from "./BillProgress";
import { originOf, STAGE_LABELS, STAGES, type Stage } from "@/lib/billStage";
import type { PipelineBill } from "@/lib/sources/pipeline";
import { billLabel, billPath, date } from "@/lib/format";

const PAGE = 100;

export function BillRows({ bills }: { bills: PipelineBill[] }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Bill</th>
            <th>Title</th>
            <th>Progress</th>
            <th>Latest Action</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => (
            <tr key={`${b.type}-${b.number}`}>
              <td className="nw">
                <Link className="link" href={billPath(b)}>
                  {billLabel(b.type, b.number)}
                </Link>
              </td>
              <td className="clip">
                <Link href={billPath(b)}>{b.title}</Link>
              </td>
              <td className="nw">
                <BillProgress stage={b.stage} type={b.type} compact />
                <span className="sub">{STAGE_LABELS[b.stage]}</span>
              </td>
              <td className="clip">
                <span className="nw">{date(b.action.date)}</span>
                <span className="sub">{b.action.text}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BillPipeline({ bills }: { bills: PipelineBill[] }) {
  const [stage, setStage] = useState<Stage | "all">("all");
  const [chamber, setChamber] = useState("all");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(
    () => bills.filter((b) => (stage === "all" || b.stage === stage) && (chamber === "all" || originOf(b.type) === chamber)),
    [bills, stage, chamber],
  );
  const stages = STAGES.filter((s) => bills.some((b) => b.stage === s));

  return (
    <section className="card">
      <header className="card-head">
        <h2>Bills on the Move</h2>
        <div className="aside">Past committee</div>
      </header>
      <div className="filters">
        <select
          value={stage}
          aria-label="Stage"
          onChange={(e) => {
            setStage(e.target.value as Stage | "all");
            setShown(PAGE);
          }}
        >
          <option value="all">All stages</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={chamber}
          aria-label="Chamber the bill started in"
          onChange={(e) => {
            setChamber(e.target.value);
            setShown(PAGE);
          }}
        >
          <option value="all">Started in either chamber</option>
          <option value="House">Started in the House</option>
          <option value="Senate">Started in the Senate</option>
        </select>
        <span className="count">{filtered.length.toLocaleString("en-US")} bills</span>
      </div>
      <BillRows bills={filtered.slice(0, shown)} />
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

export function BillSearch() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ query: string; results: PipelineBill[]; failed: boolean } | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/bills/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .then((data: { results: PipelineBill[] }) => setState({ query: q, results: data.results, failed: false }))
        .catch((err: Error) => {
          if (err.name !== "AbortError") setState({ query: q, results: [], failed: true });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const current = q.length >= 2 && state?.query === q ? state : null;

  return (
    <section className="card">
      <header className="card-head">
        <h2>Find Any Bill</h2>
        <div className="aside">Including those in committee</div>
      </header>
      <div className="filters">
        <input
          type="search"
          placeholder="Bill number or title words, e.g. H.R. 7008"
          aria-label="Search bills"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {q.length >= 2 && !current && <span className="count loading">Searching</span>}
        {current && !current.failed && <span className="count">{current.results.length === 25 ? "First 25 matches" : `${current.results.length} matches`}</span>}
      </div>
      {current?.failed && <p className="empty">Search is temporarily unavailable. Try again shortly.</p>}
      {current && !current.failed && current.results.length === 0 && <p className="empty">No bills match that search.</p>}
      {current && current.results.length > 0 && <BillRows bills={current.results} />}
    </section>
  );
}

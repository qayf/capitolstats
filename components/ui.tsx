import type { ReactNode } from "react";
import Link from "next/link";
import type { Party } from "@/lib/sources/legislators";
import { photoUrl } from "@/lib/people";
import { partyName } from "@/lib/format";

export function Card({
  title,
  aside,
  footer,
  children,
  flush = false,
}: {
  title: string;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>{title}</h2>
        {aside && <div className="aside">{aside}</div>}
      </header>
      {flush ? children : <div className="card-body">{children}</div>}
      {footer && <div className="card-foot">{footer}</div>}
    </section>
  );
}

export function PartyTag({ party }: { party: Party }) {
  return (
    <span className={`party ${party}`} title={partyName(party)}>
      {party}
    </span>
  );
}

export function Thumb({ id }: { id: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="thumb" src={photoUrl(id)} alt="" loading="lazy" />;
}

export function MemberLink({ id, name, sub, party }: { id: string; name: string; sub?: string; party?: Party }) {
  return (
    <Link href={`/member/${id}`} className="who">
      <Thumb id={id} />
      <span>
        {name} {party && <PartyTag party={party} />}
        {sub && <span className="sub">{sub}</span>}
      </span>
    </Link>
  );
}

export function BarList({
  items,
  format = (n) => n.toLocaleString("en-US"),
}: {
  items: { label: ReactNode; value: number; key?: string }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="bars">
      {items.map((item, i) => (
        <li key={item.key ?? i}>
          <div className="bar-row">
            <span>{item.label}</span>
            <span className="v">{format(item.value)}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const STACK_COLORS = ["#13294b", "#2f5d8a", "#6f97c0", "#adc4db", "#8c8c8c", "#bdbdbd", "#dedede"];

export function StackedBar({
  items,
  format,
}: {
  items: { label: string; value: number }[];
  format: (n: number) => string;
}) {
  const total = items.reduce((s, i) => s + Math.max(i.value, 0), 0);
  if (total <= 0) return <p className="note">No receipts reported for this period.</p>;
  return (
    <>
      <div className="stacked" role="img" aria-label="Share of receipts by source">
        {items.map((item, i) =>
          item.value > 0 ? (
            <div
              key={item.label}
              style={{ width: `${(item.value / total) * 100}%`, background: STACK_COLORS[i % STACK_COLORS.length] }}
              title={`${item.label}: ${format(item.value)}`}
            />
          ) : null,
        )}
      </div>
      <ul className="legend">
        {items.map((item, i) => (
          <li key={item.label}>
            <span className="swatch" style={{ background: STACK_COLORS[i % STACK_COLORS.length] }} />
            {item.label}
            <span className="v">{format(item.value)}</span>
            <span className="p">{((Math.max(item.value, 0) / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function StatStrip({ stats }: { stats: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="stats">
      {stats.map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat-label">{s.label}</div>
          <div className="stat-value">{s.value}</div>
          {s.sub && <div className="stat-sub">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function Unavailable({ what }: { what: string }) {
  return <p className="empty">{what} is temporarily unavailable. Try again shortly.</p>;
}

export function Skeleton() {
  return <div className="card skeleton" aria-busy="true" />;
}

export function JusticeLink({ id, name, photo, sub }: { id: string; name: string; photo: string | null; sub?: string }) {
  return (
    <Link href={`/court/justice/${id}`} className="who">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="thumb" src={photo ?? ""} alt="" loading="lazy" />
      <span>
        {name}
        {sub && <span className="sub">{sub}</span>}
      </span>
    </Link>
  );
}

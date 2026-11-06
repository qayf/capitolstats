"use client";

import { useMemo, useState } from "react";
import { MemberLink } from "./ui";
import type { Party } from "@/lib/sources/legislators";
import mapData from "@/lib/data/us-map.json";

export interface MapMember {
  id: string;
  name: string;
  party: Party;
  state: string;
  chamber: "senate" | "house";
  sub: string;
  district: number;
}

// Not on the map's projection, so these get buttons instead.
const OFF_MAP = ["DC", "PR", "GU", "VI", "AS", "MP"];

export function StateMap({ members, stateNames }: { members: MapMember[]; stateNames: Record<string, string> }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const codeByName = useMemo(() => new Map(Object.entries(stateNames).map(([code, name]) => [name, code])), [stateNames]);

  // A pinned state stays put, so the mouse can cross other states to reach the list.
  const active = pinned ?? hovered;
  const senators = members.filter((m) => m.state === active && m.chamber === "senate");
  const house = members.filter((m) => m.state === active && m.chamber === "house").sort((a, b) => a.district - b.district);

  const toggle = (code: string) => setPinned((p) => (p === code ? null : code));

  return (
    <div className="map-layout">
      <section className="card map-card">
        <svg className="us-map" viewBox={`0 0 ${mapData.width} ${mapData.height}`} role="group" aria-label="Map of U.S. states">
          {mapData.states.map((s) => {
            const code = codeByName.get(s.name);
            if (!code) return null;
            return (
              <path
                key={code}
                d={s.d}
                className={code === active ? "active" : undefined}
                role="button"
                tabIndex={0}
                aria-label={s.name}
                aria-pressed={code === pinned}
                onMouseEnter={() => setHovered(code)}
                onFocus={() => setHovered(code)}
                onClick={() => toggle(code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(code);
                  }
                }}
              >
                <title>{s.name}</title>
              </path>
            );
          })}
        </svg>
        <div className="map-others">
          <span className="note">Also:</span>
          {OFF_MAP.map((code) => (
            <button
              key={code}
              className={code === active ? "active" : undefined}
              aria-pressed={code === pinned}
              onMouseEnter={() => setHovered(code)}
              onFocus={() => setHovered(code)}
              onClick={() => toggle(code)}
            >
              {stateNames[code]}
            </button>
          ))}
        </div>
        <p className="note map-hint">Hover over or tap a state to see its delegation. Click to keep the list open while you choose someone.</p>
      </section>

      <section className="card map-panel" aria-live="polite">
        <header className="card-head">
          <h2>{active ? stateNames[active] : "Choose a State"}</h2>
          {pinned && (
            <div className="aside">
              <button className="clear" onClick={() => setPinned(null)}>
                Clear
              </button>
            </div>
          )}
        </header>
        {!active && <p className="empty">Senators and representatives will appear here.</p>}
        {senators.length > 0 && (
          <>
            <h3 className="map-group">Senators</h3>
            <MemberTable list={senators} />
          </>
        )}
        {house.length > 0 && (
          <>
            <h3 className="map-group">{OFF_MAP.includes(active ?? "") ? "Delegate" : `Representatives · ${house.length}`}</h3>
            <MemberTable list={house} />
          </>
        )}
        {active && senators.length === 0 && house.length === 0 && <p className="empty">No sitting members listed.</p>}
      </section>
    </div>
  );
}

function MemberTable({ list }: { list: MapMember[] }) {
  return (
    <table className="data">
      <tbody>
        {list.map((m) => (
          <tr key={m.id}>
            <td>
              <MemberLink id={m.id} name={m.name} party={m.party} sub={m.sub} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

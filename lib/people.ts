// Display helpers that are safe to use from client components.
import type { Chamber } from "./sources/legislators";

export function photoUrl(id: string) {
  return `https://unitedstates.github.io/images/congress/225x275/${id}.jpg`;
}

export function seatLabel(m: { chamber: Chamber; state: string; district: number | null }) {
  if (m.chamber === "senate") return m.state;
  if (m.district === 0) return `${m.state}-AL`;
  return `${m.state}-${m.district}`;
}

export function titleFor(m: { chamber: Chamber; state: string }) {
  if (m.chamber === "senate") return "U.S. Senator";
  if (m.state === "PR") return "Resident Commissioner";
  return ["DC", "GU", "VI", "AS", "MP"].includes(m.state) ? "Delegate" : "U.S. Representative";
}

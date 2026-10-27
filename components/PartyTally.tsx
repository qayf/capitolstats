import { Card, PartyTag } from "./ui";
import type { MemberPosition, Position } from "@/lib/sources/votes";
import { partyName } from "@/lib/format";

export const GROUPS: { key: Position; label: string }[] = [
  { key: "yea", label: "Yea" },
  { key: "nay", label: "Nay" },
  { key: "present", label: "Present" },
  { key: "notVoting", label: "Not Voting" },
];

export function PartyTally({ positions }: { positions: MemberPosition[] }) {
  const parties = (["D", "R", "I"] as const).filter((p) => positions.some((x) => x.party === p));
  const count = (party: string, pos: Position) => positions.filter((x) => x.party === party && x.position === pos).length;
  return (
    <Card title="Tally by Party" flush>
      <table className="data">
        <thead>
          <tr>
            <th>Party</th>
            <th className="r">Yea</th>
            <th className="r">Nay</th>
            <th className="r">Pres.</th>
            <th className="r">NV</th>
          </tr>
        </thead>
        <tbody>
          {parties.map((p) => (
            <tr key={p}>
              <td>
                <PartyTag party={p} /> {partyName(p)}s
              </td>
              {GROUPS.map((g) => (
                <td key={g.key} className="r">
                  {count(p, g.key)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            {GROUPS.map((g) => (
              <td key={g.key} className="r">
                {positions.filter((x) => x.position === g.key).length}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

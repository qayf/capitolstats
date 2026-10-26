export const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AS: "American Samoa", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", GU: "Guam", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", MP: "Northern Mariana Islands", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VI: "U.S. Virgin Islands", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function money(n: number | null | undefined) {
  return n == null ? "—" : usd0.format(n);
}

// $1.2M / $845K style, for stat strips and leaderboards
export function moneyShort(n: number | null | undefined) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

export function pct(n: number | null | undefined, digits = 1) {
  return n == null ? "—" : `${(n * 100).toFixed(digits)}%`;
}

export function num(n: number | null | undefined) {
  return n == null ? "—" : n.toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-09-30" -> "Sep 30, 2026". Parsed by hand to avoid time zone shifts.
export function date(iso: string | null | undefined, withYear = true) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const BILL_TYPES: Record<string, { label: string; slug: string }> = {
  HR: { label: "H.R.", slug: "house-bill" },
  S: { label: "S.", slug: "senate-bill" },
  HRES: { label: "H.Res.", slug: "house-resolution" },
  SRES: { label: "S.Res.", slug: "senate-resolution" },
  HJRES: { label: "H.J.Res.", slug: "house-joint-resolution" },
  SJRES: { label: "S.J.Res.", slug: "senate-joint-resolution" },
  HCONRES: { label: "H.Con.Res.", slug: "house-concurrent-resolution" },
  SCONRES: { label: "S.Con.Res.", slug: "senate-concurrent-resolution" },
};

export function billLabel(type: string, number: string | number) {
  const t = BILL_TYPES[type.toUpperCase()];
  return t ? `${t.label} ${number}` : `${type} ${number}`;
}

export function billUrl(congress: number, type: string, number: string | number) {
  const t = BILL_TYPES[type.toUpperCase()];
  if (!t) return null;
  return `https://www.congress.gov/bill/${ordinal(congress)}-congress/${t.slug}/${number}`;
}

// Voteview stores the measure as one token, e.g. "HR1234", "SJRES12", "PN1129".
export function parseMeasure(code: string, congress: number) {
  const m = /^([A-Z]+)(\d+)$/.exec(code.trim().toUpperCase());
  if (!m) return { label: code || "—", url: null as string | null };
  const [, type, number] = m;
  if (type === "PN") {
    return { label: `PN ${number}`, url: `https://www.congress.gov/nomination/${ordinal(congress)}-congress/${number}` };
  }
  if (type === "HAMDT" || type === "SAMDT") {
    return { label: `${type === "HAMDT" ? "H.Amdt." : "S.Amdt."} ${number}`, url: null };
  }
  return { label: billLabel(type, number), url: billUrl(congress, type, number) };
}

export function partyName(p: string) {
  return p === "D" ? "Democrat" : p === "R" ? "Republican" : "Independent";
}

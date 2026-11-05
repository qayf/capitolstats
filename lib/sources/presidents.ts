import { cacheLife } from "next/cache";
import { API_KEY, DAY, fetchJSON, HOUR, mapLimit } from "../http";
import { currentCongress } from "./votes";
import { ordinal } from "../format";
import savedStats from "../data/presidency-stats.json";

// Laws enacted during each presidential term. Public laws come from the
// Congress.gov API (coverage starts with the 91st Congress, 1969) and are
// assigned to whoever was president on the date they became law.

export interface Presidency {
  slug: string;
  name: string;
  number: number;
  party: "D" | "R";
  start: string;
  end: string | null; // null = in office
  term: number; // 1 or 2
  wiki: string; // Wikipedia page title, for the portrait
  signature: SignatureLaw[];
}

// Landmark laws, matched against the data by bill ID or title so a wrong entry
// simply doesn't show. Only laws that are found are displayed.
interface SignatureLaw {
  name: string;
  bill?: string; // "115-HR-1"
  title?: string; // case-insensitive substring of the official title
}

const P = (
  slug: string,
  name: string,
  number: number,
  party: "D" | "R",
  term: number,
  start: string,
  end: string | null,
  wiki: string,
  signature: SignatureLaw[],
): Presidency => ({ slug, name, number, party, term, start, end, wiki, signature });

export const PRESIDENCIES: Presidency[] = [
  P("trump-2", "Donald Trump", 47, "R", 2, "2025-01-20", null, "Donald_Trump", [
    { name: "Laken Riley Act", bill: "119-S-5" },
    { name: "One Big Beautiful Bill Act", bill: "119-HR-1" },
    { name: "GENIUS Act", bill: "119-S-1582" },
    { name: "TAKE IT DOWN Act", bill: "119-S-146" },
  ]),
  P("biden", "Joe Biden", 46, "D", 1, "2021-01-20", "2025-01-20", "Joe_Biden", [
    { name: "American Rescue Plan Act", bill: "117-HR-1319" },
    { name: "Infrastructure Investment and Jobs Act", bill: "117-HR-3684" },
    { name: "Bipartisan Safer Communities Act", bill: "117-S-2938" },
    { name: "CHIPS and Science Act", bill: "117-HR-4346" },
    { name: "Inflation Reduction Act", bill: "117-HR-5376" },
    { name: "Honoring our PACT Act", bill: "117-S-3373" },
    { name: "Respect for Marriage Act", bill: "117-HR-8404" },
    { name: "Fiscal Responsibility Act", bill: "118-HR-3746" },
  ]),
  P("trump-1", "Donald Trump", 45, "R", 1, "2017-01-20", "2021-01-20", "Donald_Trump", [
    { name: "Tax Cuts and Jobs Act", bill: "115-HR-1" },
    { name: "Right to Try Act", bill: "115-S-204" },
    { name: "First Step Act", bill: "115-S-756" },
    { name: "CARES Act", bill: "116-HR-748" },
    { name: "USMCA Implementation Act", bill: "116-HR-5430" },
    { name: "Great American Outdoors Act", bill: "116-HR-1957" },
  ]),
  P("obama-2", "Barack Obama", 44, "D", 2, "2013-01-20", "2017-01-20", "Barack_Obama", [
    { name: "USA FREEDOM Act", title: "USA FREEDOM Act" },
    { name: "Every Student Succeeds Act", title: "Every Student Succeeds Act" },
    { name: "FAST Act", bill: "114-HR-22" },
    { name: "Bipartisan Budget Act of 2015", title: "Bipartisan Budget Act of 2015" },
    { name: "21st Century Cures Act", title: "21st Century Cures Act" },
  ]),
  P("obama-1", "Barack Obama", 44, "D", 1, "2009-01-20", "2013-01-20", "Barack_Obama", [
    { name: "Lilly Ledbetter Fair Pay Act", bill: "111-S-181" },
    { name: "American Recovery and Reinvestment Act", bill: "111-HR-1" },
    { name: "Affordable Care Act", bill: "111-HR-3590" },
    { name: "Dodd-Frank Wall Street Reform Act", bill: "111-HR-4173" },
    { name: "Budget Control Act of 2011", bill: "112-S-365" },
  ]),
  P("bush-43-2", "George W. Bush", 43, "R", 2, "2005-01-20", "2009-01-20", "George_W._Bush", [
    { name: "Energy Policy Act of 2005", bill: "109-HR-6" },
    { name: "Pension Protection Act of 2006", title: "Pension Protection Act of 2006" },
    { name: "Energy Independence and Security Act", title: "Energy Independence and Security Act of 2007" },
    { name: "Emergency Economic Stabilization Act", bill: "110-HR-1424" },
  ]),
  P("bush-43-1", "George W. Bush", 43, "R", 1, "2001-01-20", "2005-01-20", "George_W._Bush", [
    { name: "Economic Growth and Tax Relief Reconciliation Act", title: "Economic Growth and Tax Relief Reconciliation Act of 2001" },
    { name: "Authorization for Use of Military Force (2001)", bill: "107-SJRES-23" },
    { name: "USA PATRIOT Act", title: "USA PATRIOT" },
    { name: "No Child Left Behind Act", title: "No Child Left Behind Act" },
    { name: "Sarbanes-Oxley Act", title: "Sarbanes-Oxley Act" },
    { name: "Homeland Security Act", title: "Homeland Security Act of 2002" },
    { name: "Medicare Prescription Drug Act", title: "Medicare Prescription Drug, Improvement, and Modernization Act" },
  ]),
  P("clinton-2", "Bill Clinton", 42, "D", 2, "1997-01-20", "2001-01-20", "Bill_Clinton", [
    { name: "Balanced Budget Act of 1997", title: "Balanced Budget Act of 1997" },
    { name: "Taxpayer Relief Act of 1997", title: "Taxpayer Relief Act of 1997" },
    { name: "Digital Millennium Copyright Act", title: "Digital Millennium Copyright Act" },
    { name: "Gramm-Leach-Bliley Act", title: "Gramm-Leach-Bliley Act" },
  ]),
  P("clinton-1", "Bill Clinton", 42, "D", 1, "1993-01-20", "1997-01-20", "Bill_Clinton", [
    { name: "Family and Medical Leave Act", title: "Family and Medical Leave Act of 1993" },
    { name: "Omnibus Budget Reconciliation Act of 1993", bill: "103-HR-2264" },
    { name: "NAFTA Implementation Act", title: "North American Free Trade Agreement Implementation Act" },
    { name: "Violent Crime Control and Law Enforcement Act", title: "Violent Crime Control and Law Enforcement Act of 1994" },
    { name: "Telecommunications Act of 1996", title: "Telecommunications Act of 1996" },
    { name: "HIPAA", title: "Health Insurance Portability and Accountability Act of 1996" },
    { name: "Welfare reform (PRWORA)", bill: "104-HR-3734" },
  ]),
  P("bush-41", "George H. W. Bush", 41, "R", 1, "1989-01-20", "1993-01-20", "George_H._W._Bush", [
    { name: "Americans with Disabilities Act", title: "Americans with Disabilities Act of 1990" },
    { name: "Clean Air Act Amendments of 1990", title: "Clean Air Act Amendments of 1990" },
    { name: "Omnibus Budget Reconciliation Act of 1990", title: "Omnibus Budget Reconciliation Act of 1990" },
    { name: "Civil Rights Act of 1991", title: "Civil Rights Act of 1991" },
  ]),
  P("reagan-2", "Ronald Reagan", 40, "R", 2, "1985-01-20", "1989-01-20", "Ronald_Reagan", [
    { name: "Tax Reform Act of 1986", title: "Tax Reform Act of 1986" },
    { name: "Immigration Reform and Control Act", title: "Immigration Reform and Control Act of 1986" },
    { name: "Goldwater-Nichols Act", title: "Goldwater-Nichols" },
    { name: "Anti-Drug Abuse Act of 1986", bill: "99-HR-5484" },
    { name: "Civil Liberties Act of 1988", bill: "100-HR-442" },
  ]),
  P("reagan-1", "Ronald Reagan", 40, "R", 1, "1981-01-20", "1985-01-20", "Ronald_Reagan", [
    { name: "Economic Recovery Tax Act of 1981", bill: "97-HR-4242" },
    { name: "Social Security Amendments of 1983", title: "Social Security Amendments of 1983" },
    { name: "Martin Luther King Jr. Day", bill: "98-HR-3706" },
  ]),
  P("carter", "Jimmy Carter", 39, "D", 1, "1977-01-20", "1981-01-20", "Jimmy_Carter", [
    { name: "Department of Energy Organization Act", title: "Department of Energy Organization Act" },
    { name: "Airline Deregulation Act", title: "Airline Deregulation Act" },
    { name: "Civil Service Reform Act of 1978", title: "Civil Service Reform Act of 1978" },
    { name: "Ethics in Government Act", bill: "95-S-555" },
    { name: "Alaska National Interest Lands Conservation Act", title: "Alaska National Interest Lands Conservation Act" },
    { name: "Superfund (CERCLA)", bill: "96-HR-7020" },
  ]),
  P("ford", "Gerald Ford", 38, "R", 1, "1974-08-09", "1977-01-20", "Gerald_Ford", [
    { name: "ERISA", title: "Employee Retirement Income Security Act" },
    { name: "Federal Election Campaign Act Amendments of 1974", title: "Federal Election Campaign Act Amendments of 1974" },
    { name: "Education for All Handicapped Children Act", title: "Education for All Handicapped Children Act" },
    { name: "Energy Policy and Conservation Act", title: "Energy Policy and Conservation Act" },
    { name: "Toxic Substances Control Act", title: "Toxic Substances Control Act" },
  ]),
  P("nixon-2", "Richard Nixon", 37, "R", 2, "1973-01-20", "1974-08-09", "Richard_Nixon", [
    { name: "Endangered Species Act", title: "Endangered Species Act of 1973" },
    { name: "Trans-Alaska Pipeline Authorization Act", bill: "93-S-1081" },
    { name: "War Powers Resolution (enacted over veto)", title: "War Powers Resolution" },
    { name: "Congressional Budget and Impoundment Control Act", title: "Congressional Budget and Impoundment Control Act of 1974" },
  ]),
  P("nixon-1", "Richard Nixon", 37, "R", 1, "1969-01-20", "1973-01-20", "Richard_Nixon", [
    { name: "National Environmental Policy Act", title: "National Environmental Policy Act of 1969" },
    { name: "Clean Air Amendments of 1970", title: "Clean Air Amendments of 1970" },
    { name: "Occupational Safety and Health Act", title: "Occupational Safety and Health Act of 1970" },
    { name: "Controlled Substances Act", bill: "91-HR-18583" },
    { name: "Federal Election Campaign Act of 1971", title: "Federal Election Campaign Act of 1971" },
  ]),
];

// ---------- laws ----------

export interface Law {
  congress: number;
  type: string;
  number: string;
  law: string; // "119-21"
  title: string;
  date: string; // date it became law
  category: string;
}

interface RawLaw {
  congress: number;
  type: string;
  number: string;
  title: string;
  latestAction?: { actionDate: string; text: string };
  laws?: { number: string; type: string }[];
}

// Rough topic buckets from the official title. Ceremonial laws (naming post
// offices, coins, commemorations) are a large share of every Congress's output.
const CATEGORIES: [string, RegExp][] = [
  ["Naming & designations", /post office|postal service located|designate the (facility|federal|building|united states courthouse)|to (re)?name|redesignate|memorial highway|as the ".+" (building|courthouse|clinic|center)/i],
  ["Commemorations", /commemorat|gold medal|anniversary of|national .{0,30}(day|week|month)\b|to award .* medal/i],
  ["Regulatory disapprovals", /congressional disapproval/i],
  ["Budget & appropriations", /appropriation|budget|rescission|debt limit|public debt|reconciliation|sequest/i],
  ["Defense & veterans", /defense|armed forces|veteran|military|national guard|coast guard|intelligence/i],
  ["Health", /health|medicare|medicaid|drug|hospital|disease|cancer|opioid|medical|food and drug/i],
  ["Taxes, trade & economy", /tax|revenue code|tariff|trade|small business|bank|financial|securities|commerce|economic|insurance/i],
  ["Land, energy & environment", /land|park|wilderness|forest|water|river|energy|environment|wildlife|conveyance|fish|mineral|oil|reclamation|national monument|trail/i],
  ["Justice & immigration", /crime|criminal|justice|court|judicial|immigra|border|law enforcement|police|prison|firearm/i],
  ["Transportation & infrastructure", /highway|transportation|aviation|airport|rail|infrastructure|bridge|transit/i],
  ["Education & labor", /education|school|student|college|labor|employment|worker|wage|pension/i],
  ["Social programs & housing", /social security|retirement|benefit|housing|child|famil|nutrition|food stamp|welfare|disabilit/i],
  ["Foreign affairs", /foreign|international|sanction|treaty|embassy|china|russia|ukraine|israel|taiwan|iran|korea|peace corps|refugee/i],
  ["Science & technology", /science|technolog|cyber|research|space|nasa|broadband|internet|telecommunication|data|computer/i],
  ["Tribal affairs", /indian|tribe|tribal|native american|alaska native/i],
  ["Government operations", /reauthoriz|extend|federal employee|congress|election|government|agency|administration|commission|district of columbia|\bd\.c\.|postal|census|federal/i],
];

const CEREMONIAL = new Set(["Naming & designations", "Commemorations"]);

export function categorize(title: string) {
  for (const [name, re] of CATEGORIES) if (re.test(title)) return name;
  return "Other";
}

export function isCeremonial(category: string) {
  return CEREMONIAL.has(category);
}

export async function getLawsForCongress(congress: number): Promise<Law[]> {
  "use cache";
  cacheLife("hours");

  // Past Congresses are final; the current one changes as bills are signed.
  const ttl = congress < currentCongress() ? 30 * DAY : 6 * HOUR;
  const url = (offset: number) => `https://api.congress.gov/v3/law/${congress}/pub?format=json&limit=250&offset=${offset}&api_key=${API_KEY}`;
  const first = await fetchJSON<{ bills: RawLaw[]; pagination: { count: number } }>(url(0), ttl);
  const offsets: number[] = [];
  for (let o = 250; o < first.pagination.count; o += 250) offsets.push(o);
  const rest = await mapLimit(offsets, 4, (o) => fetchJSON<{ bills: RawLaw[] }>(url(o), ttl));

  const bills = [first, ...rest].flatMap((p) => p.bills).filter((b) => b.latestAction?.actionDate && b.laws?.length);

  // A bill's latest action is usually the day it became law, but later actions
  // (hearings, referrals of the same text) sometimes come after it. For those,
  // look up the enactment date in the bill's action history.
  const enacted = new Map<RawLaw, string>();
  const unsure = bills.filter((b) => !/public law/i.test(b.latestAction!.text));
  await mapLimit(unsure, 4, async (b) => {
    const actions = await fetchJSON<{ actions: { actionDate: string; text: string }[] }>(
      `https://api.congress.gov/v3/bill/${b.congress}/${b.type.toLowerCase()}/${b.number}/actions?format=json&limit=250&api_key=${API_KEY}`,
      ttl,
    ).catch(() => ({ actions: [] }));
    const law = actions.actions.find((a) => /public law/i.test(a.text));
    if (law) enacted.set(b, law.actionDate);
  });

  return bills.map((b) => ({
      congress: b.congress,
      type: b.type,
      number: b.number,
      law: b.laws!.find((l) => l.type === "Public Law")?.number ?? b.laws![0].number,
      title: b.title,
      date: enacted.get(b) ?? b.latestAction!.actionDate,
      category: categorize(b.title),
    }));
}

// Congresses that overlap a date range. Each Congress starts on Jan 3 of an odd year.
function congressesBetween(start: string, end: string) {
  const first = currentCongress(new Date(start + "T12:00:00Z"));
  const last = currentCongress(new Date(end + "T12:00:00Z"));
  const out: number[] = [];
  for (let c = Math.max(first, 91); c <= last; c++) out.push(c);
  return out;
}

export interface PresidencyStats {
  presidency: Presidency;
  end: string; // actual or as-of date
  days: number;
  laws: number;
  ceremonial: number;
  perYear: number;
  congresses: number[];
}

export interface PresidencyDetail extends PresidencyStats {
  allLaws: Law[]; // newest first
  byYear: { label: string; value: number }[];
  byCategory: { label: string; value: number }[];
  byCongress: { label: string; value: number }[];
  signature: (Law & { name: string })[];
  photo: string | null;
}

// Laws signed during a term: after noon on the first day, through the last day.
function inTerm(date: string, p: Presidency, end: string) {
  return date > p.start && date <= end;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function getPresidency(slug: string): Promise<PresidencyDetail | null> {
  "use cache";
  cacheLife("hours");

  const p = PRESIDENCIES.find((x) => x.slug === slug);
  if (!p) return null;
  const end = p.end ?? today();
  const congresses = congressesBetween(p.start, end);
  const [perCongress, photo] = await Promise.all([
    mapLimit(congresses, 3, (c) => getLawsForCongress(c)),
    getPortrait(p.wiki).catch(() => null),
  ]);

  const allLaws: Law[] = perCongress
    .flat()
    .filter((l) => inTerm(l.date, p, end))
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.law.split("-")[1]) - Number(a.law.split("-")[1]));

  const count = (key: (l: Law) => string) => {
    const m = new Map<string, number>();
    for (const l of allLaws) m.set(key(l), (m.get(key(l)) ?? 0) + 1);
    return m;
  };

  const years = count((l) => l.date.slice(0, 4));
  const startYear = Number(p.start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  const byYear = [];
  for (let y = startYear; y <= endYear; y++) byYear.push({ label: String(y), value: years.get(String(y)) ?? 0 });

  const signature = p.signature
    .map((s) => {
      // Titles must start with the name, so "An Act to amend the X Act" doesn't
      // match X; the earliest match wins over later amendments of the same name.
      const found = [...allLaws].reverse().find((l) =>
        s.bill
          ? `${l.congress}-${l.type}-${l.number}`.toUpperCase() === s.bill.toUpperCase()
          : l.title.toLowerCase().startsWith(s.title!.toLowerCase()),
      );
      return found ? { ...found, name: s.name } : null;
    })
    .filter((x): x is Law & { name: string } => !!x)
    .sort((a, b) => a.date.localeCompare(b.date));

  const days = Math.round((Date.parse(end) - Date.parse(p.start)) / 86400000);
  const ceremonial = allLaws.filter((l) => isCeremonial(l.category)).length;

  return {
    presidency: p,
    end,
    days,
    laws: allLaws.length,
    ceremonial,
    perYear: days > 0 ? allLaws.length / (days / 365.25) : 0,
    congresses: congresses.filter((c) => allLaws.some((l) => l.congress === c)),
    allLaws,
    byYear,
    byCategory: [...count((l) => l.category).entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    byCongress: congresses
      .map((c) => ({ label: `${ordinal(c)} Congress`, value: allLaws.filter((l) => l.congress === c).length }))
      .filter((c) => c.value > 0),
    signature,
    photo,
  };
}

export async function getAllPresidencies(): Promise<(PresidencyStats & { photo: string | null })[]> {
  "use cache";
  cacheLife("hours");

  // Finished terms never change, so their totals are saved in the repo. Gathering
  // every law since 1969 takes minutes, which is too long to do for a visitor.
  // Only the current term, or a term not saved yet, is computed from live data.
  const saved = savedStats as Record<string, Omit<PresidencyStats, "presidency"> & { photo: string | null }>;
  const rows = await mapLimit(PRESIDENCIES, 2, async (presidency) => {
    const stored = presidency.end ? saved[presidency.slug] : undefined;
    if (stored) return { presidency, ...stored };
    const d = await getPresidency(presidency.slug);
    if (!d) return null;
    const { end, days, laws, ceremonial, perYear, congresses, photo } = d;
    return { presidency, end, days, laws, ceremonial, perYear, congresses, photo };
  });
  return rows.filter((r) => r !== null);
}

async function getPortrait(wikiTitle: string): Promise<string | null> {
  const data = await fetchJSON<{ thumbnail?: { source: string } }>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`,
    30 * DAY,
    { "User-Agent": "CapitolStats/0.1 (civic data site)" },
  );
  return data.thumbnail?.source ?? null;
}

export function termLabel(p: Presidency) {
  const s = p.start.slice(0, 4);
  return p.end ? `${s}–${p.end.slice(0, 4)}` : `${s}–present`;
}

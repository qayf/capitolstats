import { cacheLife } from "next/cache";
import { getCourt, majorityAuthor, split, type CourtCase, type Justice, type JusticeVote } from "./sources/court";
import { date } from "./format";

// News recaps for Supreme Court decisions, written from the vote breakdown.
// The Court's own summary of the holding (from Oyez) is shown separately and
// credited, rather than mixed into the generated text.

const BIG_TOPICS =
  /trump|president|election|abortion|firearm|gun|second amendment|transgender|immigra|deport|religio|free speech|first amendment|tariff|voting|race|affirmative|death penalty|federal reserve|removal/i;

export function caseSlug(c: Pick<CourtCase, "term" | "docket">) {
  return `scotus-${c.term}-${c.docket}`;
}

export function parseCaseSlug(slug: string) {
  const m = /^scotus-(\d{4})-([\w-]+)$/.exec(slug);
  return m ? { term: Number(m[1]), docket: m[2] } : null;
}

export function scoreCase(c: CourtCase, newestInCourt: string) {
  let s = 10;
  if (c.minority === 0) s -= 2;
  else if (c.minority === 4) s += 4;
  else if (c.minority === 3) s += 2.5;
  if (BIG_TOPICS.test(`${c.name} ${c.holding} ${c.question}`)) s += 3;
  s -= (0.3 * Math.abs(Date.parse(newestInCourt) - Date.parse(c.decided!))) / 86400000;
  return s;
}

export function caseHeadline(c: CourtCase) {
  const winner = c.winningParty;
  if (c.minority === 0) return winner ? `Unanimous Supreme Court sides with ${winner} in ${c.name}` : `Supreme Court unanimously decides ${c.name}`;
  return winner ? `Supreme Court rules ${split(c)} for ${winner} in ${c.name}` : `Supreme Court decides ${c.name}, ${split(c)}`;
}

function lineup(c: CourtCase, justices: Justice[]) {
  const party = new Map(justices.map((j) => [j.id, j.appointedByParty]));
  const sides = (vote: JusticeVote["vote"]) => new Set(c.votes.filter((v) => v.vote === vote).map((v) => party.get(v.justiceId)));
  const maj = sides("majority");
  const min = sides("minority");
  if (c.minority === 0) return "unanimous";
  if (maj.size === 1 && min.size === 1 && [...maj][0] !== [...min][0]) return "ideological";
  return "cross";
}

export function caseDek(c: CourtCase, justices: Justice[]) {
  const author = majorityAuthor(c);
  const by = author ? `Justice ${author.lastName} wrote for the Court` : c.decisionType === "per curiam" ? "The Court ruled in an unsigned opinion" : "";
  const shape = lineup(c, justices);
  if (shape === "unanimous") return `${by ? by + " in a" : "A"} unanimous decision.`;
  const how =
    shape === "ideological"
      ? "split along the lines of the appointing presidents' parties"
      : "drew justices appointed by presidents of both parties to the majority";
  return `The ${split(c)} decision ${how}.${by ? ` ${by}.` : ""}`;
}

function names(vs: JusticeVote[]) {
  const list = vs.map((v) => v.lastName);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function getCourtStory(term: number, docket: string) {
  "use cache";
  cacheLife("hours");

  const court = await getCourt();
  const c = court.decided.find((x) => x.term === term && x.docket === docket);
  if (!c || c.votes.length === 0) return null;

  const [y, m, d] = c.decided!.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const majority = c.votes.filter((v) => v.vote === "majority");
  const minority = c.votes.filter((v) => v.vote === "minority");
  const author = majorityAuthor(c);
  const dissentAuthors = minority.filter((v) => v.opinion.includes("dissent"));
  const concurrences = c.votes.filter((v) => v.opinion.includes("concurrence"));
  const shape = lineup(c, court.justices);

  const paragraphs: string[] = [];
  paragraphs.push(
    c.minority === 0
      ? `The Supreme Court ruled unanimously on ${weekday}, ${date(c.decided)}, in ${c.name}${c.winningParty ? `, siding with ${c.winningParty}` : ""}.`
      : `The Supreme Court ruled ${split(c)} on ${weekday}, ${date(c.decided)}, in ${c.name}${c.winningParty ? `, siding with ${c.winningParty}` : ""}.`,
  );

  if (author) {
    const joined = majority.filter((v) => v.justiceId !== author.justiceId);
    paragraphs.push(
      `Justice ${author.lastName} wrote the ${author.opinion === "plurality" ? "plurality" : "majority"} opinion${
        joined.length ? `, joined by Justices ${names(joined)}` : ""
      }.`,
    );
  }

  if (minority.length) {
    if (dissentAuthors.length) {
      const [lead, ...others] = dissentAuthors;
      const joinedLead = minority.filter((v) => !dissentAuthors.includes(v));
      paragraphs.push(
        `Justice ${lead.lastName} wrote ${others.length ? "a" : "the"} dissent${joinedLead.length ? `, joined by Justices ${names(joinedLead)}` : ""}.${
          others.length ? ` Justice${others.length > 1 ? "s" : ""} ${names(others)} also wrote dissenting opinions.` : ""
        }`,
      );
    } else {
      paragraphs.push(`Justices ${names(minority)} dissented.`);
    }
  }

  if (concurrences.length) {
    paragraphs.push(
      `${concurrences.length === 1 ? "Justice" : "Justices"} ${names(concurrences)} wrote separately in concurrence${
        concurrences.length === 1 ? "" : "s"
      }, agreeing with the outcome.`,
    );
  }

  if (shape === "ideological") {
    paragraphs.push("Every justice in the majority was appointed by a president of one party, and every dissenter by a president of the other.");
  } else if (shape === "cross") {
    paragraphs.push("The majority included justices appointed by both Republican and Democratic presidents.");
  }

  if (c.lowerCourt || c.argued) {
    paragraphs.push(
      `The case ${c.lowerCourt ? `came to the Court from the ${c.lowerCourt}` : "was heard by the Court"}${
        c.argued ? ` and was argued on ${date(c.argued)}` : ""
      }.`,
    );
  }

  return {
    case: c,
    headline: caseHeadline(c),
    dek: caseDek(c, court.justices),
    paragraphs,
    majority,
    minority,
    photos: Object.fromEntries(court.justices.map((j) => [j.id, j.photo])),
  };
}

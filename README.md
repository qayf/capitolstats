# Capitol Stats

Stat pages for every member of the U.S. Congress: what they vote on (attendance only, never positions), the bills they sponsor, and where their campaign money comes from.

## Setup

```bash
npm install
cp .env.example .env.local   # then paste your api.data.gov key
npm run dev
```

## Data sources

- **Members, terms, committees:** [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)
- **Roll-call votes (House and Senate):** [Voteview](https://voteview.com/data) bulk CSVs
- **Legislation:** [Congress.gov API](https://api.congress.gov/)
- **Campaign finance:** [OpenFEC API](https://api.open.fec.gov/developers/)

Upstream responses are cached on disk in `.cache/` (ignored by git) so the rate-limited APIs aren't hit on every request.

## Keeping the feeds fresh

The Latest Votes strip, Top Stories, vote pages and Supreme Court data are tagged as live data (`lib/live.ts`). While the site is visited they refresh at most every 30 minutes and are never served more than a day old. `GET /api/refresh` refreshes all of it immediately and rebuilds the home page; `vercel.json` calls it daily at 08:00 UTC, shortly after Voteview publishes its daily update. In production set `CRON_SECRET`, which the cron sends as a bearer token.

## Presidents page totals

Totals for finished presidential terms are saved in `lib/data/presidency-stats.json`, so the Presidents page doesn't have to gather every law since 1969. When a term ends, or if the law categories change, start the dev server and run `npm run update:presidents` (set `PORT` if it isn't on 3000), then commit the file. A finished term missing from the file is computed live until then.

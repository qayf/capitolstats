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

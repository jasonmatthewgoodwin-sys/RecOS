# RecOS

A private web app for one recruiter. One calm place to see what needs doing, act on it and know whether the week is on track.

Start with `CLAUDE.md`. It is the brief Claude Code works from. The design lives in `docs/`.

## Layout

```text
CLAUDE.md            the brief, read at the start of every session
HANDOVER.md          where the build stands and what to do next
app/                 front end (React, TypeScript, Vite, Tailwind)
db/
  migrations/        numbered SQL files, never edited once applied
  policies/          row-level security, one file per table
  seed/              settings and the invented sample week
  tests/             SQL access and behaviour tests
  views/             KPI and funnel views
functions/           Supabase Edge Functions
agents/              prompts and fixtures
docs/                design documents, build log, decisions
```

## Run it on your computer

You need Node.js (current long-term version) and Git.

```bash
cd app
npm install
npm run dev
```

With no `.env.local` file the app runs on invented sample data, so screens can be built and checked without a database. To point it at the test database, copy `app/.env.example` to `app/.env.local` and fill in the two values.

## Checks

```bash
cd app
npm test          # unit and screen tests
npm run build     # type check and build
npm run test:db   # database migrations, policies and SQL tests
```

## Rules that never bend

See "Rules that are never broken" in `CLAUDE.md`. In short: thin person records, row-level security on every table, no secrets in the browser or the repository, agents write through one endpoint, only the send engine sends, KPIs are events written by triggers.

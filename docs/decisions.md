# Decisions

Departures from the design, and choices the design left open. Newest last. Anything marked "Pending" needs a yes from Jason before it is treated as settled.

| Date | Decision | Why | Affects | Agreed by |
| --- | --- | --- | --- | --- |
| 2026-11-14 | `react-router-dom` added as a dependency | Section 25.1 needs about 20 routes with query strings for cards. It is a router, not a state framework or component kit | `app/` | Pending |
| 2026-11-14 | Default typefaces: Space Grotesk and Space Mono, self-hosted through `@fontsource` | Section 3.7 names them as defaults. Jason has not chosen yet | `app/src/theme` | Jason, 2026-11-14 |
| 2026-11-14 | With no Supabase settings the app runs on invented sample data from `app/src/lib/sample.ts` | Section 4.3: local uses seed data only. Lets screens be built before the projects exist | `app/src/lib` | Builder's choice |
| 2026-11-14 | Week 1 tickets were built in one sitting, not one at a time with a stop after each | Mia asked for as much as possible before handing over to Jason. Each ticket still has its own commit | Whole of week 1 | Mia. Jason to review each screen against the calm rules |
| 2026-11-14 | `send_policies.channel` also allows `either` | The seed table in 20.2 lists six types as "email or linkedin", which the check in 13.5 would refuse. All six are draft only | `db/migrations/0006` | Pending |
| 2026-11-14 | `calendar_today` columns defined by the builder and created in week 1 | 14.1 names the table and what it holds but gives no DDL. Home needs it for its third number | `db/migrations/0014` | Pending |
| 2026-11-14 | `kpi_this_week` view added | Home's fourth number reads it. It is `kpi_week_view` filtered to the current week | `db/views` | Builder's choice |
| 2026-11-14 | Targets are seeded by `db/seed/targets.sql` after first sign-in, not by a migration | Each target row has an `owner_id`, which does not exist until the owner signs in | `db/seed` | Builder's choice |
| 2026-11-14 | Database tests run in an in-memory Postgres (PGlite) with a small stand-in for Supabase's roles | Lets every access rule be tested on any computer with no project or password. pgTAP can still be added on Supabase later | `db/tests` | Builder's choice |
| 2026-11-14 | Extra guards beyond the DDL: send level can never exceed its ceiling (check constraint), `kpi_events` and `send_log` refuse updates, the browser cannot move a message out of draft except to cancel | Rules MSG-3, MSG-4, LOG-1, KPI-2 and section 13.5 state these as rules. They are now enforced by the database | `db/migrations` | Builder's choice, in line with the brief |

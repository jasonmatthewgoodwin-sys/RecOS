# Decisions

Agreed departures from the design, and choices the design left open. Newest last.

| Date | Decision | Why | Affects | Agreed by |
| --- | --- | --- | --- | --- |
| 2026-11-14 | `react-router-dom` added as a dependency | Section 25.1 needs about 20 routes with query strings for cards. It is a router, not a state framework or component kit | `app/` | Pending Jason's yes |
| 2026-11-14 | Default typefaces used: Space Grotesk and Space Mono, self-hosted through `@fontsource` | Section 3.7 names them as defaults. Jason has not chosen yet (decision 1 in the build instructions) | `app/src/theme` | Pending Jason's choice |
| 2026-11-14 | With no Supabase settings the app runs on invented sample data from `app/src/lib/sample.ts` | Section 4.3: local uses seed data only. Lets screens be built before the projects exist | `app/src/lib` | Builder's choice |

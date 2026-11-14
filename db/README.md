# Database

Everything the database needs, as plain SQL files.

| Folder | Holds | Run |
| --- | --- | --- |
| `migrations/` | Numbered files that create tables, functions and triggers. Never edited once applied. A change is a new file | Once each, in number order |
| `policies/` | Row-level security, one file per table | After migrations. Safe to run again |
| `views/` | KPI views | After policies. Safe to run again |
| `seed/targets.sql` | The seven starting targets | Once per project, after the owner's first sign-in |
| `seed/sample_week.sql` | Invented sample data. **Test project only** | After `targets.sql`. Never on live |
| `tests/` | Checks for the access rules, triggers and Home counts | `npm install`, then `npm test` |

## Tests

`npm test` builds a throwaway Postgres in memory, applies every file above in order and runs the checks. It needs no Supabase project and no password. `tests/supabase-shim.sql` stands in for the roles and the `auth` schema that Supabase provides. It is never run against a real project.

Every table must have row-level security on and a file in `policies/`. The first test fails if one is missing.

## Applying to a Supabase project

Not yet done. It is the first job once the `recos-test` project exists (ticket P1-01). Apply in this order: `migrations/` by number, then `policies/`, then `views/`. After that:

1. In the Supabase dashboard, under Authentication, Hooks, switch on both hooks defined in `migrations/0003_sign_in.sql`.
2. Add the owner's work address to `allowed_emails` with a new migration.
3. Sign in once, then run `seed/targets.sql`.
4. On the test project only, run `seed/sample_week.sql`.

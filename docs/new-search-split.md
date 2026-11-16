# New search flow: who builds what

Jason, 16 November 2026. He asked for the work to be split 50/50 with Mia. The split is by layer, so the two halves never touch the same files. This page is the contract between them. If either side needs to change it, change this page first and say so.

## What Jason asked for

Under Searches, a "new search" flow for when a brief is due:

1. **Intake.** Client name, a rough idea of the role, and optionally a job description (pasted or a file). A JD pre-fills what it can.
2. **Brief questions.** A big set of questions for the client. With a JD they are tailored to it, and its gaps become questions. Without one, a solid uniform set for product marketing and that specific role type.
3. **Client lowdown.** Research on the client: have we worked with them before, funding, story, team, news.
4. **Market map.** After the brief. Built on the `us-market-map` skill, then deeper: target company lists in tiers, adjacent companies, title variants, keyword and Boolean searches.

## The split

| | Jason's half (through Claude): data and agents | Mia's half: screens |
|---|---|---|
| Owns | `db/migrations/0048` to `0050`, `db/policies`, `db/seed`, `db/tests`, `functions/`, the cloud routines | `app/src/routes/searches/*`, `app/src/lib/searches.ts`, `app/src/lib/sample.ts`, app tests |
| Shared file | `app/src/lib/data.ts`: Jason adds the functions listed below, in one block at the end of the searches part. Mia calls them and does not edit that block | |
| Builds | Tables and write kinds below. The question bank. The research agent with three jobs: questions from a JD, client lowdown, market map. Routines so a request is picked up within about 15 minutes | The New search steps (intake with JD paste or drop, role type picker), the Questions list (tick, edit, reorder, copy all), the Lowdown page, the Map tab, the Working and Ready states (30.6) |
| Starts from | This page | This page and sample data; nothing of Jason's half is needed to start |

Migration numbers: Jason has 0048 to 0050. Mia takes 0051 upward if she needs any.

## The contract

### 1. Intake fields on a search

New columns on `searches` (0048): `role_type text` (one of `ic_pmm`, `senior_pmm`, `technical_pmm`, `head_of_pmm`, `director_vp_pmm`, `plg_pmm`, `other`), `jd_text text`, `brief_due_on date`. A search created by the flow has status `intake`.

### 2. Asking for work

Table `search_jobs` (0048): `id`, `search_id`, `kind` (`questions`, `lowdown`, `map`), `status` (`waiting`, `working`, `ready`, `failed`), `note` (one plain line for the screen, for example why it failed), `requested_at`, `finished_at`. The owner inserts a row through `request_search_job(search_id, kind)`; one open job per search and kind. The agent claims waiting jobs, sets `working`, and sets `ready` or `failed` when it writes the result.

### 3. Results

Results are rows in `search_notes`, one new version per run (11.2). The `tab` check gains `questions` and `lowdown`; `map` exists already. `content` is the readable text. `structured` is:

**questions**
```json
{ "role_type": "senior_pmm", "from_jd": true,
  "groups": [ { "title": "Scope and remit",
    "questions": [ { "id": "q1", "text": "...", "why": "The JD names two product lines but not who owns pricing", "source": "jd_gap" } ] } ] }
```
`source` is `bank` (the standard set), `jd` (tailored to the JD) or `jd_gap` (something the JD leaves out or contradicts). The screen may add `ticked`, `order` and edited `text`; the owner's edits overwrite the current version and the agent never overwrites an edited version, it adds a new one.

**lowdown**
```json
{ "worked_before": { "summary": "...", "placements": 0, "last_contact_on": "2026-10-02", "people": [ { "name": "...", "role": "...", "source": "outlook" } ] },
  "company": { "one_line": "...", "founded": "2019", "hq": "...", "headcount": "about 240", "story": "..." },
  "funding": [ { "round": "Series B", "amount": "$40m", "date": "2025-06", "investors": ["..."] } ],
  "leadership": [ { "name": "...", "title": "..." } ],
  "pmm_team": { "size": "3", "lead": "...", "notes": "..." },
  "news": [ { "date": "2026-10", "headline": "...", "url": "..." } ],
  "hiring_signals": ["..."], "watch_outs": ["..."],
  "sources": [ { "label": "...", "url": "..." } ] }
```
Every fact has a source. A field with nothing found is left out, never guessed (AG-2).

**map**
```json
{ "tiers": [ { "tier": 1, "title": "Direct competitors",
    "companies": [ { "name": "...", "why": "...", "hq": "...", "size": "...", "movability": "Layoffs in October", "signal_date": "2026-10" } ] } ],
  "poach_from": [ { "name": "...", "why": "..." } ],
  "titles": ["Senior Product Marketing Manager", "..."],
  "keywords": ["..."],
  "boolean": [ { "label": "LinkedIn Recruiter, tier 1", "string": "(\"product marketing\" OR PMM) AND ..." } ],
  "companies_csv": "name,tier,why\n..." }
```

### 4. Functions in `data.ts` (Jason adds, Mia calls)

- `startSearch({ client, role, roleType, jdText, briefDueOn })` → the new search id.
- `requestSearchJob(searchId, kind)` → void.
- `searchJobs(searchId)` → `{ kind, status, note, requestedAt, finishedAt }[]`.
- `questionBank(roleType)` → the standard groups at once, with no wait, so the Questions step is never empty.
- Results are read with the existing `searchNotes(searchId)` and saved with `saveSearchNote`.

### 5. How fast

The standard question bank shows at once. Tailored questions, the lowdown and the map are background jobs: the routines check every 15 minutes, so a result lands within about 15 to 20 minutes. The button reads Working, then the result appears in place (30.6). If Jason later adds an Anthropic API key, the tailored questions can move to an instant server function without changing this contract.

## Done means

- Jason's half: migrations applied to the test project, db tests pass, a live request for each of the three kinds comes back `ready` with the shapes above.
- Mia's half: the four steps work on sample data and on the test project, app tests pass, nothing scrolls the page at laptop width.
- Together: one real new search run end to end with Jason watching.

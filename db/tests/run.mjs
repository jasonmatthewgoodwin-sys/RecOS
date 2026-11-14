// Database tests (low-level design section 35.1, "Database" level).
//
// Builds a throwaway Postgres in memory, applies every migration, policy and
// view in order, loads the seeds, then checks the access rules and triggers.
// Nothing here touches a Supabase project. Run with: npm test

import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (...p) => readFileSync(join(root, ...p), 'utf8')
const sqlFiles = (dir) => readdirSync(join(root, dir)).filter((f) => f.endsWith('.sql')).sort()

const db = new PGlite()

async function apply(dir) {
  for (const file of sqlFiles(dir)) {
    try {
      await db.exec(read(dir, file))
    } catch (e) {
      throw new Error(`${dir}/${file}: ${e.message}`)
    }
  }
}

// ---------------------------------------------------------------- build

// Run twice: once as an older Supabase project that grants the API roles
// everything on new tables, and once (--strict) as a newer one that grants
// nothing. The access rules must hold in both.
const strict = process.argv.includes('--strict')
const shim = read('tests', 'supabase-shim.sql')
await db.exec(strict ? shim.split('-- DEFAULT GRANTS')[0] : shim)
await apply('migrations')
await apply('policies')
await apply('views')
// Policies and views must be safe to run twice.
await apply('policies')
await apply('views')

const OWNER_EMAIL = 'owner@example.test'
const REVIEWER_EMAIL = 'reviewer@example.test'
await db.exec(`insert into allowed_emails (email, role) values ('${OWNER_EMAIL}', 'owner')`)
await db.exec(`insert into auth.users (email, raw_user_meta_data) values ('  Owner@Example.test ', '{"full_name": "Jason Sample"}')`)
await db.exec(`insert into auth.users (email) values ('stranger@example.test')`)
const ownerId = (await db.query(`select id from app_users where role = 'owner'`)).rows[0]?.id

for (const file of ['targets.sql', 'lists.sql', 'sample_week.sql', 'sample_league.sql']) {
  await db.exec(read('seed', file))
  // Seeds must be safe to run twice.
  await db.exec(read('seed', file))
}

// ---------------------------------------------------------------- helpers

/** Run statements as a browser role with the given token claims, then roll back. */
async function as(role, claims, fn) {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await db.exec(`set local role ${role}`)
    return await fn()
  } finally {
    await db.exec('rollback')
  }
}

const owner = (fn) => as('authenticated', { sub: ownerId, email: OWNER_EMAIL, role: 'authenticated', app_role: 'owner' }, fn)
const reviewer = (fn) =>
  as('authenticated', { sub: '00000000-0000-0000-0000-0000000000aa', email: REVIEWER_EMAIL, role: 'authenticated', app_role: 'reviewer' }, fn)
const noRole = (fn) => as('authenticated', { sub: '00000000-0000-0000-0000-0000000000bb', role: 'authenticated' }, fn)
const anon = (fn) => as('anon', { role: 'anon' }, fn)
const service = (fn) => as('service_role', { role: 'service_role' }, fn)

const rows = async (sql, params) => (await db.query(sql, params)).rows
const count = async (table) => Number((await rows(`select count(*) as n from ${table}`))[0].n)

async function refused(sql, params) {
  // A savepoint lets the transaction carry on after the expected failure.
  await db.exec('savepoint s')
  try {
    const res = await db.query(sql, params)
    await db.exec('release savepoint s')
    return res.affectedRows === 0 && (res.rows?.length ?? 0) === 0 ? 'no rows' : null
  } catch (e) {
    await db.exec('rollback to savepoint s')
    return e.message
  }
}

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const allTables = (
  await rows(`select tablename from pg_tables where schemaname = 'public' order by 1`)
).map((r) => r.tablename)

// ---------------------------------------------------------------- tests

test('every public table has row-level security on, and a policy file', async () => {
  const off = await rows(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
  )
  assert.deepEqual(off.map((r) => r.relname), [], 'tables without row-level security')
  const files = sqlFiles('policies').map((f) => f.replace('.sql', ''))
  assert.deepEqual(allTables.filter((t) => !files.includes(t)), [], 'tables without a policy file')
})

test('no table has a delete policy, and no browser role may delete or truncate (6.6)', async () => {
  const del = await rows(`select tablename, policyname from pg_policies where schemaname = 'public' and cmd in ('DELETE', 'ALL')`)
  assert.deepEqual(del, [])
  const grants = await rows(
    `select table_name, grantee, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('DELETE', 'TRUNCATE')`,
  )
  assert.deepEqual(grants, [])
})

test('anon holds no privilege on any table or view', async () => {
  const grants = await rows(
    `select table_name, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon'`,
  )
  assert.deepEqual(grants, [])
})

test('T-AUTH-5 / anon: every table and view refuses a read', async () => {
  await anon(async () => {
    for (const t of [...allTables, 'kpi_week_view', 'kpi_this_week', 'kpi_streak_view', 'kpi_quarter_view', 'kpi_output_week_view', 'followups_quarter_view', 'bd_funnel_view', 'system_week_view', 'agent_requests', 'run_requests']) {
      const why = await refused(`select * from ${t}`)
      assert.match(String(why), /permission denied/, `${t} as anon`)
    }
  })
})

test('a signed-in user with no role (not on the allow-list) sees nothing', async () => {
  await noRole(async () => {
    for (const t of allTables) {
      const why = await refused(`select * from ${t}`)
      assert.ok(why === 'no rows' || /permission denied/.test(why), `${t} with no role: ${why}`)
    }
    assert.equal(await count('kpi_week_view'), 0)
  })
})

test('T-RLS-1 / T-AUTH-7: reviewer reads zero rows from every base table except weekly_reviews and targets', async () => {
  // Make sure there is something to see in both shared tables first.
  await db.exec(`insert into weekly_reviews (owner_id, week) values ('${ownerId}', week_of(now()))`)
  await reviewer(async () => {
    for (const t of allTables) {
      const why = await refused(`select * from ${t}`)
      if (t === 'weekly_reviews' || t === 'targets') {
        assert.equal(why, null, `${t} should be readable by the reviewer`)
      } else {
        assert.ok(why === 'no rows' || /permission denied/.test(why), `${t} as reviewer: ${why}`)
      }
    }
  })
})

test('reviewer may read KPI counts through the views, and write nothing', async () => {
  await reviewer(async () => {
    assert.equal(await count('kpi_this_week'), 4)
    assert.ok(await refused(`update targets set target = 1`))
    assert.ok(await refused(`insert into targets (owner_id, kpi, period, target, valid_from) values (gen_random_uuid(), 'posts_chased', 'week', 1, current_date)`))
    assert.ok(await refused(`update weekly_reviews set learned = 'x'`))
    assert.ok(await refused(`update app_settings set all_sending_paused = true`))
  })
})

test('T-RLS-4: anon is refused on kpi_week_view', async () => {
  await anon(async () => assert.match(await refused(`select * from kpi_week_view`), /permission denied/))
})

test('owner reads and writes the working tables', async () => {
  await owner(async () => {
    assert.equal(await count('inbox_items'), 9)
    assert.equal(await count('follow_ups'), 5)
    assert.equal(await count('people'), 6)
    await db.query(
      `insert into follow_ups (person_name, kind, reason, source, due_on, dedup_key)
       values ('Gia Imaginary', 'other', 'Sample', 'manual', current_date, 'test:fu:gia')`,
    )
    const [fu] = await rows(`select owner_id from follow_ups where dedup_key = 'test:fu:gia'`)
    assert.equal(fu.owner_id, ownerId, 'owner_id defaults to the signed-in user (DB-3)')
  })
})

test('T-RLS-3: owner cannot delete from inbox_items, or from any other table', async () => {
  await owner(async () => {
    for (const t of allTables) {
      assert.match(String(await refused(`delete from ${t}`)), /permission denied/, `delete from ${t}`)
    }
  })
})

test('T-RLS-5: owner may insert only manual KPI corrections, and they need a reason', async () => {
  await owner(async () => {
    assert.match(await refused(`insert into kpi_events (kpi, manual) values ('posts_chased', false)`), /row-level security/)
    assert.match(await refused(`insert into kpi_events (kpi, manual) values ('posts_chased', true)`), /kpi_events_manual_needs_reason/)
    assert.equal(await refused(`insert into kpi_events (kpi, manual, amount, reason) values ('posts_chased', true, -1, 'Counted twice') returning id`), null)
    assert.match(await refused(`update kpi_events set amount = 5`), /permission denied/)
  })
})

test('T-RLS-6: owner can neither read nor change agents.key_hash', async () => {
  await owner(async () => {
    assert.match(await refused(`select key_hash from agents`), /permission denied/)
    assert.match(await refused(`update agents set key_hash = 'x'`), /permission denied/)
    assert.equal(await refused(`update agents set enabled = false where code = 'a7_events' returning code`), null)
    assert.equal((await rows(`select code from agents`)).length, 7)
  })
})

test('P-OWNER-RO: owner cannot write send_log, audit_log or agent_runs', async () => {
  await owner(async () => {
    for (const t of ['send_log', 'audit_log', 'agent_runs']) {
      const col = t === 'audit_log' ? 'action' : 'id'
      assert.match(String(await refused(`update ${t} set ${col} = ${col}`)), /permission denied/, t)
    }
    assert.match(await refused(`insert into audit_log (actor, action) values ('me', 'x')`), /permission denied/)
  })
})

test('P-SETTINGS: owner may update settings and policies but not add or remove rows', async () => {
  await owner(async () => {
    assert.equal(await refused(`update app_settings set theme = 'night' returning id`), null)
    assert.match(await refused(`insert into send_policies (type, label, channel, level, max_level) values ('x', 'x', 'email', 'automatic', 'automatic')`), /permission denied/)
    assert.match(await refused(`update app_settings set home_stats = array['needs_you']`), /check constraint/)
  })
})

test('send policy ceiling: a level can be lowered, never raised above max_level', async () => {
  await owner(async () => {
    assert.equal(await refused(`update send_policies set level = 'one_click' where type = 'thanks_after_call' returning type`), null)
    assert.match(await refused(`update send_policies set level = 'automatic' where type = 'rejection'`), /send_policies_level_within_ceiling/)
    assert.match(await refused(`update send_policies set max_level = 'automatic' where type = 'rejection'`), /only be changed by a migration/)
    const log = await db.query(`select set_config('role', 'none', true)`).then(() => rows(`select detail from audit_log where action = 'send level change'`))
    assert.equal(log.length, 1)
  })
  const linkedinDraftOnly = await rows(
    `select type from send_policies where type in ('linkedin_message', 'linkedin_post', 'rejection', 'spec') and max_level <> 'draft_only'`,
  )
  assert.deepEqual(linkedinDraftOnly, [])
  assert.equal(await count('send_policies'), 23)
})

test('MSG-3 and MSG-4: the browser cannot queue or send a message, or edit one that is not a draft', async () => {
  await owner(async () => {
    const insert = `insert into messages (type, channel, to_name, body, created_by, level_at_creation, state)
                    values ('email_reply', 'email', 'Ada Example', 'Hello', 'manual', $1, $2) returning id`
    assert.match(await refused(insert, ['draft_only', 'queued']), /starts as a draft/)
    assert.match(await refused(insert, ['automatic', 'draft']), /never automatic|needs_template/)
    const [{ id }] = await rows(insert, ['draft_only', 'draft'])
    assert.equal(await refused(`update messages set body = 'Hello again' where id = $1 returning id`, [id]), null)
    for (const state of ['queued', 'sending', 'sent', 'failed', 'held']) {
      assert.match(await refused(`update messages set state = $2 where id = $1`, [id, state]), /Only the send engine/, state)
    }
    assert.match(await refused(`update messages set to_address = 'someone@example.test' where id = $1`, [id]), /set by the send engine/)
    assert.equal(await refused(`update messages set state = 'cancelled' where id = $1 returning id`, [id]), null)
    assert.match(await refused(`update messages set body = 'Too late' where id = $1`, [id]), /only be edited while it is a draft/)
  })
})

test('the send engine (service role) can move a message through its states and append to the send log', async () => {
  await service(async () => {
    const [{ id }] = await rows(
      `insert into messages (owner_id, type, channel, to_name, created_by, level_at_creation, template_id, state)
       values ($1, 'thanks_after_call', 'email', 'Ada Example', 'a6_calls', 'automatic', gen_random_uuid(), 'queued') returning id`,
      [ownerId],
    )
    await db.query(`update messages set state = 'sent', sent_at = now() where id = $1`, [id])
    await db.query(
      `insert into send_log (owner_id, message_id, type, channel, to_name, level, outcome) values ($1, $2, 'thanks_after_call', 'email', 'Ada Example', 'automatic', 'sent')`,
      [ownerId, id],
    )
    assert.match(await refused(`update send_log set outcome = 'failed'`), /never changed/)
    assert.match(
      await refused(
        `insert into messages (owner_id, type, channel, to_name, created_by, level_at_creation) values ($1, 'thanks_after_call', 'email', 'x', 'a6_calls', 'automatic')`,
        [ownerId],
      ),
      /messages_automatic_needs_template/,
    )
  })
})

test('INB-2: done sets actioned_at, closed_at and purge_after; undo clears them; duplicates are refused', async () => {
  await owner(async () => {
    const [item] = await rows(`select id, dedup_key from inbox_items where status = 'new' limit 1`)
    const [done] = await rows(`update inbox_items set status = 'done' where id = $1 returning actioned_at, closed_at, purge_after, updated_at, created_at`, [item.id])
    assert.ok(done.actioned_at && done.closed_at)
    const months = (new Date(done.purge_after) - new Date(done.closed_at)) / 86_400_000
    assert.ok(months > 360 && months < 370, 'purge_after is 12 months after closing')
    const [undone] = await rows(`update inbox_items set status = 'new' where id = $1 returning actioned_at, closed_at, purge_after`, [item.id])
    assert.deepEqual(undone, { actioned_at: null, closed_at: null, purge_after: null })
    assert.match(await refused(`update inbox_items set draft_original = 'changed' where draft_original is not null`), /draft_original cannot be changed/)
    assert.match(
      await refused(`insert into inbox_items (type, agent, title, dedup_key) values ('job_lead', 'manual', 'Again', $1)`, [item.dedup_key]),
      /inbox_items_dedup/,
    )
    // A binned item no longer blocks its key.
    await db.query(`update inbox_items set status = 'binned', bin_reason = 'Not a fit' where id = $1`, [item.id])
    assert.equal(await refused(`insert into inbox_items (type, agent, title, dedup_key) values ('job_lead', 'manual', 'Again', $1) returning id`, [item.dedup_key]), null)
  })
})

test('KPI-2 and KPI-3: week and quarter are set by trigger; the same source row never counts twice; rows never change', async () => {
  const [e] = await rows(
    `insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id) values ($1, 'posts_chased', '2026-11-15 23:30+00', 't', '00000000-0000-0000-0000-000000000001') returning week::text, quarter::text`,
    [ownerId],
  )
  // Sunday 15 November 2026 belongs to the week starting Monday 9 November.
  assert.deepEqual(e, { week: '2026-11-09', quarter: '2026-10-01' })
  assert.match(
    await refusedPlain(`insert into kpi_events (owner_id, kpi, source_table, source_id) values ('${ownerId}', 'posts_chased', 't', '00000000-0000-0000-0000-000000000001')`),
    /kpi_events_kpi_source_table_source_id_key/,
  )
  assert.match(await refusedPlain(`update kpi_events set amount = 2`), /never changed/)
  assert.match(await refusedPlain(`delete from kpi_events`), /never changed/)
  assert.match(await refusedPlain(`insert into kpi_events (owner_id, kpi) values ('${ownerId}', 'not_a_kpi')`), /check constraint/)
})

test('Home counts (14.1) match the sample week: 7 need you, 3 follow-ups, 6 calls, 2 of 4', async () => {
  await owner(async () => {
    const [a] = await rows(`select count(*)::int as n from inbox_items where status in ('new', 'stale') and type <> 'auto_sent'`)
    const [b] = await rows(`select count(*)::int as n from follow_ups where status = 'open' and direction = 'owed' and due_on <= current_date`)
    const [c] = await rows(`select count(*)::int as n from calendar_today where is_external`)
    const [d] = await rows(`select (count(*) filter (where hit))::int as hit, count(*)::int as total from kpi_this_week`)
    assert.deepEqual([a.n, b.n, c.n, d], [7, 3, 6, { hit: 2, total: 4 }])
    // Past weeks are judged against the target that applied then. Targets start
    // on 9 November 2026, so no earlier week appears.
    const [w] = await rows(`select min(week)::text as first, count(distinct week)::int as n from kpi_week_view`)
    assert.ok(w.first >= '2026-11-09' && w.n >= 1 && w.n <= 12, JSON.stringify(w))
  })
})

test('P1-42: the streak view, PMM and all-work totals, and a manual correction marks the week (14.3, 22.4, 22.5)', async () => {
  await owner(async () => {
    // Targets start on 9 November 2026 and the test clock is in that week, so
    // there is no history yet: every KPI is still Tracking since.
    const streaks = await rows(`select kpi, weeks_history, hit_last_4, pmm_hit_last_4, first_week::text as first_week, best_12::int as best_12 from kpi_streak_view order by kpi`)
    assert.deepEqual(streaks.map((r) => r.kpi), ['coaching_calls', 'linkedin_posts', 'new_a_star', 'posts_chased'])
    const posts = streaks.find((r) => r.kpi === 'posts_chased')
    assert.ok(posts.weeks_history >= 0 && posts.weeks_history <= 11, JSON.stringify(posts))
    assert.ok(posts.hit_last_4 <= posts.weeks_history && posts.pmm_hit_last_4 <= posts.weeks_history, JSON.stringify(posts))
    assert.ok(posts.best_12 >= 20, JSON.stringify(posts))
    assert.ok(posts.first_week >= '2026-11-09')

    const read = async () => (await rows(`select total::int as total, pmm_total::int as pmm_total, hit, pmm_hit, has_manual from kpi_this_week where kpi = 'posts_chased'`))[0]
    const before = await read()
    assert.equal(before.has_manual, false)
    assert.ok(before.total >= 20 && before.total === before.pmm_total, JSON.stringify(before))

    // T-NUM-3: correct by minus 2 with a reason. The week shows the m mark.
    await db.query(`insert into kpi_events (kpi, manual, amount, reason) values ('posts_chased', true, -2, 'Two were the same post')`)
    let after = await read()
    assert.deepEqual(after, { total: before.total - 2, pmm_total: before.pmm_total - 2, hit: before.total - 2 >= 20, pmm_hit: before.pmm_total - 2 >= 20, has_manual: true })
    assert.equal((await rows(`select 1 from audit_log where action = 'manual KPI correction'`)).length, 1)

    // All work counts a non-PMM event; the PMM figure does not move.
    await db.query(`insert into kpi_events (kpi, manual, amount, reason, is_pmm) values ('posts_chased', true, 3, 'Three non-PMM posts chased by hand', false)`)
    after = await read()
    assert.equal(after.total, before.total + 1)
    assert.equal(after.pmm_total, before.pmm_total - 2)
  })
  await reviewer(async () => {
    assert.equal(await count('kpi_streak_view'), 4)
  })
})

test('P1-43: the quarter, output, follow-up and funnel views (14.2, 14.4, 14.7, 32.2)', async () => {
  await owner(async () => {
    const q = await rows(`select kpi, position, total::int as total, target::int as target, hit from kpi_quarter_view order by position`)
    assert.deepEqual(q.map((r) => r.kpi), ['events_held', 'blogs_published', 'testimonials', 'client_meetings', 'jobs_won', 'shortlists', 'first_interviews', 'offers', 'placements', 'referrals_received', 'leads_passed'])
    // Three quarterly targets, judged against the target valid today; outputs carry no target.
    assert.deepEqual(q.slice(0, 3).map((r) => [r.target, r.hit]), [[1, false], [3, false], [3, false]])
    assert.ok(q.slice(3).every((r) => r.target === null && r.hit === null))
    // An earlier test received a referral this quarter.
    const by = Object.fromEntries(q.map((r) => [r.kpi, r.total]))
    assert.ok(by.referrals_received >= 1, JSON.stringify(by))

    const out = await rows(`select kpi, week::text as week, total::int as total from kpi_output_week_view`)
    assert.ok(out.some((r) => r.kpi === 'referrals_received' && r.total >= 1), JSON.stringify(out))

    // The follow-up lifecycle test completed its rows in this quarter unless the
    // quarter has just turned, so the figure is checked for shape only.
    const [f] = await rows(`select completed::int as completed, on_time::int as on_time from followups_quarter_view`)
    assert.ok(f.completed >= f.on_time && f.on_time >= 0, JSON.stringify(f))

    const [funnel] = await rows(`select found::int as found, chased::int as chased, replied::int as replied, meetings::int as meetings, won::int as won from bd_funnel_view`)
    assert.ok(funnel.found >= funnel.chased && funnel.chased >= funnel.replied, JSON.stringify(funnel))
    assert.ok(funnel.found >= 5, JSON.stringify(funnel))
  })
  await reviewer(async () => {
    assert.equal(await count('kpi_quarter_view'), 11)
    assert.equal(await count('bd_funnel_view'), 1)
  })
  await noRole(async () => {
    assert.equal(await count('kpi_quarter_view'), 0)
    assert.deepEqual(await rows(`select found::int as found from bd_funnel_view`), [{ found: 0 }])
  })
})

test('P1-45: a target changes from next Monday, a saved prompt is the one active version, the stop switch holds the queue (T-SET-1, T-SET-4, AGT-1)', async () => {
  // A queued message, as the send engine would leave it (the app itself can only make drafts).
  const [p] = await rows(`select id from people limit 1`)
  await db.query(`insert into messages (owner_id, type, channel, person_id, to_name, created_by, level_at_creation, state) values ($1, 'thanks_after_call', 'email', $2, 'Ben Sample', 'send', 'one_click', 'queued')`, [ownerId, p.id])
  await owner(async () => {
    const [{ monday }] = await rows(`select (week_of(now()) + 7)::text as monday`)
    const [{ from }] = await rows(`select set_target('posts_chased', 'week', 25)::text as from`)
    assert.equal(from, monday)
    // This week is still judged on the old target.
    const [thisWeek] = await rows(`select target::int as target from kpi_this_week where kpi = 'posts_chased'`)
    assert.equal(thisWeek.target, 20)
    const targets = await rows(`select target::int as target, valid_from::text as valid_from, valid_to::text as valid_to from targets where kpi = 'posts_chased' order by valid_from`)
    assert.equal(targets.length, 2)
    assert.equal(targets[0].target, 20)
    assert.ok(targets[0].valid_to < monday, JSON.stringify(targets))
    assert.deepEqual([targets[1].target, targets[1].valid_from, targets[1].valid_to], [25, monday, null])
    // A second change before that Monday replaces the waiting row, not adds another.
    await rows(`select set_target('posts_chased', 'week', 22)`)
    assert.equal(await count(`targets where kpi = 'posts_chased'`), 2)
    assert.equal((await rows(`select 1 from audit_log where action = 'target changed'`)).length, 2)

    const [{ v1 }] = await rows(`select save_agent_prompt('a3_jobs', 'Find PMM job posts.', null) as v1`)
    const [{ v2 }] = await rows(`select save_agent_prompt('a3_jobs', 'Find PMM job posts in the US.', 'US only') as v2`)
    assert.deepEqual([v1, v2], [1, 2])
    assert.deepEqual(await rows(`select version, active from agent_prompts where agent = 'a3_jobs' order by version`), [{ version: 1, active: false }, { version: 2, active: true }])
    await rows(`select activate_agent_prompt('a3_jobs', 1)`)
    assert.deepEqual(await rows(`select version from agent_prompts where agent = 'a3_jobs' and active`), [{ version: 1 }])
    assert.match(await refused(`select save_agent_prompt('a3_jobs', '   ', null)`), /needs some text/)

    // T-SET-1: a queued message is held the moment sending is turned off.
    await db.query(`update app_settings set all_sending_paused = true`)
    assert.deepEqual(await rows(`select state, hold_reason from messages where to_name = 'Ben Sample' and type = 'thanks_after_call'`), [{ state: 'held', hold_reason: 'Sending is off' }])
    await db.query(`update app_settings set all_sending_paused = false`)
    assert.equal((await rows(`select 1 from audit_log where action in ('stop switch on', 'stop switch off')`)).length, 2)
  })
  await reviewer(async () => {
    assert.match(await refused(`select set_target('posts_chased', 'week', 1)`), /Only the owner/)
    assert.match(await refused(`select save_agent_prompt('a3_jobs', 'x', null)`), /Only the owner/)
  })
  await anon(async () => {
    assert.match(await refused(`select set_target('posts_chased', 'week', 1)`), /permission denied/)
  })
})

test('P1-46: find a person, export them, delete them with counts and an audit row (T-SET-5); KPI events stay', async () => {
  await owner(async () => {
    const found = await rows(`select display_name, counts from person_find('ben sam')`)
    assert.equal(found.length, 1)
    assert.equal(found[0].display_name, 'Ben Sample')
    assert.ok(found[0].counts.league_members >= 1 && found[0].counts.touches >= 1, JSON.stringify(found[0].counts))
    assert.match(await refused(`select * from person_find('b')`), /at least two/)

    const [{ id }] = await rows(`select id from people where display_name = 'Ben Sample'`)
    const [{ doc }] = await rows(`select person_export($1) as doc`, [id])
    assert.equal(doc.person.display_name, 'Ben Sample')
    assert.ok(Array.isArray(doc.touches) && doc.touches.length >= 1)
    assert.ok(Array.isArray(doc.league_members) && doc.league_members.length >= 1)

    const kpiBefore = await count('kpi_events')
    assert.match(await refused(`select person_delete($1, 'yes')`, [id]), /Type DELETE/)
    const [{ counts }] = await rows(`select person_delete($1, 'DELETE') as counts`, [id])
    assert.equal(counts.people, 1)
    assert.ok(counts.league_members >= 1 && counts.touches >= 1, JSON.stringify(counts))
    assert.equal(counts.crm, 'The CRM record was not touched')
    assert.equal(await count(`people where id = '${id}'`), 0)
    assert.equal(await count(`touches where person_id = '${id}'`), 0)
    assert.equal(await count(`league_members where person_id = '${id}'`), 0)
    assert.equal(await count(`inbox_items where person_id = '${id}'`), 0)
    assert.equal(await count('kpi_events'), kpiBefore)
    const audit = await rows(`select action from audit_log where target_id = $1 order by id`, [id])
    assert.deepEqual(audit.map((a) => a.action), ['export', 'person delete'])
    assert.equal((await rows(`select 1 from audit_log where action = 'person search'`)).length, 1)

    await rows(`select record_export('everything')`)
    assert.equal((await rows(`select 1 from audit_log where action = 'export' and detail ->> 'kind' = 'everything'`)).length, 1)
  })
  await reviewer(async () => {
    assert.match(await refused(`select * from person_find('ben')`), /Only the owner/)
    assert.match(await refused(`select person_delete(gen_random_uuid(), 'DELETE')`), /Only the owner/)
  })
  await anon(async () => {
    assert.match(await refused(`select * from person_find('ben')`), /permission denied/)
  })
})

test('0027: the owner adds, colours, reorders and archives lists and groups members; the reviewer cannot (workspace)', async () => {
  await owner(async () => {
    await db.query(`insert into lists (owner_id, key, name, kind, colour, position) values ($1, 'warm_clients', 'Warm clients', 'other', 'pending', 5)`, [ownerId])
    assert.deepEqual(await rows(`select name, colour, archived from lists where key = 'warm_clients'`), [{ name: 'Warm clients', colour: 'pending', archived: false }])
    assert.match(await refused(`update lists set colour = 'purple' where key = 'warm_clients'`), /check constraint/)
    await db.query(`update lists set archived = true, position = 9 where key = 'warm_clients'`)
    assert.deepEqual(await rows(`select archived, position from lists where key = 'warm_clients'`), [{ archived: true, position: 9 }])
    const [m] = await rows(`select id from league_members limit 1`)
    await db.query(`update league_members set group_name = 'Boston' where id = $1`, [m.id])
    assert.deepEqual(await rows(`select group_name from league_members where id = $1`, [m.id]), [{ group_name: 'Boston' }])
    assert.match(await refused(`update league_members set group_name = '   ' where id = '${m.id}'`), /check constraint/)
  })
  await reviewer(async () => {
    assert.ok(await refused(`insert into lists (owner_id, key, name) values (gen_random_uuid(), 'x', 'X')`))
    assert.ok(await refused(`update lists set name = 'Y'`))
  })
})

test('sign-in: the allow-list decides who gets a role, compared without case or spaces', async () => {
  const users = await rows(`select email, display_name, role from app_users`)
  assert.deepEqual(users, [{ email: OWNER_EMAIL, display_name: 'Jason Sample', role: 'owner' }])
  assert.equal((await rows(`select 1 from audit_log where action = 'refused sign-in'`)).length, 1)

  const token = async (userId) =>
    (await rows(`select custom_access_token_hook($1::jsonb) -> 'claims' as claims`, [JSON.stringify({ user_id: userId, claims: { sub: userId, app_role: 'owner' } })]))[0].claims
  assert.equal((await token(ownerId)).app_role, 'owner')
  // A forged or stale role in the claims is removed for anyone not in app_users.
  assert.equal((await token('00000000-0000-0000-0000-0000000000cc')).app_role, undefined)

  const hook = async (email) => (await rows(`select before_user_created_hook($1::jsonb) as r`, [JSON.stringify({ user: { email } })]))[0].r
  assert.deepEqual(await hook(' OWNER@example.test'), {})
  assert.equal((await hook('stranger@example.test')).error.http_code, 403)

  await db.exec(`update auth.users set last_sign_in_at = now() where id = '${ownerId}'`)
  assert.equal((await rows(`select 1 from audit_log where action = 'sign-in' and actor = '${OWNER_EMAIL}'`)).length, 1)
  await owner(async () => {
    await db.query(`select audit_sign_out()`)
  })
})

test('the browser cannot call the hook or audit functions directly', async () => {
  await owner(async () => {
    assert.match(await refused(`select custom_access_token_hook('{}'::jsonb)`), /permission denied/)
    assert.match(await refused(`select before_user_created_hook('{}'::jsonb)`), /permission denied/)
    assert.match(await refused(`select write_audit('x')`), /permission denied/)
  })
  await anon(async () => assert.match(await refused(`select audit_sign_out()`), /permission denied/))
})

test('settings: the stop switch and the reviewer address are logged, and the reviewer joins the allow-list', async () => {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ownerId, email: OWNER_EMAIL, app_role: 'owner' })])
    await db.exec(`set local role authenticated`)
    await db.query(`update app_settings set all_sending_paused = true, reviewer_email = $1`, [REVIEWER_EMAIL])
    assert.match(await refused(`update app_settings set reviewer_email = $1`, [OWNER_EMAIL]), /already has access/)
    await db.exec(`reset role`)
    assert.deepEqual(await rows(`select role from allowed_emails where email = $1`, [REVIEWER_EMAIL]), [{ role: 'reviewer' }])
    const actions = (await rows(`select action from audit_log where actor = $1 order by id`, [OWNER_EMAIL])).map((r) => r.action)
    assert.ok(actions.includes('stop switch on') && actions.includes('reviewer added'), actions.join(', '))
    // Removing the address removes the reviewer's access.
    await db.exec(`insert into auth.users (email) values ('${REVIEWER_EMAIL}')`)
    assert.equal(await count(`app_users where role = 'reviewer'`), 1)
    await db.exec(`update app_settings set reviewer_email = null`)
    assert.equal(await count(`app_users where role = 'reviewer'`), 0)
  } finally {
    await db.exec('rollback')
  }
})

test('helpers: week_of and working_days', async () => {
  const [r] = await rows(
    `select week_of('2026-11-09 00:30+00')::text as mon, week_of('2026-07-05 23:30+00')::text as bst,
            working_days('2026-11-13', '2026-11-17') as wd, quarter_of('2026-12-31 23:59+00')::text as q`,
  )
  // 23:30 UTC on Sunday 5 July is 00:30 on Monday 6 July in London.
  assert.deepEqual(r, { mon: '2026-11-09', bst: '2026-07-06', wd: 2, q: '2026-10-01' })
})

test('P1-18: the owner reads the sample business development rows, and every inbox item points at its record', async () => {
  await owner(async () => {
    assert.equal(await count('job_leads'), 6)
    assert.equal(await count('wider_leads'), 2)
    assert.equal(await count('coaching_sessions'), 2)
    assert.equal(await count('referrals'), 1)
    assert.equal(await count('campaigns'), 1)
    assert.equal(await count('target_companies'), 2)
    const unlinked = await rows(`select dedup_key from inbox_items where type in ('job_lead', 'wider_lead', 'referral') and ref_id is null`)
    assert.deepEqual(unlinked, [])
    const [{ n }] = await rows(
      `select count(*)::int as n from inbox_items i join job_leads j on j.id = i.ref_id where i.ref_table = 'job_leads' and j.company = i.company`,
    )
    assert.equal(n, 3)
  })
})

test('JOB-1, JOB-3, JOB-4: stage dates are set once; won needs a search; dead needs a reason and a purge date', async () => {
  await owner(async () => {
    const [{ id }] = await rows(
      `insert into job_leads (company, company_key, role, role_key) values ('Acme Pretend', 'acme pretend', 'PMM', 'product marketing manager') returning id`,
    )
    const [lead] = await rows(`select owner_id, stage, chased_on, function, country from job_leads where id = $1`, [id])
    assert.deepEqual(lead, { owner_id: ownerId, stage: 'new', chased_on: null, function: 'pmm', country: 'US' })
    await db.query(`update job_leads set stage = 'chased' where id = $1`, [id])
    const [chased] = await rows(`select chased_on::text as d from job_leads where id = $1`, [id])
    assert.ok(chased.d, 'chased_on set by trigger')
    // The date is kept when the stage moves back and forward.
    await db.query(`update job_leads set stage = 'new' where id = $1`, [id])
    await db.query(`update job_leads set stage = 'replied' where id = $1`, [id])
    const [again] = await rows(`select chased_on::text as c, replied_on::text as r from job_leads where id = $1`, [id])
    assert.deepEqual(again, { c: chased.d, r: chased.d })
    assert.match(await refused(`update job_leads set stage = 'job_won' where id = $1`, [id]), /job_leads_won_needs_search/)
    assert.match(await refused(`update job_leads set stage = 'dead' where id = $1`, [id]), /job_leads_dead_needs_reason/)
    assert.match(await refused(`update job_leads set stage = 'dead', dead_reason = 'bored' where id = $1`, [id]), /dead_reason_check/)
    const [dead] = await rows(`update job_leads set stage = 'dead', dead_reason = 'filled' where id = $1 returning purge_after::text as p`, [id])
    assert.equal(dead.p, (await rows(`select (current_date + interval '12 months')::date::text as d`))[0].d)
    const [reopened] = await rows(`update job_leads set stage = 'new' where id = $1 returning purge_after, dead_reason`, [id])
    assert.deepEqual(reopened, { purge_after: null, dead_reason: null })
    assert.match(
      await refused(`insert into job_leads (company, company_key, role, role_key) values ('Acme Pretend', 'acme pretend', 'PMM', 'product marketing manager')`),
      /job_leads_owner_id_company_key_role_key_key/,
    )
    assert.match(await refused(`update job_leads set matched = '[1,2,3,4]' where id = $1`, [id]), /matched_is_short_list/)
  })
})

test('REF-2 and WID-1: contacting a referral owes a thank-you in two working days; passing a wider lead needs a colleague', async () => {
  await owner(async () => {
    const [ref] = await rows(`select id, purge_after::text as p, received_on::text as r from referrals`)
    assert.equal(ref.p, (await rows(`select ($1::date + interval '24 months')::date::text as d`, [ref.r]))[0].d)
    const before = await count(`follow_ups where kind = 'referral_thanks'`)
    await db.query(`update referrals set stage = 'contacted' where id = $1`, [ref.id])
    await db.query(`update referrals set stage = 'new' where id = $1`, [ref.id])
    await db.query(`update referrals set stage = 'contacted' where id = $1`, [ref.id])
    const fus = await rows(`select person_name, due_on::text as due, source, direction, status from follow_ups where kind = 'referral_thanks'`)
    assert.equal(fus.length, before + 1, 'one thank-you however often the stage moves')
    assert.deepEqual(fus[0], { person_name: 'Eve Invented', due: (await rows(`select add_working_days(current_date, 2)::text as d`))[0].d, source: 'rule', direction: 'owed', status: 'open' })
    const [r] = await rows(`select contacted_on::text as c from referrals where id = $1`, [ref.id])
    assert.ok(r.c)

    const [wl] = await rows(`select id from wider_leads where status = 'spotted'`)
    assert.match(await refused(`update wider_leads set status = 'passed' where id = $1`, [wl.id]), /wider_leads_passed_needs_colleague/)
    const [passed] = await rows(`update wider_leads set status = 'passed', passed_to = 'Sam Colleague' where id = $1 returning passed_on::text as p`, [wl.id])
    assert.equal(passed.p, (await rows(`select current_date::text as d`))[0].d)
    assert.match(await refused(`update wider_leads set currency = 'pounds' where id = $1`, [wl.id]), /currency_check/)
  })
})

test('T-KPI-1: a lead moved new, chased, new, chased writes one posts_chased event, and the owner cannot fake it', async () => {
  await owner(async () => {
    const [{ id }] = await rows(
      `insert into job_leads (company, company_key, role, role_key, function) values ('Vandelay Pretend', 'vandelay pretend', 'Head of PMM', 'head of product marketing', 'pmm') returning id`,
    )
    for (const stage of ['chased', 'new', 'chased', 'replied', 'chased']) {
      await db.query(`update job_leads set stage = $2 where id = $1`, [id, stage])
    }
    const events = await rows(`select label, is_pmm, week::text as week from kpi_events where source_table = 'job_leads' and source_id = $1`, [id])
    assert.deepEqual(events, [{ label: 'Chased: Head of PMM at Vandelay Pretend', is_pmm: true, week: (await rows(`select week_of(now())::text as w`))[0].w }])
    // A lead inserted already chased, as an import might be, counts nothing.
    await db.query(`insert into job_leads (company, company_key, role, role_key, stage, chased_on) values ('Vandelay Pretend', 'vandelay pretend', 'PMM', 'product marketing manager', 'chased', current_date)`)
    assert.equal(await count(`kpi_events where source_table = 'job_leads'`), 1)
    // The browser still cannot write a KPI event itself (KPI-1).
    assert.match(await refused(`insert into kpi_events (kpi, source_table, source_id) values ('posts_chased', 'job_leads', $1)`, [id]), /row-level security/)
  })
})

test('COA-2, REF-1, WID-1: coaching held, referral received and lead passed each count once, with no name in the label', async () => {
  await owner(async () => {
    const [{ id: person }] = await rows(`select id from people where display_name = 'Finn Fictional'`)
    const [{ id: session }] = await rows(`insert into coaching_sessions (person_id, booked_for, source) values ($1, now(), 'inbound') returning id`, [person])
    assert.equal(await count(`kpi_events where source_id = '${session}'`), 0)
    await db.query(`update coaching_sessions set status = 'held' where id = $1`, [session])
    await db.query(`update coaching_sessions set status = 'booked' where id = $1`, [session])
    await db.query(`update coaching_sessions set status = 'held' where id = $1`, [session])
    const [held] = await rows(`select held_at from coaching_sessions where id = $1`, [session])
    assert.ok(held.held_at, 'held_at set when the status reaches held')
    assert.deepEqual(await rows(`select kpi, label from kpi_events where source_id = $1`, [session]), [{ kpi: 'coaching_calls', label: 'Coaching call held' }])
    // A session inserted as held, as an import might be, counts too: it is the first time it is seen held.
    const [{ id: imported }] = await rows(`insert into coaching_sessions (person_id, held_at, source, status) values ($1, now() - interval '3 days', 'league', 'held') returning id`, [person])
    assert.equal(await count(`kpi_events where source_id = '${imported}'`), 1)

    // The sample referral wrote its event on insert, dated the day it was received.
    const [ref] = await rows(
      `select e.label, e.happened_at::date::text as d, r.received_on::text as r from kpi_events e join referrals r on r.id = e.source_id where e.kpi = 'referrals_received'`,
    )
    assert.deepEqual(ref, { label: 'Referral received: person', d: ref.r, r: ref.r })

    const [wl] = await rows(`select id from wider_leads where status = 'spotted'`)
    await db.query(`update wider_leads set status = 'passed', passed_to = 'Sam Colleague' where id = $1`, [wl.id])
    await db.query(`update wider_leads set status = 'spotted' where id = $1`, [wl.id])
    await db.query(`update wider_leads set status = 'passed' where id = $1`, [wl.id])
    assert.deepEqual(await rows(`select label, is_pmm from kpi_events where source_id = $1`, [wl.id]), [{ label: 'Passed: Account Executive at Fabrikam Test Ltd', is_pmm: false }])

    // KPI-4: no label anywhere names a person from the sample week.
    const [{ n }] = await rows(`select count(*)::int as n from kpi_events e join people p on e.label ilike '%' || p.display_name || '%'`)
    assert.equal(n, 0)
  })
})

test('FUP-2: completing a follow-up sets completed_at, on_time and purge_after; reopening clears them; on time counts once', async () => {
  await owner(async () => {
    const [{ id }] = await rows(
      `insert into follow_ups (person_name, kind, reason, source, due_on, dedup_key)
       values ('Gia Imaginary', 'after_coaching', 'Send the two examples', 'call', current_date, 'test:fu:ontime') returning id`,
    )
    assert.match(await refused(`update follow_ups set status = 'snoozed' where id = $1`, [id]), /follow_ups_snoozed_needs_date/)
    const [done] = await rows(`update follow_ups set status = 'done' where id = $1 returning on_time, completed_at, purge_after`, [id])
    assert.equal(done.on_time, true)
    assert.ok(done.completed_at && done.purge_after)
    const [reopened] = await rows(`update follow_ups set status = 'open' where id = $1 returning on_time, completed_at, purge_after`, [id])
    assert.deepEqual(reopened, { on_time: null, completed_at: null, purge_after: null })
    await db.query(`update follow_ups set status = 'handled_offline' where id = $1`, [id])
    assert.equal(await count(`kpi_events where source_table = 'follow_ups' and source_id = '${id}'`), 1)
    const [[e]] = [await rows(`select label from kpi_events where source_id = $1`, [id])]
    assert.equal(e.label, 'Follow-up on time: after coaching')

    // Late: due last week, done today. No event.
    const [{ id: late }] = await rows(
      `insert into follow_ups (person_name, kind, reason, source, due_on, dedup_key)
       values ('Hal Hypothetical', 'chase', 'Chase the CV', 'email', current_date - 7, 'test:fu:late') returning id`,
    )
    const [l] = await rows(`update follow_ups set status = 'done' where id = $1 returning on_time`, [late])
    assert.equal(l.on_time, false)
    assert.equal(await count(`kpi_events where source_id = '${late}'`), 0)

    // Closed with no action completes but never counts.
    const [{ id: closed }] = await rows(
      `insert into follow_ups (person_name, kind, reason, source, due_on, dedup_key)
       values ('Ivy Invented', 'other', 'Nothing needed', 'manual', current_date, 'test:fu:closed') returning id`,
    )
    const [c] = await rows(`update follow_ups set status = 'closed' where id = $1 returning on_time, completed_at`, [closed])
    assert.equal(c.on_time, true)
    assert.ok(c.completed_at)
    assert.equal(await count(`kpi_events where source_id = '${closed}'`), 0)

    // A snooze keeps the due date and clears when it ends.
    await db.query(`update follow_ups set status = 'snoozed', snoozed_until = current_date + 1 where id = $1`, [closed])
    const [s] = await rows(`update follow_ups set status = 'open' where id = $1 returning snoozed_until, due_on::text as due`, [closed])
    assert.equal(s.snoozed_until, null)
    assert.ok(s.due)

    const [v] = await rows(`select completed::int as completed, on_time::int as on_time from followups_week_view where week = week_of(now())`)
    assert.deepEqual(v, { completed: 2, on_time: 1 })
  })
  await reviewer(async () => assert.equal(await refused(`select * from followups_week_view`), 'no rows'))
  await anon(async () => assert.match(await refused(`select * from followups_week_view`), /permission denied/))
})

test('P1-37: two lists, six sample members, cadence dates set on insert (LEA-1) and reset by a touch (LEA-2)', async () => {
  await owner(async () => {
    assert.deepEqual(await rows(`select key, kind, seats from lists order by position`), [
      { key: 'senior_network', kind: 'leader', seats: 50 },
      { key: 'top_candidates', kind: 'a_star', seats: 50 },
    ])
    assert.equal(await count('league_members'), 6)
    // Finn has no touch yet: due 7 days after being added. Ben, premier, last touched 4 days ago: due in 14.
    const [finn] = await rows(`select (next_due_on - added_on) as d from league_members m join people p on p.id = m.person_id where p.name_key = 'finn fictional'`)
    assert.equal(finn.d, 7)
    const [ben] = await rows(`select (next_due_on - last_touch_on) as d, missed_cycles from league_members m join people p on p.id = m.person_id where p.name_key = 'ben sample'`)
    assert.deepEqual(ben, { d: 18, missed_cycles: 0 })
    // The view says who is late or due, with the strongest live signal.
    const states = await rows(`select display_name, state, live_signal from league_due_view order by display_name`)
    assert.deepEqual(states.find((s) => s.display_name === 'Ben Sample'), { display_name: 'Ben Sample', state: 'fine', live_signal: 'promoted' })
    assert.equal(states.find((s) => s.display_name === 'Cara Placeholder').state, 'late')
    assert.equal(states.find((s) => s.display_name === 'Eve Invented').state, 'due')
    assert.equal(states.length, 6)

    // A touch today resets Cara's cadence: one touch per person, day and kind (TOU-4).
    const [{ id: cara }] = await rows(`select id from people where name_key = 'cara placeholder'`)
    await db.query(`insert into touches (person_id, channel, kind, source) values ($1, 'linkedin', 'message_replied', 'manual')`, [cara])
    assert.match(await refused(`insert into touches (person_id, channel, kind, source) values ($1, 'linkedin', 'message_replied', 'manual')`, [cara]), /touches_dedup_key_key/)
    const [after] = await rows(`select (m.next_due_on - current_date) as d, m.missed_cycles, v.state from league_members m join league_due_view v on v.id = m.id where m.person_id = $1`, [cara])
    assert.deepEqual(after, { d: 30, missed_cycles: 0, state: 'fine' })

    // A tier change writes history (LEA-6); the owner reads it and cannot write it.
    await db.query(`update league_members set tier = 'premier', why = 'Briefed a search' where person_id = $1`, [cara])
    const hist = await rows(`select from_tier, to_tier, reason from league_history h join league_members m on m.id = h.member_id where m.person_id = $1`, [cara])
    assert.deepEqual(hist, [{ from_tier: 'championship', to_tier: 'premier', reason: 'Briefed a search' }])
    assert.match(await refused(`insert into league_history (owner_id, member_id) values (gen_random_uuid(), gen_random_uuid())`), /permission denied/)

    // SIG-3: the out-of-ICP signal is stored as ignored and never new. SIG-4: expiry set by type.
    const sig = await rows(`select status, (expires_on - seen_on) as days from signals where person_key = 'nobody relevant'`)
    assert.deepEqual(sig, [{ status: 'ignored', days: 90 }])
    const [hal] = await rows(`select (expires_on - seen_on) as days from signals where person_key = 'hal hypothetical'`)
    assert.equal(hal.days, 30)
  })
})

test('10.5: do not contact removes from the league, closes follow-ups and cancels drafts in one go; may_contact says no', async () => {
  const [{ id: ben }] = await rows(`select id from people where name_key = 'ben sample'`)
  await owner(async () => {
    assert.equal((await rows(`select may_contact($1, 'contoso demo') as ok`, [ben]))[0].ok, true)
    await db.query(`update people set do_not_contact = true where id = $1`, [ben])
    assert.equal((await rows(`select may_contact($1, 'contoso demo') as ok`, [ben]))[0].ok, false)
    const [m] = await rows(`select active, removed_reason, removed_on is not null as removed from league_members where person_id = $1`, [ben])
    assert.deepEqual(m, { active: false, removed_reason: 'do_not_contact', removed: true })
    assert.equal(await count(`follow_ups where person_id = '${ben}' and status = 'open'`), 0)
    assert.equal(await count(`signals where person_id = '${ben}' and status = 'new'`), 0)
    assert.equal(await count(`league_due_view where person_id = '${ben}'`), 0)
    assert.equal(await count(`league_history h join league_members m on m.id = h.member_id where m.person_id = '${ben}' and h.reason = 'do_not_contact'`), 1)
  })
  // A company on the list blocks everyone at it.
  await owner(async () => {
    await db.query(`insert into do_not_contact (scope, company, reason) values ('company', 'Fabrikam Test Ltd', 'Asked us not to')`)
    const [{ id: cara }] = await rows(`select id from people where name_key = 'cara placeholder'`)
    assert.equal((await rows(`select may_contact($1, 'fabrikam test ltd') as ok`, [cara]))[0].ok, false)
  })
})

test('nightly league and signal sweeps count cycles and expire signals, and the browser cannot run them', async () => {
  // Finn was added 120 days ago and never touched: one window at a time, one run at a time.
  const [{ n }] = await rows(`select league_missed_cycles() as n`)
  assert.equal(n, 1)
  // Both championship members (Cara and Dev) pushed 40 days back, plus Finn again.
  await db.exec(`update league_members set next_due_on = current_date - 40 where tier = 'championship'`)
  const [{ n: moved }] = await rows(`select league_missed_cycles() as n`)
  assert.equal(moved, 3)
  const [m] = await rows(`select missed_cycles from league_members where tier = 'championship' and missed_cycles > 0`)
  assert.equal(m.missed_cycles, 1)
  await db.exec(`update signals set expires_on = current_date - 1 where person_key = 'hal hypothetical'`)
  const [{ n: expired }] = await rows(`select signals_expire() as n`)
  assert.equal(expired, 1)
  await owner(async () => {
    assert.match(await refused(`select league_missed_cycles()`), /permission denied/)
    assert.match(await refused(`select signals_expire()`), /permission denied/)
  })
})

test('add_working_days skips weekends', async () => {
  const [r] = await rows(
    `select add_working_days('2026-11-12', 2)::text as thu, add_working_days('2026-11-13', 2)::text as fri,
            add_working_days('2026-11-14', 1)::text as sat, add_working_days('2026-11-16', 5)::text as mon`,
  )
  // Thursday 12 November plus 2 is Monday 16. Friday 13 plus 2 is Tuesday 17.
  // Saturday 14 plus 1 is Monday 16. Monday 16 plus 5 is Monday 23.
  assert.deepEqual(r, { thu: '2026-11-16', fri: '2026-11-17', sat: '2026-11-16', mon: '2026-11-23' })
})

test('rule 1: people hold no CV, phone, pay or note-text columns anywhere', async () => {
  const cols = await rows(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and column_name ~* '(phone|mobile|salary|\\mpay\\M|compensation|\\mcv\\M|resume|transcript|call_notes)'`,
  )
  assert.deepEqual(cols, [])
  assert.match(
    await refusedPlain(`insert into people (owner_id, display_name, name_key, email, in_crm) values ('${ownerId}', 'X', 'x', 'x@example.test', true)`),
    /people_email_only_outside_crm/,
  )
})

async function refusedPlain(sql) {
  await db.exec('begin')
  try {
    await db.exec(sql)
    return 'no error'
  } catch (e) {
    return e.message
  } finally {
    await db.exec('rollback')
  }
}


test('P1-14, P1-15, P1-16: keys, run-start, the write contract with its merges and refusals, idempotency, context, run-finish', async () => {
  // Keys (32.4): made by the owner, checked by the endpoint, never readable.
  let key
  await owner(async () => {
    ;[{ key }] = await rows(`select agent_key_create('a3_jobs') as key`)
    assert.match(key, /^[0-9a-f]{64}$/)
    assert.match(await refused(`select key_hash from agents`), /permission denied/)
  })
  await reviewer(async () => {
    assert.match(await refused(`select agent_key_create('a3_jobs')`), /Only the owner/)
  })
  // The owner block above rolls back, so the hash is planted as the database would hold it.
  key = 'ab'.repeat(32)
  await db.query(`update agents set key_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex'), key_created_at = now() where code = 'a3_jobs'`, [key])
  assert.deepEqual(await rows(`select agent_authenticate('a3_jobs', $1) as ok`, [key]), [{ ok: true }])
  assert.deepEqual(await rows(`select agent_authenticate('a3_jobs', 'wrong') as ok`), [{ ok: false }])

  // Keys are built the same way for every agent (16.5).
  assert.deepEqual(await rows(`select norm_company('The Fabrikam Test Ltd.') as c, norm_role('Sr. PMM (Remote) - New York') as r, norm_text('  Élan  O''Neil ') as n`),
    [{ c: 'fabrikam test', r: 'senior product marketing manager', n: 'elan o neil' }])

  // E1: a run opens with the prompt, the blocks, the lookback and the caps.
  const [{ start }] = await rows(`select agent_run_start('a3_jobs', 'schedule', 'match') as start`)
  assert.equal(start.enabled, true)
  assert.ok(start.run_id)
  // The prompt saved in the P1-45 test rolled back with its owner block; a run without one is still a run.
  assert.ok(start.prompt === null || start.prompt.version >= 1)
  assert.equal(start.settings.per_run_caps.linkedin_connect, 10)
  assert.equal(start.paused.all_sending, false)
  const run = start.run_id

  // E2: a batch where each record stands on its own.
  const batch = [
    { kind: 'job_lead', data: { company: 'Fabrikam Test Ltd', role: 'Senior PMM', source: 'linkedin_post', source_url: 'https://example.com/jobs/1', poster_name: 'Nia Pretend', poster_title: 'VP Marketing', fit_score: 82, fit_reason: 'B2B SaaS, New York', city: 'new_york', spec_draft: 'Hi Nia, I saw the Senior PMM role.' } },
    { kind: 'job_lead', data: { company: 'Fabrikam Test', role: 'Sr PMM', source: 'indeed', source_url: 'https://example.com/jobs/2' } },
    { kind: 'job_lead', data: { company: 'Globex Fiction', role: 'Account Executive', function: 'sales', source: 'linkedin_post', source_url: 'https://example.com/jobs/3' } },
    { kind: 'job_lead', data: { company: 'Initech Mock', role: 'PMM', source: 'linkedin_post' } },
    { kind: 'job_lead', data: { company: 'Initech Mock', role: 'PMM', source: 'linkedin_post', source_url: 'https://example.com/jobs/4', salary: '200k' } },
    { kind: 'signal', data: { person_name: 'Someone', signal_type: 'promoted', source: 'linkedin_alert' } },
    { kind: 'call', data: { ref: 'x' } },
  ]
  const [{ out }] = await rows(`select agent_write($1, $2) as out`, [run, JSON.stringify(batch)])
  assert.deepEqual([out.created, out.merged, out.rejected], [2, 1, 4], JSON.stringify(out))
  const r = out.results
  assert.equal(r[0].outcome, 'created')
  assert.ok(r[0].inbox_item_id)
  assert.equal(r[1].outcome, 'merged')
  assert.equal(r[1].id, r[0].id)
  assert.equal(r[2].outcome, 'created')
  assert.match(r[2].note, /wider lead/)
  assert.deepEqual([r[3].code, r[3].field], ['invalid', 'source_url'])
  assert.deepEqual([r[4].code, r[4].field], ['invalid', 'salary'])
  assert.equal(r[5].code, 'not_allowed')
  assert.match(r[6].message, /later phase/)
  // The merged lead gained a source and there is one inbox item for it; the poster is a thin person row.
  assert.deepEqual(await rows(`select sources, stage from job_leads where id = $1`, [r[0].id]), [{ sources: ['linkedin_post', 'indeed'], stage: 'new' }])
  assert.equal(await count(`inbox_items where ref_table = 'job_leads' and ref_id = '${r[0].id}'`), 1)
  assert.deepEqual(await rows(`select display_title, kind from people where name_key = 'nia pretend'`), [{ display_title: 'VP Marketing', kind: 'leader' }])
  assert.deepEqual(await rows(`select items_created, items_merged, items_rejected from agent_runs where id = $1`, [run]), [{ items_created: 2, items_merged: 1, items_rejected: 4 }])

  // AGW-1: the same batch with the same key returns the stored result.
  const [{ once }] = await rows(`select agent_write_once($1, 'batch-1', $2) as once`, [run, JSON.stringify([{ kind: 'person', data: { display_name: 'Kit Invented', display_company: 'Hooli Sample', kind: 'leader' } }])])
  assert.equal(once.created, 1)
  const [{ again }] = await rows(`select agent_write_once($1, 'batch-1', $2) as again`, [run, JSON.stringify([{ kind: 'person', data: { display_name: 'Kit Invented' } }])])
  assert.equal(again.repeated, true)
  assert.equal(again.results[0].id, once.results[0].id)
  assert.equal(await count(`people where name_key = 'kit invented'`), 1)

  // E3: the run closes with its counts; a second close is refused.
  const [{ fin }] = await rows(`select agent_run_finish($1, 'ok', '[]', 'Four found') as fin`, [run])
  assert.deepEqual([fin.status, fin.created], ['ok', 3])
  assert.match(await refusedPlain(`select agent_run_finish('${run}', 'ok')`), /already finished/)
  assert.deepEqual(await rows(`select consecutive_failures, consecutive_empty from agents where code = 'a3_jobs'`), [{ consecutive_failures: 0, consecutive_empty: 0 }])

  // Signals (A4): new, then merged within 30 days, and refused for the do-not-contact list.
  await db.query(`insert into do_not_contact (owner_id, name, scope, reason) values ($1, 'Ray Pretend', 'person', 'Asked')`, [ownerId])
  const [{ s4 }] = await rows(`select agent_run_start('a4_signals', 'schedule') as s4`)
  const [{ sig }] = await rows(`select agent_write($1, $2) as sig`, [s4.run_id, JSON.stringify([
    { kind: 'signal', data: { person_name: 'Gia Imaginary', company: 'Initech Mock', signal_type: 'new_role', strength: 3, source: 'linkedin_alert', source_url: 'https://example.com/in/gia', in_icp: true } },
    { kind: 'signal', data: { person_name: 'Gia Imaginary', company: 'Initech Mock', signal_type: 'new_role', source: 'alex_leads' } },
    { kind: 'signal', data: { person_name: 'Ray Pretend', signal_type: 'promoted', source: 'linkedin_alert' } },
    { kind: 'message', data: { type: 'signal_congrats', channel: 'email', person_name: 'Gia Imaginary', body: 'Congratulations.', level: 'automatic' } },
    { kind: 'message', data: { type: 'signal_congrats', channel: 'email', person_name: 'Gia Imaginary', body: 'Congratulations.', level: 'one_click' } },
  ])])
  assert.deepEqual(sig.results.map((x) => x.outcome), ['created', 'merged', 'rejected', 'rejected', 'created'], JSON.stringify(sig))
  assert.equal(sig.results[2].code, 'policy_refused')
  assert.equal(sig.results[3].code, 'policy_refused')
  assert.match(sig.results[4].note, /draft only/)
  assert.ok(sig.results[0].inbox_item_id)
  assert.deepEqual(await rows(`select state, level_at_creation, created_by from messages where id = $1`, [sig.results[4].id]), [{ state: 'draft', level_at_creation: 'draft_only', created_by: 'a4_signals' }])

  // Follow-ups, touches and the calendar (A5).
  const [{ s5 }] = await rows(`select agent_run_start('a5_followups', 'schedule') as s5`)
  const [{ fu }] = await rows(`select agent_write($1, $2) as fu`, [s5.run_id, JSON.stringify([
    { kind: 'follow_up', data: { person_name: 'Ben Sample', company: 'Contoso Demo Inc', kind: 'chase', reason: 'Owes a reply on the Boston role', source: 'email', due_on: '2026-11-20', thread_ref: 'thread-1' } },
    { kind: 'follow_up', data: { person_name: 'Ben Sample', kind: 'chase', reason: 'Same thread', source: 'email', due_on: '2026-11-17', thread_ref: 'thread-1' } },
    { kind: 'follow_up', data: { person_name: 'Ben Sample', kind: 'chase', reason: 'No date', source: 'email' } },
    { kind: 'touch', data: { person_name: 'Nobody Known', channel: 'email', kind: 'message_replied', source: 'email' } },
    { kind: 'touch', data: { person_name: 'Ben Sample', company: 'Contoso Demo Inc', channel: 'email', kind: 'message_replied', source: 'email', touched_on: '2026-11-13' } },
    { kind: 'calendar_today', data: { events: [{ event_ref: 'ev-1', starts_at: '2026-11-16T14:00:00Z', title: 'Candidate screen', call_type: 'candidate_screen', person_name: 'Ben Sample' }, { event_ref: 'ev-2', starts_at: '2026-11-16T16:00:00Z', title: 'Team catch-up', call_type: 'internal', is_external: false }] } },
    { kind: 'kpi_event', data: { kpi: 'client_meetings', source_table: 'calendar', source_ref: 'ev-9', label: 'Client meeting: Contoso Demo Inc' } },
    { kind: 'kpi_event', data: { kpi: 'client_meetings', source_table: 'calendar', source_ref: 'ev-9', label: 'Client meeting: Contoso Demo Inc' } },
    { kind: 'kpi_event', data: { kpi: 'posts_chased', source_ref: 'x' } },
  ])])
  assert.deepEqual(fu.results.map((x) => x.outcome), ['created', 'merged', 'rejected', 'rejected', 'created', 'created', 'created', 'merged', 'rejected'], JSON.stringify(fu))
  assert.deepEqual(await rows(`select due_on::text as due_on from follow_ups where id = $1`, [fu.results[0].id]), [{ due_on: '2026-11-17' }])
  assert.equal(fu.results[3].code, 'not_found')
  assert.equal(await count('calendar_today'), 2)
  assert.equal(fu.results[8].code, 'not_allowed')

  // Referrals (A6) count once through the trigger and land in the Inbox.
  const [{ s6 }] = await rows(`select agent_run_start('a6_calls', 'after_call') as s6`)
  const [{ ref }] = await rows(`select agent_write($1, $2) as ref`, [s6.run_id, JSON.stringify([
    { kind: 'referral', data: { referred_name: 'Ivy Example', referred_company: 'Stark Sample', referred_by_name: 'Ben Sample', context: 'Mentioned on the call' } },
    { kind: 'referral', data: { referred_name: 'Ivy Example', referred_company: 'Stark Sample', referred_by_name: 'Ben Sample' } },
  ])])
  assert.deepEqual(ref.results.map((x) => x.outcome), ['created', 'merged'])
  assert.equal(await count(`kpi_events where kpi = 'referrals_received' and source_id = '${ref.results[0].id}'`), 1)
  assert.equal(await count(`inbox_items where ref_table = 'referrals' and ref_id = '${ref.results[0].id}'`), 1)

  // E4: an agent gets only what is listed against it (15.5).
  const [{ ctx }] = await rows(`select agent_context('a3_jobs', array['pool', 'job_keys', 'dnc']) as ctx`)
  assert.ok(Array.isArray(ctx.job_keys) && ctx.job_keys.some((k) => k.company_key === 'fabrikam test'))
  assert.ok(Array.isArray(ctx.dnc) && ctx.dnc.some((d) => d.name === 'Ray Pretend'))
  assert.ok(Array.isArray(ctx.pool))
  assert.match(await refusedPlain(`select agent_context('a3_jobs', array['league'])`), /not_allowed/)
  const [{ k1 }] = await rows(`select agent_context('a1_review', array['kpis']) as k1`)
  assert.ok(Array.isArray(k1.kpis.lines))

  // E9 and the browser: the owner may ask for a run and nothing else.
  await owner(async () => {
    const [{ id }] = await rows(`select request_run('a7_events') as id`)
    assert.ok(id)
    assert.equal(await count(`run_requests where agent = 'a7_events' and taken_at is null`), 1)
    assert.match(await refused(`select agent_write('${run}', '[]')`), /permission denied/)
    assert.match(await refused(`select agent_run_start('a3_jobs', 'manual')`), /permission denied/)
    assert.match(await refused(`select agent_context('a3_jobs', array['dnc'])`), /permission denied/)
    assert.match(await refused(`select * from agent_requests`), /permission denied/)
  })
  await rows(`select agent_run_start('a7_events', 'schedule')`)
  assert.equal(await count(`run_requests where agent = 'a7_events' and taken_at is null`), 0)
  await anon(async () => {
    assert.match(await refused(`select agent_authenticate('a3_jobs', 'x')`), /permission denied/)
  })
})

// Runs last: it moves rows on by date, which the tests above read as seeded.
test('P1-47: the nightly job sweeps, retains and raises system notices; no browser role can run it (33.8, 34.5)', async () => {
  // Rows the night should act on, planted as the database.
  const [p] = await rows(`select id from people limit 1`)
  await db.query(`insert into inbox_items (owner_id, type, agent, title, dedup_key, status, created_at) values ($1, 'job_lead', 'a3_jobs', 'Old lead', 'test:stale', 'new', now() - interval '20 days')`, [ownerId])
  await db.query(`insert into inbox_items (owner_id, type, agent, title, dedup_key, status, snoozed_until) values ($1, 'signal', 'a4_signals', 'Snoozed signal', 'test:woken', 'snoozed', current_date - 1)`, [ownerId])
  await db.query(`insert into follow_ups (owner_id, person_id, person_name, kind, reason, source, direction, due_on, status, snoozed_until, dedup_key) values ($1, $2, 'Ben Sample', 'chase', 'test', 'manual', 'owed', current_date - 3, 'snoozed', current_date, 'test:fu:reopen')`, [ownerId, p.id])
  await db.query(`insert into agent_runs (agent, trigger, status, started_at) values ('a2_content', 'schedule', 'running', now() - interval '45 minutes')`)
  await db.query(`insert into agent_runs (agent, trigger, status, started_at, finished_at) values ('a1_review', 'schedule', 'ok', now() - interval '100 days', now() - interval '100 days')`)
  await db.query(`insert into messages (owner_id, type, channel, person_id, to_name, created_by, level_at_creation, state, updated_at) values ($1, 'thanks_after_call', 'email', $2, 'Ben Sample', 'send', 'one_click', 'queued', now() - interval '30 hours')`, [ownerId, p.id])
  await db.query(`update agents set consecutive_failures = 2 where code = 'a4_signals'`)
  await db.query(`insert into audit_log (actor, action) values ('test', 'old entry')`)
  await db.query(`update audit_log set at = now() - interval '25 months' where action = 'old entry'`)
  const callsBefore = await count('calendar_today')
  assert.ok(callsBefore > 0)

  const [{ night }] = await rows(`select nightly() as night`)
  assert.equal(night.sweeps.inbox_stale, 1)
  assert.equal(night.sweeps.inbox_woken, 1)
  assert.equal(night.sweeps.follow_ups_reopened, 1)
  assert.equal(night.sweeps.runs_timed_out, 1)
  assert.equal(night.retention.agent_runs, 1)
  assert.equal(night.retention.audit_log, 1)
  assert.equal(night.retention.calendar_today, callsBefore)
  assert.equal(night.retention.errors, undefined, JSON.stringify(night.retention))
  assert.deepEqual(await rows(`select status from inbox_items where dedup_key = 'test:stale'`), [{ status: 'stale' }])
  assert.deepEqual(await rows(`select status from inbox_items where dedup_key = 'test:woken'`), [{ status: 'new' }])
  assert.deepEqual(await rows(`select status from follow_ups where dedup_key = 'test:fu:reopen'`), [{ status: 'open' }])
  assert.equal(await count('calendar_today'), 0)
  assert.equal(await count(`audit_log where action = 'old entry'`), 0)

  // The checks: a failed agent, a stuck queue and a timed-out run, each once a day.
  const raised = night.checks.raised
  assert.ok(raised.includes('agent-failed:a4_signals') && raised.includes('send-queue') && raised.includes('stale-runs'), JSON.stringify(raised))
  const notices = await rows(`select title from inbox_items where type = 'system_notice' and status = 'new' order by title`)
  assert.ok(notices.some((x) => x.title === 'The relationship signals agent did not run'), JSON.stringify(notices))
  const [{ again }] = await rows(`select nightly() as again`)
  assert.deepEqual(again.checks.raised, [])
  assert.equal((await rows(`select 1 from audit_log where action = 'nightly run'`)).length, 2)

  await owner(async () => {
    assert.match(await refused(`select nightly()`), /permission denied/)
    assert.match(await refused(`select retention_job()`), /permission denied/)
    assert.match(await refused(`select nightly_sweeps()`), /permission denied/)
    const [sys] = await rows(`select runs::int as runs, failed::int as failed from system_week_view where week = week_of(now())`)
    assert.ok(sys && sys.runs >= 1 && sys.failed >= 1, JSON.stringify(sys))
  })
  await reviewer(async () => {
    assert.equal(await count('system_week_view'), 0)
  })
  // Tidy the planted rows so later tests see the sample week as seeded.
  await db.query(`delete from inbox_items where dedup_key like 'test:%'`)
  await db.query(`delete from follow_ups where dedup_key like 'test:%'`)
})

test('P1-44: content drafts and data points through the write contract, the format check, held drafts, the KPI triggers and who may read (12.1 to 12.3, 16.8, 16.9, 17.3)', async () => {
  // 16.9: the format check in words.
  const body = Array.from({ length: 6 }, (_, i) => `Line ${i} has a handful of words in it for the test.`).join('\n')
  assert.deepEqual(await rows(`select ok, reason from content_format_check('A short hook', $1, 'A close', '{}')`, [body]), [{ ok: true, reason: null }])
  const [{ reason }] = await rows(`select reason from content_format_check('A hook!', 'Too short', $1, '{a,b,c}')`, ['A close\nover two lines'])
  assert.match(reason, /body 2 words, under 40/)
  assert.match(reason, /close on more than one line/)
  assert.match(reason, /more than 2 tags/)
  assert.match(reason, /an exclamation mark/)

  const [{ start }] = await rows(`select agent_run_start('a2_content', 'schedule', 'calls') as start`)
  const run = start.run_id
  const draft = (over) => ({ kind: 'content_draft', data: { kind: 'linkedin_post', run_source: 'calls', angle: 'hiring_manager', topic: 'Why PMM hires stall at the brief', hook: 'Most PMM hires stall before the first interview.', body, close_line: 'Fix the brief first.', hashtags: ['productmarketing'], ...over } })
  const [{ out }] = await rows(`select agent_write($1, $2) as out`, [run, JSON.stringify([
    draft({}),
    draft({ topic: 'Why PMM hires stall at the brief.' }),
    draft({ topic: 'A named person', body: body + '\nI spoke to Nia Pretend about this last week and she agreed.' }),
    draft({ topic: 'Research with no data', run_source: 'pmm_community' }),
    draft({ topic: 'Research with no link', run_source: 'pmm_community', data_point: '41% of PMM roles now ask for AI tooling' }),
    draft({ topic: 'Research with a link', run_source: 'recruiting_news', angle: 'talent_market', data_point: '41% of PMM roles now ask for AI tooling', data_point_url: 'https://example.com/report' }),
    draft({ topic: 'Wrong shape', kind: 'idea' }),
    { kind: 'data_point', data: { statement: 'Open PMM roles in New York', value: '312', source_name: 'Example Jobs', source_url: 'https://example.com/jobs', category: 'job_postings', as_of: '2026-11-10' } },
    { kind: 'data_point', data: { statement: 'No link', value: '1', source_name: 'Example' } },
    { kind: 'data_point', data: { statement: 'Stale', value: '1', source_name: 'Example', source_url: 'https://example.com/old', as_of: '2026-01-01' } },
    { kind: 'content_draft', data: { topic: 'x', salary: '1' } },
  ])])
  const r = out.results
  assert.deepEqual([out.created, out.merged, out.rejected], [4, 0, 7], JSON.stringify(out))
  assert.equal(r[0].outcome, 'created')
  assert.equal(r[0].note, null)
  assert.deepEqual([r[1].code, r[1].id], ['duplicate', r[0].id])
  assert.match(r[1].message, /Pick another/)
  assert.equal(r[2].code, 'policy_refused')
  assert.match(r[2].message, /names Nia Pretend/)
  assert.deepEqual([r[3].code, r[3].field], ['invalid', 'data_point'])
  assert.equal(r[4].outcome, 'created')
  assert.match(r[4].note, /Held: The data point has no link/)
  assert.ok(r[4].inbox_item_id)
  assert.equal(r[5].outcome, 'created')
  assert.deepEqual([r[6].code, r[6].field], ['invalid', 'kind'])
  assert.equal(r[7].outcome, 'created')
  assert.deepEqual([r[8].code, r[8].field], ['invalid', 'source_url'])
  assert.deepEqual([r[9].code, r[9].field], ['invalid', 'as_of'])
  assert.deepEqual([r[10].code, r[10].field], ['invalid', 'salary'])
  // Ranks (17.3): research with a link 30 + 15 + 20 + 10; the calls draft 20 + 20 + 15 + 10; the held one has no link.
  assert.deepEqual(await rows(`select status, rank::int as rank, format_ok, word_count from content_items where id in ($1, $2, $3) order by rank desc`, [r[0].id, r[5].id, r[4].id]),
    [{ status: 'draft', rank: 75, format_ok: true, word_count: 72 }, { status: 'draft', rank: 65, format_ok: true, word_count: 72 }, { status: 'held', rank: 50, format_ok: true, word_count: 72 }])
  assert.deepEqual(await rows(`select type, ref_table, dedup_key from inbox_items where id = $1`, [r[4].inbox_item_id]), [{ type: 'content_draft', ref_table: 'content_items', dedup_key: `content_draft:held:${r[4].id}` }])
  assert.equal(await count(`data_points where run_id = '${run}'`), 1)

  // The context A2 may read, and only that.
  const [{ ctx }] = await rows(`select agent_context('a2_content', array['topic_keys', 'sources']) as ctx`)
  assert.ok(ctx.topic_keys.includes('why pmm hires stall at the brief'))
  assert.deepEqual(ctx.sources, [])
  assert.match(await refusedPlain(`select agent_context('a2_content', array['league'])`), /not_allowed/)

  // CON-3 and CON-4: posting counts once; a testimonial received counts once; planned needs a day.
  await owner(async () => {
    assert.deepEqual(await rows(`select topic from content_items where status = 'draft' order by rank desc limit 1`), [{ topic: 'Research with a link' }])
    assert.match(await refused(`update content_items set status = 'planned' where id = '${r[0].id}'`), /needs a day/)
    assert.equal(await refused(`update content_items set status = 'planned', planned_for = current_date + 1 where id = '${r[0].id}'`), null)
    assert.equal(await refused(`update content_items set status = 'posted', post_url = 'https://example.com/post' where id = '${r[0].id}'`), null)
    assert.equal(await refused(`update content_items set impressions = 120 where id = '${r[0].id}'`), null)
    assert.equal(await count(`kpi_events where kpi = 'linkedin_posts' and source_id = '${r[0].id}'`), 1)
    assert.equal(await refused(`insert into content_items (kind, topic, topic_key, status, received_on, used_where) values ('testimonial', 'From a placed PMM', 'from a placed pmm', 'approved', current_date, 'website')`), null)
    assert.equal(await count(`kpi_events where kpi = 'testimonials'`), 1)
    assert.equal(await refused(`insert into content_items (kind, topic, topic_key, status) values ('idea', 'A post on levelling', 'a post on levelling', 'idea')`), null)
    assert.match(await refused(`delete from content_items where id = '${r[0].id}'`), /permission denied/)
    assert.match(await refused(`insert into data_points (statement, value, source_name, source_url) values ('x', '1', 'x', 'https://example.com')`), /permission denied|row-level security/)
    assert.equal(await refused(`select * from data_points`), null)
  })
  await reviewer(async () => {
    for (const t of ['content_items', 'content_sources', 'data_points']) assert.equal(await count(t), 0, `${t} as reviewer`)
  })
  // Tidy, so the nightly test sees the sample week as seeded.
  await db.query(`delete from inbox_items where ref_table = 'content_items'`)
  await db.query(`delete from data_points where run_id = $1`, [run])
  await db.query(`delete from content_items where run_id = $1`, [run])
  await db.query(`delete from agent_runs where id = $1`, [run])
})

test('0029: a problem report gets a sequential reference, resolving stamps the time and reopening clears it, notes attach once written, the reviewer sees nothing', async () => {
  await owner(async () => {
    const [r] = await rows(`insert into problem_reports (description, severity, reporter_name, route, user_agent, viewport, app_version) values ('Save does nothing on the calendar', 'high', 'Jason', '/content/calendar', 'TestBrowser/1', '1280x800', 'test') returning id, ref, status, resolved_at`)
    assert.equal(r.status, 'new')
    assert.ok(r.ref >= 1)
    assert.equal(r.resolved_at, null)
    const [r2] = await rows(`insert into problem_reports (description) values ('A second one') returning ref`)
    assert.equal(r2.ref, r.ref + 1)
    await db.query(`insert into problem_notes (report_id, author, body) values ($1, 'Jason', 'Seen it again on Thursday')`, [r.id])
    assert.equal(await count(`problem_notes where report_id = '${r.id}'`), 1)
    assert.match(await refused(`update problem_notes set body = 'changed'`), /permission denied/, 'notes are never edited')
    await db.query(`update problem_reports set status = 'resolved', resolution = 'Fixed in 0029' where id = $1`, [r.id])
    assert.notEqual((await rows(`select resolved_at from problem_reports where id = $1`, [r.id]))[0].resolved_at, null)
    await db.query(`update problem_reports set status = 'closed' where id = $1`, [r.id])
    assert.notEqual((await rows(`select resolved_at from problem_reports where id = $1`, [r.id]))[0].resolved_at, null)
    await db.query(`update problem_reports set status = 'new' where id = $1`, [r.id])
    assert.equal((await rows(`select resolved_at from problem_reports where id = $1`, [r.id]))[0].resolved_at, null)
    assert.match(await refused(`insert into problem_reports (description) values ('   ')`), /check constraint/)
    assert.match(await refused(`update problem_reports set severity = 'urgent' where id = '${r.id}'`), /check constraint/)
    assert.match(await refused(`delete from problem_reports where id = '${r.id}'`), /permission denied/)
    assert.match(await refused(`delete from problem_notes where report_id = '${r.id}'`), /permission denied/)
  })
  await reviewer(async () => {
    assert.equal(await count('problem_reports'), 0)
    assert.equal(await count('problem_notes'), 0)
    assert.ok(await refused(`insert into problem_reports (description) values ('x')`))
  })
})

test('0030: the owner asks for a profile pull, the signals agent sees the request at run-start and writes a short summary back; long or contact-bearing summaries are refused', async () => {
  const [{ pid }] = await rows(`select id as pid from people where name_key = 'nia pretend'`)
  let reqId
  await owner(async () => {
    ;[{ reqId }] = await rows(`select request_run('a4_signals', $1) as "reqId"`, [`profile:${pid}`])
    assert.ok(reqId)
    // The same ask twice is one request.
    assert.deepEqual(await rows(`select request_run('a4_signals', $1) = $2::uuid as same`, [`profile:${pid}`, reqId]), [{ same: true }])
  })
  // The owner block rolled back, so the request is planted as the database would hold it.
  await db.query(`insert into run_requests (agent, requested_by, note) values ('a4_signals', 'owner', $1)`, [`profile:${pid}`])
  const [{ start }] = await rows(`select agent_run_start('a4_signals', 'manual') as start`)
  assert.deepEqual(start.requests, [`profile:${pid}`])
  assert.equal(await count(`run_requests where agent = 'a4_signals' and taken_at is null`), 0)
  const [{ out }] = await rows(`select agent_write($1, $2) as out`, [start.run_id, JSON.stringify([
    { kind: 'person', data: { display_name: 'Nia Pretend', display_company: 'Fabrikam Test Ltd', profile_summary: 'VP Marketing at Fabrikam Test. Ten years in B2B SaaS product marketing, New York. Posts about positioning and pricing.' } },
    { kind: 'person', data: { display_name: 'Nia Pretend', profile_summary: 'x'.repeat(601) } },
    { kind: 'person', data: { display_name: 'Nia Pretend', profile_summary: 'Reach her on nia@example.com' } },
  ])])
  assert.deepEqual([out.results[0].outcome, out.results[0].id], ['merged', pid])
  assert.deepEqual([out.results[1].code, out.results[1].field], ['invalid', 'profile_summary'])
  assert.equal(out.results[2].code, 'policy_refused')
  const [p] = await rows(`select profile_summary, profile_pulled_at from people where id = $1`, [pid])
  assert.match(p.profile_summary, /^VP Marketing at Fabrikam Test/)
  assert.notEqual(p.profile_pulled_at, null)
  const [{ ctx }] = await rows(`select agent_context('a4_signals', array['league']) as ctx`)
  assert.ok(Array.isArray(ctx.league))
  await rows(`select agent_run_finish($1, 'ok')`, [start.run_id])
})

// ---------------------------------------------------------------- run

let failed = 0
for (const { name, fn } of tests) {
  try {
    await fn()
    console.log(`  ok    ${name}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n').join('\n        ')}`)
  }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed, ${allTables.length} tables`)
await db.close()
process.exit(failed ? 1 : 0)

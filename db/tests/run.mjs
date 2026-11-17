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

for (const file of ['targets.sql', 'lists.sql', 'sample_week.sql', 'sample_league.sql', 'templates.sql', 'content_ideas.sql']) {
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
    assert.equal((await rows(`select code from agents`)).length, 10) // the seven agents, the sender (0039), the campaign runner (0040) and the task assistant (0052)
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
    const [{ tid }] = await rows(`insert into templates (owner_id, type, name, channel, body) values ($1, 'thanks_after_call', 'Test', 'email', 'Hi {{first_name}}') returning id as tid`, [ownerId])
    const [{ id }] = await rows(
      `insert into messages (owner_id, type, channel, to_name, created_by, level_at_creation, template_id, state)
       values ($1, 'thanks_after_call', 'email', 'Ada Example', 'a6_calls', 'automatic', $2, 'queued') returning id`,
      [ownerId, tid],
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

test('li_post_date reads the posting day from a LinkedIn post id (0047)', async () => {
  const [r] = await rows(
    `select li_post_date(array['https://www.linkedin.com/feed/update/urn:li:share:7525703447967408129/'])::text as urn,
            li_post_date(array['https://www.linkedin.com/posts/someone_hiring-pmm-share-7525703447967408129-AbCd'])::text as posts,
            li_post_date(array['https://example.com/job'])::text as none,
            li_post_date(null)::text as empty`,
  )
  // Id 7525703447967408129 >> 22 is 9 November 2026, 23:38 UTC, which is the 9th in London.
  assert.equal(r.urn, '2026-11-09')
  assert.equal(r.posts, '2026-11-09')
  assert.equal(r.none, null)
  assert.equal(r.empty, null)
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

// ---------------------------------------------------------------- 0049 Tasks

test('0049 tasks_view: one queue from every source, owner only, with the context links and no contact details', async () => {
  const kinds = await owner(async () => rows(`select kind, count(*)::int as n from tasks_view group by kind order by kind`))
  const byKind = Object.fromEntries(kinds.map((k) => [k.kind, k.n]))
  assert.equal(byKind.follow_up, await count(`follow_ups where status = 'open'`), 'every open follow-up')
  assert.ok((byKind.job_lead ?? 0) >= 1, 'job leads from the inbox')
  assert.equal(byKind.auto_sent, undefined, 'sent for you is not a task')
  const links = await owner(async () => rows(`select links from tasks_view where jsonb_array_length(links) > 0 limit 1`))
  if (links.length) assert.ok(links[0].links.every((l) => l.label && l.url))
  await reviewer(async () => assert.equal((await rows(`select * from tasks_view`)).length, 0))
  await anon(async () => assert.match(await refused(`select * from tasks_view`), /permission denied/))
  const cols = await rows(`select column_name from information_schema.columns where table_name = 'tasks_view'`)
  assert.ok(!cols.some((c) => /email|phone|cv_text|note_text|address/.test(c.column_name)))
})

test('0049 task_overrides: the owner edits a task without touching the agent\'s row; done and snooze hide it; nobody else writes', async () => {
  const [t] = await owner(async () => rows(`select task_key, title from tasks_view where kind = 'job_lead' limit 1`))
  await owner(async () => {
    await db.query(`insert into task_overrides (task_key, title, notes, due_on, sort_order) values ($1, 'My words', 'Remember this', current_date + 2, 1)`, [t.task_key])
    const [seen] = await rows(`select title, o_title, o_notes, o_due_on, o_sort_order from tasks_view where task_key = $1`, [t.task_key])
    assert.equal(seen.title, t.title, 'the agent\'s title is untouched')
    assert.equal(seen.o_title, 'My words')
    assert.equal(seen.o_notes, 'Remember this')
    assert.equal(seen.o_sort_order, 1)
    await db.query(`update task_overrides set status = 'snoozed', snoozed_until = current_date + 1 where task_key = $1`, [t.task_key])
    assert.equal((await rows(`select 1 from tasks_view where task_key = $1`, [t.task_key])).length, 0, 'snoozed until tomorrow')
    await db.query(`update task_overrides set status = 'done' where task_key = $1`, [t.task_key])
    assert.equal((await rows(`select 1 from tasks_view where task_key = $1`, [t.task_key])).length, 0, 'done hides it')
    assert.match(await refused(`delete from task_overrides where task_key = $1`, [t.task_key]), /permission denied|no rows/)
  })
  await reviewer(async () => assert.match(await refused(`insert into task_overrides (task_key, title) values ('x', 'y')`), /permission denied|policy/))
})

test('0049 raise_suggestions: standing rules propose once, never twice, and a binned one stays binned', async () => {
  await db.exec(`insert into searches (owner_id, client, client_key, role, next_step, next_step_on) values ('${ownerId}', 'Rule Sample Ltd', 'rule sample', 'Head of PMM', 'Send the shortlist', current_date - 3)`)
  const first = (await rows(`select raise_suggestions() as n`))[0].n
  assert.ok(first >= 1, `raised ${first}`)
  const [s] = await rows(`select title, type, agent from inbox_items where title = 'Rule Sample Ltd: Send the shortlist'`)
  assert.equal(s.type, 'suggestion')
  assert.equal(s.agent, 'system')
  const before = await count(`inbox_items where type = 'suggestion'`)
  await rows(`select raise_suggestions()`)
  assert.equal(await count(`inbox_items where type = 'suggestion'`), before, 'running twice adds nothing')
  const seen = await owner(async () => rows(`select kind from tasks_view where kind = 'suggestion'`))
  assert.equal(seen.length, before)
  await db.exec(`update inbox_items set status = 'binned', bin_reason = 'Already done' where title = 'Rule Sample Ltd: Send the shortlist'`)
  await rows(`select raise_suggestions()`)
  assert.equal(await count(`inbox_items where title = 'Rule Sample Ltd: Send the shortlist' and status <> 'binned'`), 0)
  await db.exec(`update searches set next_step = null, next_step_on = null where client = 'Rule Sample Ltd'`)
})

test('0049 after each call: the calendar asks for a write-up ten minutes after an external call ends, once per call, and run-start takes only what is due', async () => {
  await db.exec(`delete from run_requests where agent = 'a6_calls'`)
  await db.exec(`insert into calendar_today (owner_id, starts_at, ends_at, title, call_type, is_external, event_ref) values
    ('${ownerId}', now() - interval '2 hours', now() - interval '90 minutes', 'Past screen', 'candidate_screen', true, 'cal-past'),
    ('${ownerId}', now() + interval '3 hours', now() + interval '4 hours', 'Later screen', 'candidate_screen', true, 'cal-later'),
    ('${ownerId}', now() + interval '5 hours', null, 'Team catch-up', 'internal', false, 'cal-internal')`)
  const reqs = await rows(`select calendar_ref, note, run_after from run_requests where agent = 'a6_calls' order by run_after`)
  assert.deepEqual(reqs.map((r) => r.calendar_ref), ['cal-past', 'cal-later'])
  assert.match(reqs[0].note, /Write up: Past screen/)
  await db.exec(`update calendar_today set ends_at = ends_at + interval '30 minutes' where event_ref = 'cal-later'`)
  assert.equal(await count(`run_requests where agent = 'a6_calls'`), 2, 'moving a call moves the request, not doubles it')
  const started = (await rows(`select agent_run_start('a6_calls', 'schedule') as r`))[0].r
  assert.equal(started.requests.length, 1, 'only the call that has ended is due')
  assert.match(started.requests[0], /Write up: Past screen/)
  assert.deepEqual(started.calendar_refs, ['cal-past'])
  const [run] = await rows(`select trigger from agent_runs where id = '${started.run_id}'`)
  assert.equal(run.trigger, 'after_call')
  assert.equal(await count(`run_requests where agent = 'a6_calls' and taken_at is null`), 1, 'the later call still waits')
  await db.exec(`delete from calendar_today where event_ref in ('cal-past', 'cal-later', 'cal-internal')`)
  await db.exec(`delete from run_requests where agent = 'a6_calls'`)
})

// ---------------------------------------------------------------- 0051 Spec and the workspace

test('0051 spec: the owner asks for matches on someone spoken to; the agent claims it with the calls and the live jobs, answers with skills and matches, and the pasted CV goes', async () => {
  const [p] = await rows(`select id from people where display_name = 'Ada Example'`)
  await anon(async () => assert.match(String(await refused(`select request_spec('${p.id}')`)), /permission denied|Only the owner/))
  await reviewer(async () => assert.match(String(await refused(`select request_spec('${p.id}')`)), /Only the owner/))
  await owner(async () => {
    const [{ j1 }] = await rows(`select request_spec($1, 'https://example.com/in/ada', 'pasted', 'Ada Example. Senior PMM. Launches, pricing, sales enablement.') as j1`, [p.id])
    const [{ j2 }] = await rows(`select request_spec($1) as j2`, [p.id])
    assert.equal(j2, j1, 'a second ask returns the open request')
    const jid = j1
    const [me] = await rows(`select linkedin_url, warm_spec from people where id = $1`, [p.id])
    assert.equal(me.linkedin_url, 'https://example.com/in/ada')
    assert.equal(me.warm_spec, true, 'asking marks them a good candidate')
    assert.match(String(await refused(`select cv_text from spec_requests`)), /permission denied/)
    const [seen] = await rows(`select status, cv_where from spec_requests where id = $1`, [jid])
    assert.deepEqual(seen, { status: 'waiting', cv_where: 'pasted' })
    assert.match(String(await refused(`select request_spec($1, null, 'pasted', '')`, [p.id])), /needs the text/)
  })
  // The owner's block rolled back. The agent part starts from a row written directly.
  const jid = (await rows(`insert into spec_requests (owner_id, person_id, linkedin_url, cv_where, cv_text) values ($1, $2, 'https://example.com/in/ada', 'pasted', 'Ada Example. Senior PMM. Launches, pricing, sales enablement.') returning id`, [ownerId, p.id]))[0].id
  // The agent claims it through context.
  const [{ ctx }] = await rows(`select agent_context('a6_calls', array['spec_jobs']) as ctx`)
  const job = ctx.spec_jobs.find((j) => j.job_id === jid)
  assert.ok(job, 'claimed')
  assert.equal(job.person.name, 'Ada Example')
  assert.equal(job.cv.where, 'pasted')
  assert.match(job.cv.text, /Launches/)
  assert.ok(Array.isArray(job.calls) && Array.isArray(job.leads) && Array.isArray(job.searches) && Array.isArray(job.accounts))
  assert.ok(job.leads.length >= 1, 'live leads to match against')
  await assert.rejects(db.query(`select agent_context('a3_jobs', array['spec_jobs'])`), /may not ask/)
  // The answer.
  await db.exec(`insert into agent_runs (agent, trigger) values ('a6_calls', 'manual')`)
  const [run] = await rows(`select id from agent_runs where agent = 'a6_calls' order by started_at desc limit 1`)
  const lead = job.leads[0]
  const bad = (await rows(`select agent_write($1, $2::jsonb) as r`, [run.id, JSON.stringify([{ kind: 'spec_result', data: { job_id: jid, status: 'ready', skills: ['launches'], summary: 'Call her on 07700 900123', matches: [] } }])]))[0].r
  assert.equal(bad.results[0].outcome, 'rejected', 'a phone number is refused')
  const good = (await rows(`select agent_write($1, $2::jsonb) as r`, [run.id, JSON.stringify([{ kind: 'spec_result', data: { job_id: jid, status: 'ready', skills: ['launch planning', 'pricing and packaging'], summary: 'Strong senior PMM with two launches a year.', matches: [{ kind: 'job_lead', id: lead.id, name: lead.company, role: lead.role, why: 'Same level, same city', fit: 82 }] } }])]))[0].r
  assert.equal(good.results[0].outcome, 'created', JSON.stringify(good.results[0]))
  const [done] = await rows(`select status, cv_text, result from spec_requests where id = $1`, [jid])
  assert.equal(done.status, 'ready')
  assert.equal(done.cv_text, null, 'the pasted CV is gone once answered')
  assert.equal(done.result.matches[0].name, lead.company)
  const again = (await rows(`select agent_write($1, $2::jsonb) as r`, [run.id, JSON.stringify([{ kind: 'spec_result', data: { job_id: jid, status: 'ready', skills: [], summary: '', matches: [] } }])]))[0].r
  assert.equal(again.results[0].code, 'wrong_state')
  // Only a6_calls may answer.
  await db.exec(`insert into agent_runs (agent, trigger) values ('a3_jobs', 'manual')`)
  const [r3] = await rows(`select id from agent_runs where agent = 'a3_jobs' order by started_at desc limit 1`)
  const no = (await rows(`select agent_write($1, $2::jsonb) as r`, [r3.id, JSON.stringify([{ kind: 'spec_result', data: { job_id: jid, status: 'failed' } }])]))[0].r
  assert.equal(no.results[0].code, 'not_allowed')
})

test('0051 brief and call summary: a brief job is asked for like the others and answered into the brief tab; a call carries a short summary and never more', async () => {
  const [s] = await rows(`select id, client, role from searches where status in ('open', 'intake') and not confidential order by opened_on limit 1`)
  await owner(async () => {
    const [{ j }] = await rows(`select request_search_job($1, 'brief') as j`, [s.id])
    assert.ok(j, 'the owner can ask for a brief')
  })
  const jid = (await rows(`insert into search_jobs (owner_id, search_id, kind) values ($1, $2, 'brief') returning id`, [ownerId, s.id]))[0].id
  const [{ ctx }] = await rows(`select agent_context('a6_calls', array['search_jobs']) as ctx`)
  assert.ok(ctx.search_jobs.some((j) => j.job_id === jid && j.kind === 'brief'))
  await db.exec(`insert into agent_runs (agent, trigger) values ('a6_calls', 'manual')`)
  const [run] = await rows(`select id from agent_runs where agent = 'a6_calls' order by started_at desc limit 1`)
  const out = (await rows(`select agent_write($1, $2::jsonb) as r`, [run.id, JSON.stringify([
    { kind: 'search_result', data: { job_id: jid, status: 'ready', content: 'Why open: the last director left.', structured: { why_open: 'The last director left in October', reports_to: 'CMO', sources: [{ label: 'Spott job', url: 'https://example.com/spott/jobs/1' }] } } },
    { kind: 'call', data: { granola_ref: 'g-sum-1', granola_url: 'https://example.com/notes/g-sum-1', held_at: '2026-11-16T10:00:00Z', call_type: 'client_update', search_client: s.client, search_role: s.role, match_confidence: 'confirmed', summary: 'Client happy with the shortlist. Wants two more by Friday. Jason to send the role outline.' } },
    { kind: 'call', data: { granola_ref: 'g-sum-2', held_at: '2026-11-16T11:00:00Z', call_type: 'candidate_screen', person_name: 'Ada Example', summary: 'x'.repeat(601) } },
  ])]))[0].r
  assert.equal(out.results[0].outcome, 'created', JSON.stringify(out.results[0]))
  const [note] = await rows(`select tab, structured from search_notes where search_id = $1 and tab = 'brief' order by version desc limit 1`, [s.id])
  assert.equal(note.structured.reports_to, 'CMO')
  const [c1] = await rows(`select summary, search_id from calls where granola_ref = 'g-sum-1'`)
  assert.equal(c1.search_id, s.id)
  assert.match(c1.summary, /^Client happy/)
  const [c2] = await rows(`select length(summary) as n from calls where granola_ref = 'g-sum-2'`)
  assert.equal(c2.n, 600, 'a summary is cut at 600 characters')
  await assert.rejects(db.query(`insert into calls (owner_id, held_at, summary) values ('${ownerId}', now(), repeat('x', 601))`), /summary|check/)
})

test('0052 task chat: the owner asks a task whether it is still relevant, changes its directive or hands it over; the task assistant claims it with the chat, the draft and the calls, answers in the chat and closes the task; nobody else may', async () => {
  // An open follow-up with a draft, written directly.
  const [p] = await rows(`select id from people where display_name = 'Ada Example'`)
  const mid = (await rows(`insert into messages (owner_id, type, channel, person_id, to_name, subject, body, created_by, level_at_creation, state) values ($1, 'email_reply', 'email', $2, 'Ada Example', 'Your CV', 'Any news on the brief?', 'a5_followups', 'draft_only', 'draft') returning id`, [ownerId, p.id]))[0].id
  const fid = (await rows(`insert into follow_ups (owner_id, person_id, person_name, company, kind, reason, source, direction, due_on, status, dedup_key, message_id) values ($1, $2, 'Ada Example', 'Example Co', 'email_owed', 'Promised her CV on Friday', 'email', 'owed', current_date, 'open', 'test:chat', $3) returning id`, [ownerId, p.id, mid]))[0].id
  const fu = { key: 'follow_ups:' + fid, id: fid, message_id: mid }
  await anon(async () => assert.match(String(await refused(`select request_task_job('${fu.key}', 'check')`)), /permission denied|Only the owner/))
  await reviewer(async () => assert.match(String(await refused(`select request_task_job('${fu.key}', 'check')`)), /Only the owner/))
  await owner(async () => {
    assert.match(String(await refused(`select request_task_job('${fu.key}', 'change')`)), /Say what should change/)
    const [{ j1 }] = await rows(`select request_task_job($1, 'check') as j1`, [fu.key])
    const [{ j2 }] = await rows(`select request_task_job($1, 'do', 'Send it as a short nudge') as j2`, [fu.key])
    assert.equal(j2, j1, 'one open job per task; a second ask changes it')
    const [job] = await rows(`select kind, instruction, status from task_jobs where id = $1`, [j1])
    assert.deepEqual(job, { kind: 'do', instruction: 'Send it as a short nudge', status: 'waiting' })
    const chat = await rows(`select author, kind, body from task_chat where task_key = $1 order by created_at`, [fu.key])
    assert.equal(chat.length, 2)
    assert.equal(chat[0].body, 'Is this still relevant?')
    assert.match(String(await refused(`insert into task_chat (task_key, author, body) values ('${fu.key}', 'agent', 'no')`)), /row-level security/)
    assert.match(String(await refused(`insert into task_jobs (task_key, kind) values ('${fu.key}', 'do')`)), /permission denied/)
  })
  await reviewer(async () => {
    assert.equal(await count('task_chat'), 0)
    assert.equal(await count('task_jobs'), 0)
  })
  // The owner's block rolled back. The agent part starts from rows written directly.
  await db.exec(`insert into task_chat (owner_id, task_key, author, kind, body) values ('${ownerId}', '${fu.key}', 'owner', 'do', 'Send it as a short nudge')`)
  const jid = (await rows(`insert into task_jobs (owner_id, task_key, kind, instruction) values ($1, $2, 'do', 'Send it as a short nudge') returning id`, [ownerId, fu.key]))[0].id
  const [{ ctx }] = await rows(`select agent_context('a9_tasks', array['task_jobs']) as ctx`)
  const job = ctx.task_jobs.find((j) => j.job_id === jid)
  assert.ok(job, 'claimed')
  assert.equal(job.kind, 'do')
  assert.equal(job.task.kind, 'follow_up')
  assert.equal(job.task.message.id, fu.message_id)
  assert.equal(job.chat.length, 1)
  assert.ok(job.person && job.person.name, 'the person, by name and links only')
  assert.ok(Array.isArray(job.calls))
  assert.equal(JSON.stringify(job).includes('@'), false, 'no address in what the agent gets')
  await assert.rejects(db.query(`select agent_context('a3_jobs', array['task_jobs'])`), /may not ask/)
  // The answer: a new draft and a reply, then the task is done.
  await db.exec(`insert into agent_runs (agent, trigger) values ('a9_tasks', 'manual')`)
  const [run] = await rows(`select id from agent_runs where agent = 'a9_tasks' order by started_at desc limit 1`)
  const bad = (await rows(`select agent_write($1, $2::jsonb) as r`, [run.id, JSON.stringify([{ kind: 'task_result', data: { job_id: jid, status: 'ready', reply: 'Ring 07700 900123' } }])]))[0].r
  assert.equal(bad.results[0].outcome, 'rejected', 'a phone number in the chat is refused')
  const good = (await rows(`select agent_write($1, $2::jsonb) as r`, [run.id, JSON.stringify([{ kind: 'task_result', data: { job_id: jid, status: 'ready', reply: 'Rewritten as a two-line nudge and ready to send.', done: true, draft: { body: 'A quick nudge: any news on the brief?' }, actions: ['draft rewritten'] } }])]))[0].r
  assert.equal(good.results[0].outcome, 'created', JSON.stringify(good.results[0]))
  const [m] = await rows(`select body from messages where id = $1`, [fu.message_id])
  assert.equal(m.body, 'A quick nudge: any news on the brief?')
  const [f] = await rows(`select status from follow_ups where id = $1`, [fu.id])
  assert.equal(f.status, 'done', 'done closes the task')
  const [j] = await rows(`select status, result from task_jobs where id = $1`, [jid])
  assert.equal(j.status, 'ready')
  assert.equal(j.result.closed, 'done')
  const chat = await rows(`select author, body from task_chat where task_key = $1 order by created_at`, [fu.key])
  assert.equal(chat.at(-1).author, 'agent')
  const again = (await rows(`select agent_write($1, $2::jsonb) as r`, [run.id, JSON.stringify([{ kind: 'task_result', data: { job_id: jid, status: 'ready', reply: 'x' } }])]))[0].r
  assert.equal(again.results[0].code, 'wrong_state')
  // Not relevant any more closes a derived task through the override.
  const [cv] = await rows(`select task_key from tasks_view where source not in ('inbox_items', 'follow_ups') limit 1`)
  const jid2 = (await rows(`insert into task_jobs (owner_id, task_key, kind) values ($1, $2, 'check') returning id`, [ownerId, cv.task_key]))[0].id
  await rows(`select agent_context('a9_tasks', array['task_jobs'])`)
  const gone = (await rows(`select agent_write($1, $2::jsonb) as r`, [run.id, JSON.stringify([{ kind: 'task_result', data: { job_id: jid2, status: 'ready', reply: 'They replied on Friday. Nothing to chase.', relevant: false } }])]))[0].r
  assert.equal(gone.results[0].outcome, 'created')
  const [o] = await rows(`select status from task_overrides where task_key = $1`, [cv.task_key])
  assert.equal(o.status, 'binned')
  // Only a9_tasks may answer.
  await db.exec(`insert into agent_runs (agent, trigger) values ('a3_jobs', 'manual')`)
  const [r3] = await rows(`select id from agent_runs where agent = 'a3_jobs' order by started_at desc limit 1`)
  const no = (await rows(`select agent_write($1, $2::jsonb) as r`, [r3.id, JSON.stringify([{ kind: 'task_result', data: { job_id: jid, status: 'failed' } }])]))[0].r
  assert.equal(no.results[0].code, 'not_allowed')
})

test('0053 search status follows the evidence: the agent may set intake, open, offer or on hold, counts at offer imply offer, at offer the words still update, and placed is left to the owner', async () => {
  const sid = (await rows(`insert into searches (owner_id, client, client_key, role, status) values ($1, 'Example Co', 'example-co', 'Head of Product Marketing', 'intake') returning id`, [ownerId]))[0].id
  await db.exec(`insert into agent_runs (agent, trigger) values ('a6_calls', 'manual')`)
  const [run] = await rows(`select id from agent_runs where agent = 'a6_calls' order by started_at desc limit 1`)
  const write = async (data) => (await rows(`select agent_write($1, $2::jsonb) as r`, [run.id, JSON.stringify([{ kind: 'search_counts', data: { search_id: sid, ...data } }])]))[0].r.results[0]
  // Spoken to two people: intake becomes open by itself.
  const first = await write({ n_spoken: 2, health: "warm", health_reason: "Two first calls booked." }); assert.equal(first.outcome, "merged", JSON.stringify(first))
  assert.equal((await rows(`select status from searches where id = $1`, [sid]))[0].status, 'open')
  // The agent says on hold, then open again.
  assert.equal((await write({ status: 'on_hold', health_reason: 'Client paused hiring until January.' })).outcome, 'merged')
  assert.equal((await rows(`select status from searches where id = $1`, [sid]))[0].status, 'on_hold')
  assert.equal((await write({ status: 'open' })).outcome, 'merged')
  // Placed, lost and closed are refused.
  assert.equal((await write({ status: 'placed' })).code, 'policy_refused')
  assert.equal((await write({ status: 'lost' })).code, 'policy_refused')
  // One at offer sets offer, and the status moves.
  assert.equal((await write({ n_offer: 1, health_reason: 'Verbal offer out.' })).outcome, 'merged')
  const [atOffer] = await rows(`select status, n_offer from searches where id = $1`, [sid])
  assert.deepEqual(atOffer, { status: 'offer', n_offer: 1 })
  // At offer: words update, counts and status stay (SEA-4, softened).
  const r = await write({ n_spoken: 9, status: 'open', health: 'cooling', health_reason: 'Contract sent, not yet signed.', next_step: 'Confirm the signature.', waiting_on: 'candidate' })
  assert.equal(r.outcome, 'merged')
  const [still] = await rows(`select status, n_spoken, health, health_reason, waiting_on from searches where id = $1`, [sid])
  assert.deepEqual(still, { status: 'offer', n_spoken: 2, health: 'cooling', health_reason: 'Contract sent, not yet signed.', waiting_on: 'candidate' })
  // Finished searches take nothing.
  await db.exec(`update searches set status = 'placed', placed_on = current_date where id = '${sid}'`)
  assert.equal((await write({ health: 'warm' })).code, 'wrong_state')
})

test('0054 LinkedIn outreach: a fresh lead queues its own connection request through the engine, the note waits for approval, the sender sends and reports, acceptance makes a draft message, marking it sent moves the lead, and the log shows each step to the owner only', async () => {
  await service(async () => {
    const asOwner = async (fn) => {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ownerId, email: OWNER_EMAIL, role: 'authenticated', app_role: 'owner' })])
      await db.exec('set local role authenticated')
      try {
        return await fn()
      } finally {
        await db.exec('set local role service_role')
      }
    }
    const person = async (name) =>
      (await rows(`insert into people (owner_id, display_name, name_key, display_company, company_key, kind, linkedin_url) values ($1, $2, lower($2), 'Initech Mock', 'initech mock', 'client_contact', $3) returning id`, [ownerId, name, 'https://example.com/in/' + name.split(' ')[0].toLowerCase()]))[0].id
    const lead = async (company, poster, days) => {
      const pid = await person(poster)
      return (await rows(
        `insert into job_leads (owner_id, company, company_key, role, role_key, poster_name, poster_profile_url, hiring_manager_id, posted_on, first_seen_on, sources, source_urls)
         values ($1, $2, lower($2), 'Senior PMM', 'senior product marketing manager', $3, $4, $5, current_date - $6::int, current_date - $6::int, array['linkedin_post'], array['https://example.com/linkedin/posts/1'])
         returning id, connect_message_id`,
        [ownerId, company, poster, 'https://example.com/in/' + poster.split(' ')[0].toLowerCase(), pid, days]))[0]
    }
    // A fresh lead asks for its own request; an old one does not.
    const fresh = await lead('Initech Mock', 'Gail Example', 2)
    const old = await lead('Globex Fiction', 'Hal Sample', 40)
    const [fl] = await rows(`select connect_message_id from job_leads where id = $1`, [fresh.id])
    assert.ok(fl.connect_message_id, 'a fresh lead queues a request')
    assert.equal((await rows(`select connect_message_id from job_leads where id = $1`, [old.id]))[0].connect_message_id, null, 'an old post waits for the owner')
    const [m] = await rows(`select type, channel, state, hold_reason, body, created_by, to_profile_url from messages where id = $1`, [fl.connect_message_id])
    assert.deepEqual([m.type, m.channel, m.state, m.hold_reason, m.created_by], ['linkedin_connect', 'linkedin', 'draft', 'Template needs approval', 'a3_jobs'])
    assert.equal(m.body, "Gail, I'm one of the leading PMM headhunters in the US. Would love to connect.")
    assert.ok(m.body.length <= 300)
    assert.equal(m.to_profile_url, 'https://example.com/in/gail')

    // The owner connects the old one by hand; a second press returns the same request.
    const one = await asOwner(async () => (await rows(`select lead_connect($1) as r`, [old.id]))[0].r)
    const two = await asOwner(async () => (await rows(`select lead_connect($1) as r`, [old.id]))[0].r)
    assert.equal(two.message_id, one.message_id)
    assert.equal(two.note, 'Already asked for')

    // Approving the note releases both into the queue.
    const [{ tpl }] = await rows(`select id as tpl from templates where type = 'linkedin_connect' and active order by version desc limit 1`)
    await asOwner(async () => rows(`select template_approve($1)`, [tpl]))
    const queued = await rows(`select id, state from messages where id in ($1, $2)`, [fl.connect_message_id, one.message_id])
    assert.ok(queued.every((q) => q.state === 'queued'), JSON.stringify(queued))

    // The LinkedIn sender takes them and reports: one sent, one already a first connection.
    await db.exec(`select set_config('recos.engine', 'engine', true)`)
    await db.exec(`update messages set send_after = now() - interval '1 minute' where type = 'linkedin_connect' and state = 'queued'`)
    await db.exec(`select set_config('recos.engine', '', true)`)
    const [{ t }] = await rows(`select send_tick('linkedin', 20) as t`)
    const handed = t.messages.filter((x) => [fl.connect_message_id, one.message_id].includes(x.message_id))
    assert.equal(handed.length, 2)
    assert.ok(handed.every((x) => x.to_profile_url && x.body))
    await rows(`select send_report($1, true, 'invite sent')`, [fl.connect_message_id])
    await rows(`select send_report($1, true, 'already_connected')`, [one.message_id])
    const [a] = await rows(`select outreach_stage, outreach_connection_on, connection_note from job_leads where id = $1`, [fresh.id])
    assert.equal(a.outreach_stage, 'connection_sent')
    assert.ok(a.outreach_connection_on)
    assert.match(a.connection_note, /^Gail, I'm one of the leading PMM headhunters in the US\./)
    const [b] = await rows(`select outreach_stage, li_message_id from job_leads where id = $1`, [old.id])
    assert.equal(b.outreach_stage, 'connected', 'already a first connection skips to connected')
    assert.ok(b.li_message_id)

    // The sweep: who is waiting, then who accepted.
    const [{ p }] = await rows(`select send_linkedin_pending(20) as p`)
    assert.ok(p.pending.some((x) => x.lead_id === fresh.id && x.profile_url))
    const [{ p2 }] = await rows(`select send_linkedin_pending(20) as p2`)
    assert.ok(!p2.pending.some((x) => x.lead_id === fresh.id), 'each lead is looked at once in twelve hours')
    await rows(`select send_linkedin_status($1, 'connected')`, [fresh.id])
    const [c] = await rows(`select l.outreach_stage, m.type, m.state, m.level_at_creation, m.body from job_leads l join messages m on m.id = l.li_message_id where l.id = $1`, [fresh.id])
    assert.deepEqual([c.outreach_stage, c.type, c.state, c.level_at_creation], ['connected', 'linkedin_message', 'draft', 'draft_only'])
    assert.match(c.body, /^Thanks for connecting, Gail\. I saw Initech Mock is hiring for a Senior PMM\./)
    assert.ok(!/@/.test(c.body))
    await db.exec('savepoint bad_status')
    await assert.rejects(db.query(`select send_linkedin_status($1, 'maybe')`, [fresh.id]), /connected, pending or withdrawn/)
    await db.exec('rollback to savepoint bad_status')

    // The task carries the lead: connected rises, the draft is the message.
    const inbox = (await rows(
      `insert into inbox_items (owner_id, type, agent, title, why, dedup_key, ref_table, ref_id, source_url, status)
       values ($1, 'job_lead', 'a3_jobs', 'Senior PMM at Initech Mock', 'Reported in the LinkedIn PMM hiring report of 2026-11-10. Post: "We are hiring a Senior PMM"', 'test:li', 'job_leads', $2, 'https://www.linkedin.com/posts/x', 'new') returning id`,
      [ownerId, fresh.id]))[0].id
    const [task] = await asOwner(async () => rows(`select why, rank, channel, draft, message_id, lead from tasks_view where task_key = $1`, ['inbox_items:' + inbox]))
    assert.equal(task.why, '"We are hiring a Senior PMM"', 'the agent bookkeeping is gone')
    assert.equal(task.channel, 'linkedin')
    assert.ok(Number(task.rank) >= 75, 'fresh and connected is Now')
    assert.match(task.draft, /^Thanks for connecting/)
    assert.equal(task.lead.stage, 'connected')
    assert.equal(task.lead.poster_name, 'Gail Example')

    // Marked Connected by hand in Leads, a lead gets its first message too (0055).
    const byHand = await lead('Umbrella Sample', 'Ivy Placeholder', 50)
    await asOwner(async () => rows(`update job_leads set outreach_stage = 'connected' where id = $1`, [byHand.id]))
    const [h] = await rows(`select m.type, m.state, m.body from job_leads l join messages m on m.id = l.li_message_id where l.id = $1`, [byHand.id])
    assert.deepEqual([h.type, h.state], ['linkedin_message', 'draft'])
    assert.match(h.body, /^Thanks for connecting, Ivy\./)
    assert.equal(await count(`messages where type = 'linkedin_message' and person_id = (select hiring_manager_id from job_leads where id = '${fresh.id}')`), 1, 'one draft per lead, never two')

    // With no display name, the owner's first name comes from the sign-in email.
    await db.exec(`update app_users set display_name = null where role = 'owner'`)
    await rows(`update messages set variables = '{}' where id = $1`, [fl.connect_message_id])
    const [{ v }] = await rows(`select message_variables(m) as v from messages m where id = $1`, [fl.connect_message_id])
    assert.equal(v.my_first_name, OWNER_EMAIL.split('@')[0].split('.')[0].replace(/^./, (c) => c.toUpperCase()))

    // The owner sends it in LinkedIn and marks it: the lead moves to messaged.
    await asOwner(async () => rows(`select send_action($1, 'mark_sent')`, [c.li_message_id ?? (await rows(`select li_message_id from job_leads where id = $1`, [fresh.id]))[0].li_message_id]))
    assert.equal((await rows(`select outreach_stage from job_leads where id = $1`, [fresh.id]))[0].outreach_stage, 'messaged')

    // The log: the owner sees each step, automatic or by hand; nobody else sees anything.
    const log = await asOwner(async () => rows(`select area, what, to_name, outcome, how from on_your_behalf('leads', 100)`))
    assert.ok(log.some((r) => r.area === 'linkedin' && r.outcome === 'sent' && r.how === 'auto' && r.to_name === 'Gail Example'))
    assert.ok(log.some((r) => r.outcome === 'accepted' && r.to_name === 'Gail Example'))
    assert.ok(log.some((r) => r.what === 'LinkedIn message' && r.how === 'you'))
    await asOwner(async () => assert.match(String(await refused(`select count(*) from on_your_behalf_view`)), /permission denied/))
  })
  await reviewer(async () => assert.equal((await rows(`select count(*)::int n from on_your_behalf(null, 100)`))[0].n, 0))
  await anon(async () => assert.match(String(await refused(`select * from on_your_behalf(null, 10)`)), /permission denied/))
  await reviewer(async () => assert.match(String(await refused(`select lead_connect(gen_random_uuid())`)), /Only the owner/))
  await reviewer(async () => assert.match(String(await refused(`select send_linkedin_pending(5)`)), /not_allowed|permission denied/))
  await reviewer(async () => assert.match(String(await refused(`select send_linkedin_status(gen_random_uuid(), 'connected')`)), /not_allowed|permission denied/))
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
    { kind: 'nonsense', data: {} },
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
  assert.match(r[6].message, /Unknown kind/)
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
  assert.deepEqual(sig.results.map((x) => x.outcome), ['created', 'merged', 'rejected', 'created', 'created'], JSON.stringify(sig))
  assert.equal(sig.results[2].code, 'policy_refused')
  // Asking for automatic on a draft-only type lands at the policy's level (0034).
  assert.equal(sig.results[3].state, 'draft')
  assert.match(sig.results[4].note, /draft/i)
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
  // 0045: the batch replaces only the day it covers, so the seeded rows stay.
  assert.equal(await count(`calendar_today where event_ref in ('ev-1', 'ev-2')`), 2)
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

test('connections (0041, 0042): the owner reads status only; secrets sit in the vault, out of every browser role’s reach', async () => {
  // The server's path, as service_role: connect, read back, mark failing, disconnect.
  await service(async () => {
    const [c] = await rows(`select status, account_label from connection_connect($1, 'granola', 'grn_invented_key_0001', 'Granola')`, [ownerId])
    assert.deepEqual(c, { status: 'connected', account_label: 'Granola' })
    assert.deepEqual(await rows(`select connection_secret_get($1, 'granola') as s`, [ownerId]), [{ s: 'grn_invented_key_0001' }])
    await rows(`select connection_connect($1, 'granola', 'grn_invented_key_0002')`, [ownerId])
    assert.deepEqual(await rows(`select connection_secret_get($1, 'granola') as s`, [ownerId]), [{ s: 'grn_invented_key_0002' }])
    await rows(`select connection_record($1, 'granola', 'failing', null, 'The key was refused')`, [ownerId])
    const [g] = await rows(`select status, account_label, last_error, connected_at is not null as was_connected from connections where provider = 'granola'`)
    assert.deepEqual(g, { status: 'failing', account_label: 'Granola', last_error: 'The key was refused', was_connected: true })
    await rows(`select connection_disconnect($1, 'granola')`, [ownerId])
    assert.equal(await count(`connections where provider = 'granola'`), 0)
    assert.deepEqual(await rows(`select connection_secret_get($1, 'granola') as s`, [ownerId]), [{ s: null }])
  })

  // Planted as the database for the browser checks below.
  await rows(`select connection_connect($1, 'outlook', 'invented-refresh-token-0001', 'Sam Sample (sam@example.test)')`, [ownerId])
  await rows(`select connection_connect($1, 'spott', 'spott_invented_key_0001', 'Spott')`, [ownerId])
  try {
    // The table holds no secret material at all.
    const cols = (await rows(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'connections'`)).map((r) => r.column_name)
    assert.ok(!cols.some((c) => /secret|token|key/.test(c)), cols.join(', '))

    await owner(async () => {
      const mine = await rows(`select provider, status, account_label from connections order by provider`)
      assert.deepEqual(mine, [
        { provider: 'outlook', status: 'connected', account_label: 'Sam Sample (sam@example.test)' },
        { provider: 'spott', status: 'connected', account_label: 'Spott' },
      ])
      assert.match(await refused(`select connection_secret_get('${ownerId}', 'outlook')`), /permission denied/)
      assert.match(await refused(`select connection_connect('${ownerId}', 'granola', 'grn_invented_key_0003')`), /permission denied/)
      assert.match(await refused(`select connection_disconnect('${ownerId}', 'outlook')`), /permission denied/)
      assert.match(await refused(`select connection_oauth_take('x')`), /permission denied/)
      assert.deepEqual(await rows(`select connection_owner() as o`), [{ o: ownerId }])
      assert.match(await refused(`select * from vault.decrypted_secrets`), /permission denied/)
      assert.match(await refused(`select * from vault.secrets`), /permission denied/)
      assert.match(await refused(`select * from connection_states`), /permission denied/)
      assert.match(await refused(`insert into connections (owner_id, provider, status) values ('${ownerId}', 'granola', 'connected')`), /permission denied/)
      assert.match(await refused(`update connections set status = 'failing'`), /permission denied/)
      assert.match(await refused(`delete from connections`), /permission denied/)
    })
    await reviewer(async () => {
      assert.equal(await count('connections'), 0)
      assert.match(await refused(`select connection_oauth_begin('outlook')`), /only the owner/)
      assert.match(await refused(`select connection_owner()`), /only the owner/)
      assert.match(await refused(`select * from vault.decrypted_secrets`), /permission denied/)
    })
    await noRole(async () => {
      assert.equal(await count('connections'), 0)
    })
    await anon(async () => {
      assert.match(await refused(`select * from connections`), /permission denied/)
      assert.match(await refused(`select connection_oauth_begin('outlook')`), /permission denied/)
      assert.match(await refused(`select * from vault.decrypted_secrets`), /permission denied/)
    })

    // The Outlook sign-in state: the owner asks for one; the server checks it, then takes it once.
    await db.exec('begin')
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ownerId, email: OWNER_EMAIL, role: 'authenticated', app_role: 'owner' })])
    await db.exec('set local role authenticated')
    const [{ state }] = await rows(`select connection_oauth_begin('outlook') as state`)
    await db.exec('commit')
    assert.match(state, /^[0-9a-f]{64}$/)
    assert.equal(await count(`connection_states where state_hash = '${state}'`), 0, 'only the hash is kept')
    assert.deepEqual(await rows(`select connection_oauth_check($1) as o`, [state]), [{ o: ownerId }])
    assert.deepEqual(await rows(`select connection_oauth_take($1) as o`, [state]), [{ o: ownerId }])
    assert.deepEqual(await rows(`select connection_oauth_take($1) as o`, [state]), [{ o: null }])
    assert.deepEqual(await rows(`select connection_oauth_check('not-a-state') as o`), [{ o: null }])
  } finally {
    await rows(`select connection_disconnect($1, 'outlook')`, [ownerId])
    await rows(`select connection_disconnect($1, 'spott')`, [ownerId])
    await db.exec(`delete from connection_states`)
  }
  assert.equal(await count('vault.secrets'), 0)
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
  // 0045: a call from yesterday goes at night; today and the days ahead stay.
  await db.query(`insert into calendar_today (owner_id, starts_at, title, event_ref) values ($1, now() - interval '30 hours', 'Yesterday', 'test:yesterday')`, [ownerId])
  const callsBefore = await count(`calendar_today where starts_at < uk_day_start(uk_day(now()))`)
  const callsAhead = await count(`calendar_today where starts_at >= uk_day_start(uk_day(now()))`)
  assert.ok(callsBefore > 0 && callsAhead > 0)

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
  assert.equal(await count('calendar_today'), callsAhead)
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

test('0031: an event sits on the content calendar with a type and a time, and counts once towards events_held when held', async () => {
  await owner(async () => {
    const [e] = await rows(`insert into content_items (kind, topic, topic_key, status, planned_for, event_type, event_time) values ('event', 'PMM breakfast on pricing pages', 'pmm breakfast on pricing pages', 'planned', current_date + 6, 'breakfast', '08:30') returning id`)
    assert.match(await refused(`update content_items set event_type = 'gala' where id = '${e.id}'`), /check constraint/)
    assert.match(await refused(`update content_items set event_time = '8.30am' where id = '${e.id}'`), /check constraint/)
    await db.query(`update content_items set status = 'posted' where id = $1`, [e.id])
    await db.query(`update content_items set impressions = 1 where id = $1`, [e.id])
    assert.equal(await count(`kpi_events where kpi = 'events_held' and source_id = '${e.id}'`), 1)
    assert.match(await refused(`insert into content_items (kind, topic, topic_key) values ('gala', 'x', 'x')`), /check constraint/)
  })
})

test('0032: outreach steps move a lead up the ladder, a referral becomes a job lead, accounts reach the agents, uk_to_us lands, agents carry connections and criteria', async () => {
  const [{ s3 }] = await rows(`select agent_run_start('a3_jobs', 'schedule', 'match') as s3`)
  assert.ok(Array.isArray(s3.connections))
  assert.ok(s3.connections.includes('linkedin_scraper'))
  assert.equal(s3.criteria.lookback_days, 7)
  const [{ out }] = await rows(`select agent_write($1, $2) as out`, [s3.run_id, JSON.stringify([
    { kind: 'job_lead', data: { company: 'Umbrella Fiction', role: 'Senior PMM', source: 'linkedin_post', source_url: 'https://example.com/jobs/u1', poster_name: 'Pat Pretend', uk_to_us: true } },
    { kind: 'outreach_step', data: { company: 'Umbrella Fiction', role: 'Senior PMM', step: 'connection_sent', note: "I'm the only product marketing headhunter in the world. Let's connect." } },
    { kind: 'outreach_step', data: { company: 'Nobody Ltd', step: 'connected' } },
    { kind: 'outreach_step', data: { company: 'Umbrella Fiction', step: 'replied', outcome: 'interested' } },
    { kind: 'outreach_step', data: { company: 'Umbrella Fiction', step: 'ghosted' } },
  ])])
  assert.equal(out.results[0].outcome, 'created')
  assert.equal(out.results[1].outcome, 'merged')
  assert.equal(out.results[2].code, 'not_found')
  assert.equal(out.results[3].outcome, 'merged')
  assert.deepEqual([out.results[4].code, out.results[4].field], ['invalid', 'step'])
  const leadId = out.results[0].id
  const [lead] = await rows(`select outreach_stage, outreach_connection_on, outreach_replied_on, reply_outcome, connection_note, uk_to_us from job_leads where id = $1`, [leadId])
  assert.equal(lead.outreach_stage, 'replied')
  assert.notEqual(lead.outreach_connection_on, null)
  assert.notEqual(lead.outreach_replied_on, null)
  assert.equal(lead.reply_outcome, 'interested')
  assert.match(lead.connection_note, /only product marketing headhunter/)
  assert.equal(lead.uk_to_us, true)
  await rows(`select agent_run_finish($1, 'ok')`, [s3.run_id])

  await owner(async () => {
    const [r] = await rows(`insert into referrals (referred_name, referred_company, referred_by_name, kind, hiring_manager_name, hiring_manager_url, sourced_via, job_open, dedup_key) values ('Hiring at Globex', 'Globex Fiction', 'Ada Example', 'company', 'Max Madeup', 'https://example.com/in/max', 'direct', 'yes', 'test:ref:globex') returning id`)
    const [{ made }] = await rows(`select referral_to_job_lead($1) as made`, [r.id])
    assert.ok(made)
    assert.deepEqual(await rows(`select company, poster_name, sources, outreach_stage from job_leads where id = $1`, [made]), [{ company: 'Globex Fiction', poster_name: 'Max Madeup', sources: ['referral'], outreach_stage: 'found' }])
    assert.deepEqual(await rows(`select referral_to_job_lead($1) = $2::uuid as same`, [r.id, made]), [{ same: true }])
    assert.match(await refused(`update referrals set sourced_via = 'friend' where id = '${r.id}'`), /check constraint/)
    await db.query(`update job_leads set outreach_stage = 'messaged' where id = $1`, [made])
    assert.notEqual((await rows(`select outreach_messaged_on from job_leads where id = $1`, [made]))[0].outreach_messaged_on, null)
    await db.query(`insert into accounts (company, company_key, kind, colleague) values ('Initech Mock', 'initech mock', 'group_client', 'Sam Church')`)
    assert.equal(await count(`accounts where kind = 'group_client'`), 1)
    assert.match(await refused(`insert into accounts (company, company_key, kind) values ('X', 'x', 'friend')`), /check constraint/)
    await db.query(`update agents set connections = array['linkedin_scraper', 'claude'], criteria = '{"lookback_days": 10}' where code = 'a3_jobs'`)
    assert.deepEqual(await rows(`select connections, criteria from agents where code = 'a3_jobs'`), [{ connections: ['linkedin_scraper', 'claude'], criteria: { lookback_days: 10 } }])
  })

  // The owner block rolled back, so an account is planted as the database would hold it.
  await db.query(`insert into accounts (owner_id, company, company_key, kind, colleague) values ($1, 'Initech Mock', 'initech mock', 'my_account', 'Sam Church')`, [ownerId])
  const [{ ctx }] = await rows(`select agent_context('a4_signals', array['accounts']) as ctx`)
  assert.deepEqual(ctx.accounts, [{ company: 'Initech Mock', company_key: 'initech mock', kind: 'my_account', colleague: 'Sam Church' }])
  await reviewer(async () => {
    assert.equal(await count('accounts'), 0)
  })
  await db.query(`delete from accounts where company_key = 'initech mock'`)
  await db.query(`delete from inbox_items where ref_table = 'job_leads' and ref_id = $1`, [leadId])
  await db.query(`delete from job_leads where id = $1`, [leadId])
})

test('0033: a search from a won lead counts, candidates move under CAN-1 to CAN-4 with the KPI events, placing opens testimonials, calls and counts arrive from A6, A-star suggestions from A3 and the verdict makes the person', async () => {
  let searchId
  let candId
  await owner(async () => {
    const [lead] = await rows(`select id, company, role from job_leads where stage <> 'dead' order by created_at limit 1`)
    const [s] = await rows(`insert into searches (client, client_key, role, won_from_job_lead, crm, crm_url) values ($1, norm_company($1), $2, $3, 'spott', 'https://example.com/crm/job/1') returning id, status, health`, [lead.company, lead.role, lead.id])
    searchId = s.id
    assert.equal(s.status, 'open')
    assert.equal(await count(`kpi_events where kpi = 'jobs_won' and source_id = '${s.id}'`), 1)
    const [p] = await rows(`select id from people where name_key = 'ada example'`)
    const [c] = await rows(`insert into search_candidates (search_id, person_id, stage) values ($1, $2, 'spoken') returning id`, [s.id, p.id])
    candId = c.id
    // CAN-1: no consent, no submission.
    assert.match(await refused(`update search_candidates set stage = 'submitted' where id = '${c.id}'`), /Agreed to be put forward/)
    await db.query(`update search_candidates set consent_to_submit = true, stage = 'submitted' where id = $1`, [c.id])
    const [after] = await rows(`select submitted_on, consent_on, stage_changed_on from search_candidates where id = $1`, [c.id])
    assert.notEqual(after.submitted_on, null)
    assert.notEqual(after.consent_on, null)
    // SEA-2 through CAN-2: the first submission is the shortlist.
    assert.notEqual((await rows(`select first_submission_on from searches where id = $1`, [s.id]))[0].first_submission_on, null)
    assert.equal(await count(`kpi_events where kpi = 'shortlists' and source_id = '${s.id}'`), 1)
    await db.query(`update search_candidates set stage = 'first_stage' where id = $1`, [c.id])
    assert.equal(await count(`kpi_events where kpi = 'first_interviews' and source_id = '${c.id}'`), 1)
    await db.query(`update search_candidates set stage = 'offer' where id = $1`, [c.id])
    assert.equal(await count(`kpi_events where kpi = 'offers' and source_id = '${c.id}'`), 1)
    assert.deepEqual(await rows(`select offer_status from search_candidates where id = $1`, [c.id]), [{ offer_status: 'expected' }])
    // Offer accepted: placed, the search placed, two testimonial requests, aftercare set.
    await db.query(`update search_candidates set offer_status = 'accepted', start_on = current_date + 21 where id = $1`, [c.id])
    assert.deepEqual(await rows(`select stage, aftercare_on is not null as aftercare from search_candidates where id = $1`, [c.id]), [{ stage: 'placed', aftercare: true }])
    assert.deepEqual(await rows(`select status, placed_on is not null as placed from searches where id = $1`, [s.id]), [{ status: 'placed', placed: true }])
    assert.equal(await count(`kpi_events where kpi = 'placements' and source_id = '${s.id}'`), 1)
    assert.equal(await count(`content_items where kind = 'testimonial' and search_id = '${s.id}'`), 2)
    // CAN-4: a rejection owes a kind word within a working day.
    const [p2] = await rows(`select id from people where name_key = 'ben sample'`)
    const [c2] = await rows(`insert into search_candidates (search_id, person_id, stage) values ($1, $2, 'spoken') returning id`, [s.id, p2.id])
    await db.query(`update search_candidates set stage = 'rejected', outcome_reason = 'Too senior' where id = $1`, [c2.id])
    assert.deepEqual(await rows(`select kind, reason, person_name from follow_ups where dedup_key = $1`, [`rejection:${c2.id}`]), [{ kind: 'rejection', reason: 'Tell them it is a no, kindly: Too senior', person_name: 'Ben Sample' }])
    // Campaigns and the warm spec switch.
    await db.query(`insert into campaigns (name, tool, job_lead_id, candidate_person_id, steps) values ('Ada to the lead', 'email', $1, $2, '[{"channel": "email", "note": "Send the profile"}]')`, [lead.id, p.id])
    assert.equal(await count(`campaigns where name = 'Ada to the lead' and status = 'planned'`), 1)
    await db.query(`update people set warm_spec = true where id = $1`, [p.id])
    assert.equal(await count(`people where warm_spec`), 1)
  })

  // The owner block rolled back; plant a search the agents can find.
  const [{ sid }] = await rows(`insert into searches (owner_id, client, client_key, role) values ($1, 'Contoso Demo Inc', 'contoso demo', 'Head of Product Marketing') returning id as sid`, [ownerId])
  const [{ s6 }] = await rows(`select agent_run_start('a6_calls', 'after_call') as s6`)
  const [{ out }] = await rows(`select agent_write($1, $2) as out`, [s6.run_id, JSON.stringify([
    { kind: 'call', data: { granola_ref: 'g-1', granola_url: 'https://example.com/granola/1', held_at: '2026-11-11T14:00:00Z', minutes: 30, call_type: 'candidate_screen', person_name: 'Ada Example', company: 'Northwind Sample Co', search_client: 'Contoso Demo Inc', search_role: 'Head of Product Marketing', match_confidence: 'high', w_record: true, w_note: true } },
    { kind: 'call', data: { granola_ref: 'g-1', held_at: '2026-11-11T14:00:00Z', w_cv: true, is_new_a_star: true } },
    { kind: 'call', data: { granola_ref: 'g-2', held_at: '2026-11-11T16:00:00Z', call_type: 'candidate_screen', person_name: 'Someone New' } },
    { kind: 'call', data: { granola_ref: 'g-3', call_type: 'coaching' } },
    { kind: 'search_counts', data: { search_client: 'Contoso Demo Inc', n_spoken: 6, n_submitted: 3, waiting_on: 'client' } },
    { kind: 'search_counts', data: { search_client: 'Nobody Ltd', n_spoken: 1 } },
  ])])
  const r = out.results
  assert.equal(r[0].outcome, 'created')
  assert.equal(r[1].outcome, 'merged')
  assert.equal(r[1].id, r[0].id)
  assert.equal(r[2].outcome, 'created')
  assert.match(r[2].note, /confirming/)
  assert.deepEqual([r[3].code, r[3].field], ['invalid', 'held_at'])
  assert.equal(r[4].outcome, 'merged')
  assert.equal(r[5].code, 'not_found')
  assert.deepEqual(await rows(`select w_record, w_cv, w_note, is_new_a_star, match_confidence, search_id from calls where id = $1`, [r[0].id]), [{ w_record: true, w_cv: true, w_note: true, is_new_a_star: true, match_confidence: 'high', search_id: sid }])
  assert.equal(await count(`kpi_events where kpi = 'new_a_star' and source_id = '${r[0].id}'`), 1)
  assert.equal(await count(`inbox_items where type = 'call_writeup' and ref_id = '${r[2].id}'`), 1)
  assert.deepEqual(await rows(`select n_spoken, n_submitted, waiting_on from searches where id = $1`, [sid]), [{ n_spoken: 6, n_submitted: 3, waiting_on: 'client' }])
  const [{ ctx }] = await rows(`select agent_context('a6_calls', array['searches']) as ctx`)
  assert.ok(ctx.searches.some((x) => x.id === sid && x.client === 'Contoso Demo Inc'))
  await rows(`select agent_run_finish($1, 'ok')`, [s6.run_id])

  const [{ s3 }] = await rows(`select agent_run_start('a3_jobs', 'schedule', 'collect') as s3`)
  const [{ star }] = await rows(`select agent_write($1, $2) as star`, [s3.run_id, JSON.stringify([
    { kind: 'a_star_suggestion', data: { name: 'Zed Fictional', title: 'Director of PMM', company: 'Stark Sample', city: 'boston', linkedin_url: 'https://example.com/in/zed', why: 'Two launches a year, B2B SaaS', week: '2026-11-09' } },
    { kind: 'a_star_suggestion', data: { name: 'Zed Fictional', linkedin_url: 'https://example.com/in/zed' } },
  ])])
  assert.equal(star.results[0].outcome, 'created')
  assert.equal(star.results[1].code, 'duplicate')
  await rows(`select agent_run_finish($1, 'ok')`, [s3.run_id])
  await owner(async () => {
    const [{ pid }] = await rows(`select a_star_verdict($1, 'good') as pid`, [star.results[0].id])
    assert.ok(pid)
    assert.deepEqual(await rows(`select display_name, kind from people where id = $1`, [pid]), [{ display_name: 'Zed Fictional', kind: 'candidate' }])
    assert.equal(await count(`league_members m join lists l on l.id = m.list_id where m.person_id = '${pid}' and l.kind = 'a_star' and m.added_from = 'a_star_feed'`), 1)
    assert.deepEqual(await rows(`select verdict from a_star_suggestions where id = $1`, [star.results[0].id]), [{ verdict: 'good' }])
    assert.match(await refused(`insert into a_star_suggestions (name, week, dedup_key) values ('x', current_date, 'x')`), /permission denied|row-level security/)
  })
  await reviewer(async () => {
    assert.equal(await count('search_candidates'), 0)
    assert.equal(await count('calls'), 0)
    assert.equal(await count(`searches where id = '${sid}'`), 1, 'a shared search is read-only for the reviewer')
    assert.ok(await refused(`update searches set priority = 'focus' where id = '${sid}'`))
  })
  await db.query(`delete from inbox_items where ref_table = 'calls'`)
  await db.query(`delete from calls`)
  await db.query(`delete from a_star_suggestions`)
  await db.query(`delete from searches where id = $1`, [sid])
})

test('0034: templates carry versions and approval; the engine decides, fills, queues in the window, holds at the cap, hands to the sender and takes its report; the owner approves, opens, marks and cancels; pauses and opt-outs (T-SEND-1, T-SEND-2, TPL-1 to TPL-3, 15.6, 20.8)', async () => {
  // T-SEND-1: Monday 23:30 UK (18:30 New York, after the window) lands the next New York morning, 5 to 40 minutes after it opens.
  const [{ w }] = await rows(`select send_window_next('2026-11-16T23:30:00Z', '09:00', '17:30', 'America/New_York') as w`)
  assert.ok(new Date(w) >= new Date('2026-11-17T14:05:00Z') && new Date(w) <= new Date('2026-11-17T14:40:00Z'), String(w))
  const [{ f }] = await rows(`select send_window_next('2026-11-20T23:00:00Z', '09:00', '17:30', 'America/New_York') as f`)
  assert.equal(new Date(f).getUTCDay(), 1, 'Friday night waits for Monday')
  const [{ inside }] = await rows(`select send_window_next('2026-11-17T15:00:00Z', '09:00', '17:30', 'America/New_York') as inside`)
  assert.equal(new Date(inside).toISOString(), '2026-11-17T15:00:00.000Z', 'inside the window goes now')
  assert.deepEqual((await rows(`select send_tz('san_francisco', 'America/New_York') as a, send_tz(null, 'America/New_York') as b, send_tz('london', null) as c`))[0], { a: 'America/Los_Angeles', b: 'America/New_York', c: 'Europe/London' })

  // Templates: the five starters are seeded unapproved; TPL-2 and TPL-3 hold; the channel must match; the reviewer sees none.
  await owner(async () => {
    assert.equal(await count('templates'), 5)
    assert.equal(await count(`templates where approved`), 0)
    assert.match(await refused(`insert into templates (type, name, channel, body) values ('thanks_after_call', 'T', 'email', 'Hi {{nickname}}')`), /TPL-2/)
    assert.match(await refused(`insert into templates (type, name, channel, body) values ('linkedin_connect', 'T', 'linkedin', repeat('x', 301))`), /TPL-3/)
    assert.match(await refused(`insert into templates (type, name, channel, body) values ('thanks_after_call', 'T', 'linkedin', 'Hi')`), /goes by email/)
    assert.match(await refused(`update templates set approved = true where type = 'thanks_after_call'`), /template_approve/)
    assert.match(await refused(`select send_tick()`), /not_allowed|permission denied/)
    assert.match(await refused(`select send_report(gen_random_uuid(), true)`), /not_allowed|permission denied/)
  })
  await reviewer(async () => {
    assert.equal(await count('templates'), 0)
    assert.match(await refused(`select template_approve(gen_random_uuid())`), /Only the owner/)
    assert.match(await refused(`select send_action(gen_random_uuid(), 'cancel')`), /Only the owner/)
  })

  await service(async () => {
    const asOwner = async (fn) => {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ownerId, email: OWNER_EMAIL, role: 'authenticated', app_role: 'owner' })])
      await db.exec('set local role authenticated')
      try {
        return await fn()
      } finally {
        await db.exec('set local role service_role')
      }
    }
    const person = async (name, city, linkedin) =>
      (await rows(`insert into people (owner_id, display_name, name_key, display_company, company_key, city, kind, linkedin_url) values ($1, $2, lower($2), 'Northwind Sample Co', 'northwind sample co', $3, 'candidate', $4) returning id`, [ownerId, name, city, linkedin]))[0].id
    const tess = await person('Tess Example', 'new_york', null)
    const [{ tpl }] = await rows(`select id as tpl from templates where type = 'thanks_after_call' and name = 'Starter'`)

    // An automatic thanks message with an unapproved template stays a draft and says why.
    const [{ m1 }] = await rows(
      `insert into messages (owner_id, type, channel, person_id, to_name, template_id, variables, created_by, level_at_creation)
       values ($1, 'thanks_after_call', 'email', $2, 'Tess Example', $3, '{"next_step": "I will send the Northwind brief on Monday.", "call_day": "Tuesday"}', 'a6_calls', 'automatic') returning id as m1`,
      [ownerId, tess, tpl],
    )
    const [{ d1 }] = await rows(`select send_decide($1) as d1`, [m1])
    assert.equal(d1.state, 'draft')
    assert.equal(d1.note, 'Template needs approval')
    assert.equal(await count(`send_log where message_id = '${m1}' and outcome = 'skipped'`), 1)

    // The owner approves the template: the waiting message is filled and queued, with the caps in the log.
    const n = await asOwner(async () => (await rows(`select template_approve($1) as n`, [tpl]))[0].n)
    assert.equal(n, 1)
    const [row1] = await rows(`select state, subject, body, variables, send_after, template_version from messages where id = $1`, [m1])
    assert.equal(row1.state, 'queued', JSON.stringify(await rows(`select detail from send_log where message_id = $1 order by logged_at`, [m1])))
    assert.equal(row1.subject, 'Good to speak today')
    assert.match(row1.body, /^Hi Tess,/)
    assert.match(row1.body, /on Tuesday. Good to hear about what you have been doing at Northwind Sample Co./)
    assert.match(row1.body, /I will send the Northwind brief on Monday\./)
    assert.match(row1.body, /\nJason$/)
    assert.ok(!/\{\{/.test(row1.body), 'every variable filled')
    assert.ok(row1.send_after)
    const [q] = await rows(`select outcome, detail, caps_snapshot from send_log where message_id = $1 and outcome = 'queued'`, [m1])
    assert.equal(q.outcome, 'queued')
    assert.match(q.detail, /^Sends at/)
    assert.equal(q.caps_snapshot.daily_cap, 15)
    assert.equal(await count(`audit_log where action = 'template approved'`), 1)

    // A next_step with a link is refused: the message is downgraded to a draft.
    const [{ m2 }] = await rows(
      `insert into messages (owner_id, type, channel, person_id, to_name, template_id, variables, created_by, level_at_creation)
       values ($1, 'thanks_after_call', 'email', $2, 'Tess Example', $3, '{"next_step": "See https://example.com"}', 'a6_calls', 'automatic') returning id as m2`,
      [ownerId, tess, tpl],
    )
    const [{ d2 }] = await rows(`select send_decide($1) as d2`, [m2])
    assert.equal(d2.state, 'draft')
    assert.match(d2.note, /link/)

    // T-SEND-2: the per-run cap on connection notes. Two queue, the third is held.
    await db.query(`update send_policies set per_run_cap = 2 where type = 'linkedin_connect'`)
    const [{ ltpl }] = await rows(`select id as ltpl from templates where type = 'linkedin_connect' and name = 'Starter'`)
    await db.query(`select template_approve($1)`, [ltpl])
    const [{ run }] = await rows(`insert into agent_runs (agent, trigger) values ('a3_jobs', 'schedule') returning id as run`)
    const states = []
    for (const nm of ['Uma Pretend', 'Vic Pretend', 'Wes Pretend']) {
      const pid = await person(nm, 'boston', `https://example.com/in/${nm.split(' ')[0].toLowerCase()}`)
      const [{ mid }] = await rows(
        `insert into messages (owner_id, type, channel, person_id, to_name, template_id, created_by, level_at_creation)
         values ($1, 'linkedin_connect', 'linkedin', $2, $3, $4, 'a3_jobs', 'automatic') returning id as mid`,
        [ownerId, pid, nm, ltpl],
      )
      states.push((await rows(`select send_decide($1, $2) as d`, [mid, run]))[0].d)
    }
    assert.deepEqual(states.map((x) => x.state), ['queued', 'queued', 'held'])
    assert.equal(states[2].note, 'Cap reached')
    assert.equal((await rows(`select caps_snapshot ->> 'run' as r from send_log where outcome = 'held' and type = 'linkedin_connect' order by logged_at desc limit 1`))[0].r, '2')
    assert.match((await rows(`select body from messages where type = 'linkedin_connect' and state = 'queued' limit 1`))[0].body, /^(Uma|Vic), I'm one of the leading PMM headhunters in the US\. Would love to connect\.$/)

    // The tick hands a due email to the sender and marks it sending. The report marks it sent and tells the rest of RecOS.
    await db.query(`insert into follow_ups (owner_id, person_id, person_name, kind, reason, source, due_on, dedup_key, message_id) values ($1, $2, 'Tess Example', 'after_candidate_call', 'Thank her for the call', 'call', current_date, 'fu-tess-0034', $3)`, [ownerId, tess, m1])
    await db.query(`update messages set send_after = now() - interval '1 minute' where id = $1`, [m1])
    const [{ t1 }] = await rows(`select send_tick('email') as t1`)
    assert.equal(t1.count, 1, JSON.stringify(t1))
    assert.equal(t1.messages[0].message_id, m1)
    assert.equal(t1.messages[0].subject, 'Good to speak today')
    assert.equal(t1.messages[0].level, 'automatic')
    assert.equal((await rows(`select state from messages where id = $1`, [m1]))[0].state, 'sending')
    const [{ r1 }] = await rows(`select send_report($1, true, 'AAMkAG-sample', null, null) as r1`, [m1])
    assert.equal(r1.state, 'sent')
    const [sent] = await rows(`select state, sent_at, external_ref, purge_after from messages where id = $1`, [m1])
    assert.ok(sent.sent_at && sent.purge_after)
    assert.equal(sent.external_ref, 'AAMkAG-sample')
    assert.equal((await rows(`select detail from send_log where message_id = $1 and outcome = 'sent'`, [m1]))[0].detail, 'Auto')
    assert.equal((await rows(`select status from follow_ups where dedup_key = 'fu-tess-0034'`))[0].status, 'sent')
    assert.equal(await count(`inbox_items where type = 'auto_sent' and ref_id = '${m1}' and status = 'done'`), 1)
    assert.equal(await count(`inbox_items where type = 'system_notice' and title like '%now sends by itself'`), 1, 'the first automatic send of a type says so once')
    assert.match(await refused(`select send_report($1, true)`, [m1]), /wrong_state/)

    // The owner's actions on a one-click message with no template: approve queues it; a failing send retries, then goes back to drafts.
    const yan = await person('Yan Pretend', 'chicago', null)
    const [{ m3 }] = await rows(
      `insert into messages (owner_id, type, channel, person_id, to_name, subject, body, created_by, level_at_creation)
       values ($1, 'intro_to_colleague', 'email', $2, 'Yan Pretend', 'Meet Sam', 'Yan, meet Sam.', 'a6_calls', 'one_click') returning id as m3`,
      [ownerId, yan],
    )
    assert.equal((await rows(`select send_decide($1) as d`, [m3]))[0].d.note, 'Waiting for Send')
    const a3 = await asOwner(async () => (await rows(`select send_action($1, 'approve') as a`, [m3]))[0].a)
    assert.equal(a3.state, 'queued', JSON.stringify(a3))
    assert.ok((await rows(`select approved_at from messages where id = $1`, [m3]))[0].approved_at)
    // Tess already has a message today, so a second one to her waits for tomorrow's window (step 10).
    const [{ m3b }] = await rows(`insert into messages (owner_id, type, channel, person_id, to_name, subject, body, created_by, level_at_creation, approved_at) values ($1, 'intro_to_colleague', 'email', $2, 'Tess Example', 'Meet Sam', 'Tess, meet Sam.', 'a6_calls', 'one_click', now()) returning id as m3b`, [ownerId, tess])
    const [{ d3b }] = await rows(`select send_decide($1) as d3b`, [m3b])
    assert.equal(d3b.note, 'Another message today')
    assert.ok(new Date((await rows(`select send_after from messages where id = $1`, [m3b]))[0].send_after) > new Date())
    await db.query(`update messages set send_after = now() - interval '1 minute' where id = $1`, [m3])
    assert.equal((await rows(`select send_tick('email') as t`))[0].t.count, 1)
    for (const i of [1, 2]) {
      const [{ r }] = await rows(`select send_report($1, false, null, 'Outlook timed out') as r`, [m3])
      assert.equal(r.state, 'queued')
      assert.equal(r.attempts, i)
      await db.query(`update messages set state = 'sending' where id = $1`, [m3])
    }
    const [{ r3 }] = await rows(`select send_report($1, false, null, 'Outlook timed out') as r3`, [m3])
    assert.equal(r3.state, 'draft')
    assert.equal(r3.attempts, 3)
    assert.equal(await count(`inbox_items where type = 'system_notice' and title like '%could not be sent'`), 1)
    // 20.8: three email failures in a row pause automatic email for two hours; the pause lifts itself at the next tick.
    assert.ok((await count(`send_policies where paused and paused_until is not null and channel = 'email' and level = 'automatic'`)) > 0)
    assert.equal(await count(`inbox_items where type = 'system_notice' and title like 'Automatic email paused%'`), 1)
    await db.query(`update send_policies set paused_until = now() - interval '1 minute' where paused_until is not null`)
    await db.query(`select send_tick('email')`)
    assert.equal(await count(`send_policies where paused and paused_until is not null`), 0)

    // open_draft, mark_sent and cancel; approve is refused on a draft-only type.
    const o3 = await asOwner(async () => (await rows(`select send_action($1, 'open_draft', 'https://outlook.office.com/mail/deeplink/compose?subject=Meet') as a`, [m3]))[0].a)
    assert.equal(o3.subject, 'Meet Sam')
    assert.match(o3.outlook_draft_url, /^https:\/\/outlook/)
    const s3 = await asOwner(async () => (await rows(`select send_action($1, 'mark_sent') as a`, [m3]))[0].a)
    assert.equal(s3.state, 'sent')
    assert.equal((await rows(`select detail from send_log where message_id = $1 and outcome = 'sent'`, [m3]))[0].detail, 'manual')
    const [{ m4 }] = await rows(`insert into messages (owner_id, type, channel, to_name, body, created_by, level_at_creation) values ($1, 'spec', 'email', 'Someone', 'A spec.', 'a3_jobs', 'draft_only') returning id as m4`, [ownerId])
    await asOwner(async () => {
      assert.match(await refused(`select send_action($1, 'approve')`, [m4]), /draft only/)
      assert.equal((await rows(`select send_action($1, 'cancel') as a`, [m4]))[0].a.state, 'cancelled')
      assert.match(await refused(`select send_action($1, 'cancel')`, [m4]), /wrong_state/)
    })

    // TPL-1: editing the approved thanks template makes version 2, unapproved and active; the approved one stands aside, and automatic waits again.
    await asOwner(async () => {
      await db.query(`update templates set body = body || E'\\n\\nPS Say hello to the team.' where id = $1`, [tpl])
    })
    const versions = await rows(`select version, approved, active, body like '%PS Say hello%' as edited from templates where type = 'thanks_after_call' and name = 'Starter' order by version`)
    assert.deepEqual(versions, [{ version: 1, approved: true, active: false, edited: false }, { version: 2, approved: false, active: true, edited: true }])
    assert.equal((await rows(`select (approved_template('thanks_after_call', 'email')).id as id`))[0].id, null)
    const [{ m5 }] = await rows(
      `insert into messages (owner_id, type, channel, person_id, to_name, template_id, created_by, level_at_creation) values ($1, 'thanks_after_call', 'email', $2, 'Tess Example', $3, 'a6_calls', 'automatic') returning id as m5`,
      [ownerId, tess, tpl],
    )
    assert.equal((await rows(`select send_decide($1) as d`, [m5]))[0].d.note, 'Template needs approval')

    // An opt-out phrase puts the person on the do-not-contact list and cancels what was waiting.
    const [{ oo }] = await rows(`select aw_opt_out(null, 'a5_followups', '{"person_name": "Tess Example", "phrase": "please remove me"}') as oo`)
    assert.equal(oo.outcome, 'created')
    assert.equal((await rows(`select do_not_contact from people where id = $1`, [tess]))[0].do_not_contact, true)
    assert.equal((await rows(`select state from messages where id = $1`, [m5]))[0].state, 'cancelled')
    assert.equal(await count(`do_not_contact where person_id = '${tess}'`), 1)
    assert.equal(await count(`inbox_items where type = 'system_notice' and title like '%asked not to be contacted'`), 1)
    assert.equal((await rows(`select aw_opt_out(null, 'a5_followups', '{"person_name": "Nobody At All"}') as x`))[0].x.code, 'not_found')

    // A LinkedIn warning pauses every LinkedIn type and holds what was queued.
    const [{ lw }] = await rows(`select send_linkedin_warning('verification asked for') as lw`)
    assert.equal(lw, 2)
    assert.equal(await count(`send_policies where channel in ('linkedin', 'either') and not paused`), 0)
    assert.equal(await count(`messages where type = 'linkedin_connect' and state = 'held' and hold_reason = 'LinkedIn warning'`), 2)
    assert.equal(await count(`inbox_items where type = 'system_notice' and title = 'LinkedIn sending paused'`), 1)

    // The write kind message at automatic level goes through the engine; opt_out is a kind A5 may send.
    assert.equal((await rows(`select aw_may_send('a5_followups', 'opt_out') as x`))[0].x, true)
    assert.equal((await rows(`select aw_may_send('a3_jobs', 'opt_out') as x`))[0].x, false)
    assert.ok((await rows(`select aw_allowed_fields('message') as f`))[0].f.includes('variables'))
    const [{ r6 }] = await rows(`select agent_run_start('a6_calls', 'schedule') as r6`)
    const [{ w6 }] = await rows(`select agent_write($1, $2) as w6`, [r6.run_id, JSON.stringify([
      { kind: 'message', data: { type: 'thanks_after_call', channel: 'email', person_name: 'Uma Pretend', level: 'automatic', variables: { next_step: 'Speak next week.' } } },
      { kind: 'message', data: { type: 'intro_to_colleague', channel: 'email', person_name: 'Uma Pretend', level: 'automatic', subject: 'Meet Sam', body: 'Uma, meet Sam.' } },
      { kind: 'message', data: { type: 'thanks_after_call', channel: 'email', person_name: 'Uma Pretend', level: 'teleport' } },
    ])])
    assert.deepEqual(w6.results.map((x) => x.outcome), ['created', 'created', 'rejected'], JSON.stringify(w6))
    assert.equal(w6.results[0].state, 'draft', 'no approved thanks template now, so it waits')
    assert.match(w6.results[0].note, /No approved template|Template needs approval/)
    assert.equal(w6.results[1].state, 'draft', 'one click waits for Send')
    assert.equal((await rows(`select level_at_creation, run_id from messages where id = $1`, [w6.results[1].id]))[0].level_at_creation, 'one_click')
    assert.equal((await rows(`select run_id from messages where id = $1`, [w6.results[1].id]))[0].run_id, r6.run_id)
  })
})

test('0035: ten content ideas from the desk land once as drafts the owner reads and the reviewer cannot; the content agent carries the call notes connection', async () => {
  await owner(async () => {
    const ideas = await rows(`select topic, status, format_ok, run_source, word_count from content_items where kind = 'linkedin_post' and prompted_by is not null order by rank desc`)
    assert.equal(ideas.length, 10, JSON.stringify(ideas.map((i) => i.topic)))
    assert.ok(ideas.every((i) => i.status === 'draft' && i.format_ok && i.word_count >= 40 && i.word_count <= 90), 'drafts in the post format')
    assert.equal(ideas[0].topic, 'First quarter hires')
    const [{ n }] = await rows(`select content_ideas_seed() as n`)
    assert.equal(Number(n), 0, 'safe to run again')
    const [{ c }] = await rows(`select connections as c from agents where code = 'a2_content'`)
    assert.ok(c.includes('granola'), 'content agent reads the call notes')
  })
  await reviewer(async () => {
    assert.equal(await count('content_items'), 0, 'the reviewer sees no content')
    await refused(`select content_ideas_seed()`, /not_allowed/)
  })
})

test('0036: a picture attaches to a report as a data URL, three at most, never anything but an image, and the reviewer sees none', async () => {
  await owner(async () => {
    const [r] = await rows(`insert into problem_reports (description) values ('The window scrolls') returning id`)
    const png = 'data:image/png;base64,iVBORw0KGgo='
    await db.query(`insert into problem_screenshots (report_id, data) values ($1, $2), ($1, $2), ($1, $2)`, [r.id, png])
    const [{ n, b }] = await rows(`select count(*) as n, min(bytes) as b from problem_screenshots where report_id = $1`, [r.id])
    assert.equal(Number(n), 3)
    assert.equal(Number(b), png.length, 'bytes is the length of the data')
    await refused(`insert into problem_screenshots (report_id, data) values ('${r.id}', '${png}')`, /Three pictures at most/)
    await refused(`insert into problem_screenshots (report_id, data) values ('${r.id}', 'data:text/html,<b>x</b>')`, /check|violates/)
    await refused(`delete from problem_screenshots where report_id = '${r.id}'`, /permission denied/)
  })
  await reviewer(async () => {
    assert.equal(await count('problem_screenshots'), 0)
  })
})

test('0037: the owner keeps his own note on where he is with a poster, a thousand characters at most', async () => {
  await owner(async () => {
    const [l] = await rows(`insert into job_leads (company, role, company_key, role_key) values ('Chaser Sample Co', 'Director PMM', 'chaser_sample_co', 'director_pmm') returning id`)
    await db.query(`update job_leads set outreach_note = 'Spoke on the phone, call back Thursday' where id = $1`, [l.id])
    assert.equal((await rows(`select outreach_note from job_leads where id = $1`, [l.id]))[0].outreach_note, 'Spoke on the phone, call back Thursday')
    await refused(`update job_leads set outreach_note = repeat('x', 1001) where id = '${l.id}'`, /check|violates/)
  })
})

test('0039: the sender is an agent row, so the owner can make its key, and it may write nothing through agent-write', async () => {
  await owner(async () => {
    assert.equal((await rows(`select name from agents where code = 'sender'`))[0].name, 'Outlook sender')
    const [{ k }] = await rows(`select agent_key_create('sender') as k`)
    assert.ok(typeof k === 'string' && k.length >= 20, 'a key comes back')
    assert.equal((await rows(`select aw_may_send('sender', 'message') as m`))[0].m, false)
  })
})

test('0040: the campaign runner reads planned campaigns, enrols, ticks steps and keeps the counts; nobody else may send a campaign_step', async () => {
  await service(async () => {
    const [{ lid }] = await rows(`insert into job_leads (owner_id, company, role, company_key, role_key, poster_name) values ($1, 'Runner Sample Co', 'Head of PMM', 'runner_sample_co', 'head_of_pmm', 'Rae Fictional') returning id as lid`, [ownerId])
    const [{ cid }] = await rows(`insert into campaigns (owner_id, name, tool, job_lead_id, steps) values ($1, 'Rae Fictional at Runner Sample Co', 'email', $2, '[{"channel":"email","note":"Spec email"},{"channel":"phone","note":"Call"},{"channel":"linkedin","note":"Message"}]') returning id as cid`, [ownerId, lid])
    const ctx = (await rows(`select agent_context('a8_campaigns', array['campaigns']) as c`))[0].c
    const mine = ctx.campaigns.find((x) => x.id === cid)
    assert.ok(mine, 'the planned campaign is in the context')
    assert.equal(mine.lead.poster_name, 'Rae Fictional')
    await refused(`select agent_context('a3_jobs', array['campaigns'])`, /not_allowed/)
    const [{ r8 }] = await rows(`select agent_run_start('a8_campaigns', 'schedule') as r8`)
    const [{ w }] = await rows(`select agent_write($1, $2) as w`, [r8.run_id, JSON.stringify([
      { kind: 'campaign_step', data: { campaign_id: cid, step: 'enrolled', on: '2026-11-16', crm_ref: 'seq-42', crm_url: 'https://example.com/spott/seq-42' } },
      { kind: 'campaign_step', data: { campaign_id: cid, step: 'email_sent', on: '2026-11-16' } },
      { kind: 'campaign_step', data: { campaign_id: cid, step: 'replied', on: '2026-11-18', outcome: 'interested' } },
      { kind: 'campaign_step', data: { campaign_id: cid, step: 'call_booked', on: '2026-11-19' } },
      { kind: 'campaign_step', data: { campaign_id: cid, step: 'dance' } },
      { kind: 'campaign_step', data: { campaign_id: cid, step: 'done', spott: 'x' } },
    ])])
    assert.deepEqual(w.results.map((x) => x.outcome), ['merged', 'merged', 'merged', 'merged', 'rejected', 'rejected'], JSON.stringify(w.results))
    const [c] = await rows(`select status, to_char(started_on, 'YYYY-MM-DD') as started_on, contacted, replies, calls_booked, crm_ref, steps, notes from campaigns where id = $1`, [cid])
    assert.equal(c.status, 'running')
    assert.equal(String(c.started_on).slice(0, 10), '2026-11-16')
    assert.equal(c.contacted, 1)
    assert.equal(c.replies, 1)
    assert.equal(c.calls_booked, 1)
    assert.equal(c.crm_ref, 'seq-42')
    assert.equal(c.steps[0].doneOn, '2026-11-16', 'the email step is ticked')
    assert.equal(c.steps[1].doneOn, '2026-11-19', 'the call step is ticked')
    assert.equal(c.steps[2].doneOn ?? null, null)
    assert.match(c.notes, /Replied 2026-11-18, interested/)
    const [{ w2 }] = await rows(`select agent_write($1, $2) as w2`, [r8.run_id, JSON.stringify([{ kind: 'campaign_step', data: { campaign_id: cid, step: 'done', on: '2026-11-20' } }])])
    assert.equal(w2.results[0].outcome, 'merged')
    assert.equal((await rows(`select status, ended_on from campaigns where id = $1`, [cid]))[0].status, 'done')
    const [{ r3 }] = await rows(`select agent_run_start('a3_jobs', 'schedule') as r3`)
    const [{ w3 }] = await rows(`select agent_write($1, $2) as w3`, [r3.run_id, JSON.stringify([{ kind: 'campaign_step', data: { campaign_id: cid, step: 'done' } }])])
    assert.equal(w3.results[0].outcome, 'rejected')
    assert.match(w3.results[0].message ?? JSON.stringify(w3.results[0]), /may not send/)
  })
})

test('0043: a test send goes to the owner\'s own address, queued now, and the tick hands it to the sender filled; the reviewer may not', async () => {
  await owner(async () => {
    const [{ r }] = await rows(`select send_test('thanks_after_call') as r`)
    assert.equal(r.state, 'queued')
    assert.equal(r.to_address, 'owner@example.test')
    const [m] = await rows(`select to_name, to_address, state, subject, body, level_at_creation, hold_reason from messages where id = $1`, [r.message_id])
    assert.equal(m.to_address, 'owner@example.test')
    assert.equal(m.to_name, 'Jason Sample')
    assert.equal(m.state, 'queued')
    assert.match(m.body, /Jason/)
    assert.equal(m.hold_reason, 'Test send to yourself')
    await refused(`select send_test('linkedin_connect')`, /email only/)
    await refused(`select send_test('no_such_type')`, /no such message type/)
    assert.equal((await rows(`select count(*)::int as n from send_log where message_id = $1 and outcome = 'queued'`, [r.message_id]))[0].n, 1)
  })
  await service(async () => {
    const [{ r }] = await rows(`select send_test('cv_request') as r`)
    const [{ t }] = await rows(`select send_tick('email', 20) as t`)
    const mine = t.messages.find((x) => x.message_id === r.message_id)
    assert.ok(mine, 'the tick hands the test over')
    assert.equal(mine.to_address, 'owner@example.test')
    assert.ok(mine.subject && mine.body, 'filled')
    assert.equal((await rows(`select state from messages where id = $1`, [r.message_id]))[0].state, 'sending')
  })
  await reviewer(async () => {
    await refused(`select send_test('thanks_after_call')`, /not_allowed/)
  })
})

test('0045: the calendar holds seven days; a batch replaces only the days it covers; the night keeps the days ahead', async () => {
  const [{ today }] = await rows(`select uk_day(now())::text as today`)
  const day = (n) => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const ev = (ref, n, hour, over = {}) => ({
    event_ref: ref,
    starts_at: `${day(n)}T${String(hour).padStart(2, '0')}:00:00Z`,
    title: 'Candidate screen',
    call_type: 'candidate_screen',
    person_name: 'Ada Example',
    ...over,
  })
  const perDay = async () =>
    (await rows(`select uk_day(starts_at)::text as d, count(*)::int as n from calendar_today where event_ref like 'wk-%' group by 1 order by 1`)).map((r) => `${r.d}:${r.n}`)
  const write = async (data) => {
    const [{ s }] = await rows(`select agent_run_start('a5_followups', 'schedule') as s`)
    const [{ w }] = await rows(`select agent_write($1, $2) as w`, [s.run_id, JSON.stringify([{ kind: 'calendar_today', data }])])
    await rows(`select agent_run_finish($1, 'ok')`, [s.run_id])
    return w.results[0]
  }
  const days = [0, 1, 2, 3, 4, 5, 6]

  // A batch for seven days stores seven days: a call and a stand-up each day, day 3 a call only.
  const week = []
  for (const n of days) {
    week.push(ev(`wk-${n}-a`, n, 10))
    if (n !== 3) week.push(ev(`wk-${n}-b`, n, 14, { call_type: 'internal', is_external: false, title: 'Desk stand-up' }))
  }
  const r1 = await write({ from: day(0), to: day(6), events: week })
  assert.equal(r1.outcome, 'created', JSON.stringify(r1))
  assert.deepEqual(await perDay(), days.map((n) => `${day(n)}:${n === 3 ? 1 : 2}`))

  // A second batch for one day replaces only that day; a call moved from day 5 to day 2 moves with it.
  const r2 = await write({ events: [ev('wk-2-c', 2, 9), ev('wk-5-a', 2, 16)] })
  assert.equal(r2.outcome, 'created', JSON.stringify(r2))
  assert.deepEqual(await perDay(), days.map((n) => `${day(n)}:${n === 3 || n === 5 ? 1 : 2}`))
  assert.deepEqual(
    await rows(`select event_ref from calendar_today where event_ref like 'wk-2-%' or event_ref = 'wk-5-a' order by 1`),
    [{ event_ref: 'wk-2-c' }, { event_ref: 'wk-5-a' }],
  )

  // An empty list with from and to clears those days and nothing else.
  const r3 = await write({ from: day(4), to: day(4), events: [] })
  assert.equal(r3.outcome, 'created')
  assert.ok(!(await perDay()).some((x) => x.startsWith(day(4))))
  assert.equal((await perDay()).length, 6)

  // Events outside the range are skipped; a bad, backwards or too-long range is refused, as is an unknown field.
  const r4 = await write({ from: day(6), to: day(6), events: [ev('wk-6-z', 1, 11), ev('wk-6-a', 6, 10)] })
  assert.match(r4.note, /^1 events/)
  assert.match(r4.note, /1 skipped/)
  assert.equal((await write({ from: '15 November', to: day(1), events: [] })).code, 'invalid')
  assert.equal((await write({ from: day(2), to: day(1), events: [] })).code, 'invalid')
  assert.equal((await write({ from: day(0), to: day(14), events: [] })).code, 'invalid')
  assert.equal((await write({ from: day(0), to: day(1), events: [], extra: 1 })).outcome, 'rejected')

  // The night removes a call from before today and keeps today and the days ahead.
  await db.query(`insert into calendar_today (owner_id, starts_at, title, event_ref) values ($1, uk_day_start(uk_day(now())) - interval '1 minute', 'Late call', 'wk-past')`, [ownerId])
  const ahead = (await perDay()).filter((x) => x >= day(0))
  const [{ night }] = await rows(`select retention_job() as night`)
  assert.equal(night.errors, undefined, JSON.stringify(night))
  assert.ok(night.calendar_today >= 1)
  assert.equal(await count(`calendar_today where event_ref = 'wk-past'`), 0)
  assert.deepEqual(await perDay(), ahead)
  assert.equal(ahead.length, 6)

  // Home's third number counts today only, and the reviewer reads none of it.
  await owner(async () => {
    const [{ n }] = await rows(`select count(*)::int as n from calendar_today where event_ref like 'wk-%' and is_external and uk_day(starts_at) = uk_day(now())`)
    assert.equal(n, 1)
  })
  await reviewer(async () => {
    assert.equal(await count('calendar_today'), 0)
  })
  await db.query(`delete from calendar_today where event_ref like 'wk-%'`)
})

// ---------------------------------------------------------------- the new search flow (0048)

test('0048 intake: the owner starts a search and asks for research; one open job per search and kind; nobody else may', async () => {
  await anon(async () => {
    assert.match(String(await refused(`select start_search('Globex Sample Inc', 'Senior PMM')`)), /permission denied|Only the owner/)
    assert.match(String(await refused(`select request_search_job(gen_random_uuid(), 'questions')`)), /permission denied|Only the owner/)
    assert.match(String(await refused(`select * from search_jobs`)), /permission denied/)
  })
  await reviewer(async () => {
    assert.match(String(await refused(`select start_search('Globex Sample Inc', 'Senior PMM')`)), /Only the owner/)
    assert.match(String(await refused(`select request_search_job(gen_random_uuid(), 'questions')`)), /Only the owner/)
  })
  await owner(async () => {
    const [{ sid }] = await rows(`select start_search('  Globex Sample Inc ', ' Senior PMM, platform ', 'senior_pmm', 'We need a product marketer for the platform line.', '2026-11-20') as sid`)
    const [s] = await rows(`select owner_id, client, client_key, role, function, status, role_type, jd_text, brief_due_on::text as due from searches where id = $1`, [sid])
    assert.deepEqual(s, { owner_id: ownerId, client: 'Globex Sample Inc', client_key: 'globex sample', role: 'Senior PMM, platform', function: 'pmm', status: 'intake', role_type: 'senior_pmm', jd_text: 'We need a product marketer for the platform line.', due: '2026-11-20' })
    // The least it takes: a client and a rough role.
    const [{ bare }] = await rows(`select start_search('Initech Pretend', 'PMM') as bare`)
    assert.deepEqual(await rows(`select role_type, jd_text, brief_due_on from searches where id = $1`, [bare]), [{ role_type: null, jd_text: null, brief_due_on: null }])
    assert.match(String(await refused(`select start_search(' ', 'PMM')`)), /needs a client/)
    assert.match(String(await refused(`select start_search('Globex Sample Inc', '')`)), /needs a role/)
    assert.match(String(await refused(`select start_search('Globex Sample Inc', 'PMM', 'cmo')`)), /Unknown role type/)

    const [{ j1 }] = await rows(`select request_search_job($1, 'questions') as j1`, [sid])
    const [{ j2 }] = await rows(`select request_search_job($1, 'questions') as j2`, [sid])
    assert.equal(j2, j1, 'a second ask returns the open job')
    const [{ j3 }] = await rows(`select request_search_job($1, 'lowdown') as j3`, [sid])
    assert.notEqual(j3, j1)
    assert.deepEqual(await rows(`select kind, status, owner_id from search_jobs where search_id = $1 order by kind`, [sid]), [
      { kind: 'lowdown', status: 'waiting', owner_id: ownerId },
      { kind: 'questions', status: 'waiting', owner_id: ownerId },
    ])
    assert.match(String(await refused(`select request_search_job($1, 'gossip')`, [sid])), /questions, lowdown, map or brief/)
    assert.match(String(await refused(`select request_search_job(gen_random_uuid(), 'map')`)), /No such search/)
    // The browser reads the queue and writes none of it.
    assert.match(String(await refused(`insert into search_jobs (owner_id, search_id, kind) values ($1, $2, 'map')`, [ownerId, sid])), /permission denied/)
    assert.match(String(await refused(`update search_jobs set status = 'ready' where id = $1`, [j1])), /permission denied/)
    // The two new tabs take a note.
    await db.query(`insert into search_notes (search_id, tab, content) values ($1, 'questions', 'x'), ($1, 'lowdown', 'y')`, [sid])
  })
})

test('0048 research: a6_calls claims up to three jobs, search_result writes the next version and closes the job, and only a6_calls may', async () => {
  const [{ sid }] = await rows(
    `insert into searches (owner_id, client, client_key, role, role_type, jd_text, location, status, confidential)
     values ($1, 'Initech Pretend', 'initech pretend', 'Senior Product Marketing Manager', 'senior_pmm', 'Own launches for two product lines.', 'Remote, US', 'intake', true) returning id as sid`, [ownerId])
  const [{ sid2 }] = await rows(`insert into searches (owner_id, client, client_key, role, status) values ($1, 'Umbrella Invented', 'umbrella invented', 'Head of PMM', 'intake') returning id as sid2`, [ownerId])
  await db.query(`insert into search_notes (owner_id, search_id, tab, structured, version) values ($1, $2, 'brief', '{"must_have": "old"}', 1), ($1, $2, 'brief', '{"must_have": "B2B SaaS"}', 2)`, [ownerId, sid])
  // The owner has already edited a first set of questions.
  await db.query(`insert into search_notes (owner_id, search_id, tab, content, structured) values ($1, $2, 'questions', 'Owner edit', '{"groups": []}')`, [ownerId, sid])
  const job = async (search, kind, minutesAgo) =>
    (await rows(`insert into search_jobs (owner_id, search_id, kind, requested_at) values ($1, $2, $3, now() - make_interval(mins => $4)) returning id`, [ownerId, search, kind, minutesAgo]))[0].id
  const q = await job(sid, 'questions', 40)
  const low = await job(sid, 'lowdown', 30)
  const map = await job(sid, 'map', 20)
  const late = await job(sid2, 'lowdown', 10)
  await assert.rejects(db.query(`insert into search_jobs (owner_id, search_id, kind) values ($1, $2, 'map')`, [ownerId, sid]), /search_jobs_one_open/)

  // Only a6_calls may ask for the queue.
  await assert.rejects(db.query(`select agent_context('a3_jobs', array['search_jobs'])`), /not_allowed/)
  await assert.rejects(db.query(`select agent_context('a5_followups', array['search_jobs'])`), /not_allowed/)
  assert.equal(await count(`search_jobs where status = 'working'`), 0)

  const [{ c1 }] = await rows(`select agent_context('a6_calls', array['search_jobs']) as c1`)
  assert.deepEqual(c1.search_jobs.map((x) => [x.job_id, x.kind]), [[q, 'questions'], [low, 'lowdown'], [map, 'map']])
  assert.deepEqual(c1.search_jobs[0].search, { id: sid, client: 'Initech Pretend', confidential: true, role: 'Senior Product Marketing Manager', role_type: 'senior_pmm', jd_text: 'Own launches for two product lines.', location: 'Remote, US' })
  assert.deepEqual(c1.search_jobs[0].brief, { must_have: 'B2B SaaS' })
  assert.equal(await count(`search_jobs where status = 'working' and claimed_at is not null and attempts = 1`), 3)
  const [{ c2 }] = await rows(`select agent_context('a6_calls', array['search_jobs', 'dnc']) as c2`)
  assert.deepEqual(c2.search_jobs.map((x) => x.job_id), [late])
  assert.equal(c2.search_jobs[0].brief, null)
  assert.ok(Array.isArray(c2.dnc))
  const [{ c3 }] = await rows(`select agent_context('a6_calls', array['search_jobs']) as c3`)
  assert.deepEqual(c3.search_jobs, [])
  // The older contexts still answer.
  const [{ c4 }] = await rows(`select agent_context('a6_calls', array['searches']) as c4`)
  assert.ok(c4.searches.some((x) => x.id === sid && x.client === 'Confidential'))

  // A job a run took over an hour ago and never answered is handed out again; after three tries it is closed.
  await db.query(`update search_jobs set claimed_at = now() - interval '61 minutes' where id = $1`, [late])
  const [{ c5 }] = await rows(`select agent_context('a6_calls', array['search_jobs']) as c5`)
  assert.deepEqual(c5.search_jobs.map((x) => x.job_id), [late])
  await db.query(`update search_jobs set claimed_at = now() - interval '61 minutes', attempts = 3 where id = $1`, [late])
  const [{ c6 }] = await rows(`select agent_context('a6_calls', array['search_jobs']) as c6`)
  assert.deepEqual(c6.search_jobs, [])
  const [gone] = await rows(`select status, note, finished_at is not null as closed from search_jobs where id = $1`, [late])
  assert.deepEqual(gone, { status: 'failed', note: 'No answer after three tries. Ask again.', closed: true })

  const questions = { role_type: 'senior_pmm', from_jd: true, groups: [{ title: 'Scope and remit', questions: [{ id: 'q1', text: 'Who owns pricing?', why: 'The JD names two product lines but not who owns pricing', source: 'jd_gap' }] }] }
  const tiers = { tiers: [{ tier: 1, title: 'Direct competitors', companies: [{ name: 'Hooli Sample', why: 'Same buyer' }] }], companies_csv: 'name,tier,why\nHooli Sample,1,Same buyer' }
  const [{ run }] = await rows(`select agent_run_start('a6_calls', 'schedule', 'research') as run`)
  const result = (d) => ({ kind: 'search_result', data: d })
  const [{ out }] = await rows(`select agent_write($1, $2) as out`, [run.run_id, JSON.stringify([
    result({ job_id: q, status: 'ready', content: 'Scope and remit\n1. Who owns pricing?', structured: questions }),
    result({ job_id: low, status: 'failed', note: 'Nothing found on the open web under that name.' }),
    result({ job_id: map, status: 'ready', content: 'Map', structured: [1] }),
    result({ job_id: map, status: 'ready', content: 'x'.repeat(60000), structured: tiers }),
    result({ job_id: map, status: 'ready', content: 'Map', structured: { groups: [] } }),
    result({ job_id: map, status: 'ready', structured: tiers }),
    result({ job_id: map, status: 'done' }),
    result({ job_id: map, status: 'ready', content: 'Map', structured: tiers, tab: 'brief' }),
    result({ job_id: q, status: 'ready', content: 'Again', structured: questions }),
    result({ job_id: 'not-a-job', status: 'failed' }),
    result({ job_id: '00000000-0000-0000-0000-000000000001', status: 'failed' }),
    result({ job_id: map, status: 'ready', content: 'Tier 1: Hooli Sample', structured: tiers, note: 'Web search only' }),
  ])])
  const r = out.results
  assert.equal(r[0].outcome, 'created', JSON.stringify(r[0]))
  assert.equal(r[0].note, 'Version 2')
  assert.equal(r[1].outcome, 'merged', JSON.stringify(r[1]))
  assert.deepEqual([r[2].code, r[2].field], ['invalid', 'structured'])
  assert.deepEqual([r[3].code, r[3].field], ['invalid', 'content'])
  assert.deepEqual([r[4].code, r[4].field], ['invalid', 'structured'])
  assert.deepEqual([r[5].code, r[5].field], ['invalid', 'content'])
  assert.deepEqual([r[6].code, r[6].field], ['invalid', 'status'])
  assert.deepEqual([r[7].outcome, r[7].field], ['rejected', 'tab'])
  assert.equal(r[8].code, 'wrong_state')
  assert.deepEqual([r[9].code, r[9].field], ['invalid', 'job_id'])
  assert.equal(r[10].code, 'not_found')
  assert.equal(r[11].outcome, 'created', JSON.stringify(r[11]))
  assert.equal(r[11].note, 'Version 1')

  // The owner's edited version stands; the agent's is the next one.
  assert.deepEqual(await rows(`select version, created_by, content from search_notes where search_id = $1 and tab = 'questions' order by version`, [sid]), [
    { version: 1, created_by: 'owner', content: 'Owner edit' },
    { version: 2, created_by: 'agent', content: 'Scope and remit\n1. Who owns pricing?' },
  ])
  const [note] = await rows(`select id, owner_id, structured from search_notes where search_id = $1 and tab = 'questions' and version = 2`, [sid])
  assert.equal(note.id, r[0].id)
  assert.equal(note.owner_id, ownerId)
  assert.deepEqual(note.structured, questions)
  assert.equal(await count(`search_notes where search_id = '${sid}' and tab = 'lowdown'`), 0)
  assert.deepEqual(await rows(`select kind, status, note, finished_at is not null as closed from search_jobs where search_id = $1 order by requested_at`, [sid]), [
    { kind: 'questions', status: 'ready', note: null, closed: true },
    { kind: 'lowdown', status: 'failed', note: 'Nothing found on the open web under that name.', closed: true },
    { kind: 'map', status: 'ready', note: 'Web search only', closed: true },
  ])
  await rows(`select agent_run_finish($1, 'ok', '[]', '2 results written, 1 failed')`, [run.run_id])

  // No other agent may send a result.
  const again = await job(sid, 'lowdown', 1)
  const [{ s3 }] = await rows(`select agent_run_start('a3_jobs', 'schedule', 'collect') as s3`)
  const [{ no }] = await rows(`select agent_write($1, $2) as no`, [s3.run_id, JSON.stringify([result({ job_id: again, status: 'failed', note: 'x' })])])
  assert.equal(no.results[0].code, 'not_allowed')
  await rows(`select agent_run_finish($1, 'ok')`, [s3.run_id])
  assert.equal(await count(`search_jobs where id = '${again}' and status = 'waiting'`), 1)

  // The owner reads the queue and the results; the reviewer reads neither.
  await owner(async () => {
    assert.equal(await count(`search_jobs where search_id = '${sid}'`), 4)
    assert.equal(await count(`search_notes where search_id = '${sid}' and created_by = 'agent'`), 2)
    // Once a job is closed, the same kind can be asked for again.
    const [{ next }] = await rows(`select request_search_job($1, 'questions') as next`, [sid])
    assert.notEqual(next, q)
  })
  await reviewer(async () => {
    assert.equal(await count('search_jobs'), 0)
    assert.equal(await count('search_notes'), 0)
  })
})

test('0048 research prompt: the seed puts the research mode in front of the active a6_calls prompt, once', async () => {
  await db.exec('begin')
  try {
    await db.exec(`update agent_prompts set active = false where agent = 'a6_calls' and active`)
    await db.exec(`insert into agent_prompts (agent, version, body, active) values ('a6_calls', 901, '## Mode: searches (read this first)\n\nThe evening calls run.', true), ('a6_calls', 900, 'An old version.', false)`)
    await db.exec(read('seed', 'agent_prompts_a6_research.sql'))
    await db.exec(read('seed', 'agent_prompts_a6_research.sql'))
    const [{ body }] = await rows(`select body from agent_prompts where agent = 'a6_calls' and active`)
    assert.ok(body.startsWith('## Mode: research (read this first)'))
    assert.equal(body.split('## Mode: research').length, 2, 'the section is there once')
    assert.ok(body.endsWith('## Mode: searches (read this first)\n\nThe evening calls run.'), 'the rest of the prompt is kept')
    assert.match(body, /context\?want=search_jobs/)
    assert.match(body, /"kind":"search_result"/)
    assert.doesNotMatch(body, /functions\/v1/, 'RECOS_URL already ends in /functions/v1')
    assert.doesNotMatch(body, /—/)
    assert.deepEqual(await rows(`select body from agent_prompts where agent = 'a6_calls' and version = 900`), [{ body: 'An old version.' }])
  } finally {
    await db.exec('rollback')
  }
})

// ---------------------------------------------------------------- inbox folders (0058)

test('inbox folders: the owner creates, renames and lists his own folders; names are unique per owner', async () => {
  await owner(async () => {
    await db.query(`insert into inbox_folders (name, position) values ('Hot leads', 0), ('Later', 1)`)
    const made = await rows(`select name, owner_id from inbox_folders order by position`)
    assert.deepEqual(made.map((r) => r.name), ['Hot leads', 'Later'])
    assert.ok(made.every((r) => r.owner_id === ownerId), 'owner_id defaults to the signed-in user')
    assert.match(String(await refused(`insert into inbox_folders (name) values (' hot LEADS ')`)), /duplicate key/)
    assert.match(String(await refused(`insert into inbox_folders (name) values ('   ')`)), /check constraint/)
    await db.query(`update inbox_folders set name = 'Hot ones' where name = 'Hot leads'`)
    assert.equal(await count(`inbox_folders where name = 'Hot ones'`), 1)
    assert.match(String(await refused(`delete from inbox_folders`)), /permission denied/)
  })
})

test('inbox folders: anon, the reviewer and a user with no role cannot read, add or delete one', async () => {
  await db.query(`insert into inbox_folders (owner_id, name) values ($1, 'Planted')`, [ownerId])
  try {
    await anon(async () => {
      assert.match(String(await refused(`select * from inbox_folders`)), /permission denied/)
      assert.match(String(await refused(`insert into inbox_folders (name) values ('x')`)), /permission denied/)
      assert.match(String(await refused(`select delete_inbox_folder(gen_random_uuid())`)), /permission denied/)
    })
    for (const who of [reviewer, noRole]) {
      await who(async () => {
        assert.equal(await count('inbox_folders'), 0)
        assert.ok(await refused(`insert into inbox_folders (name) values ('x')`))
        assert.match(String(await refused(`select delete_inbox_folder(gen_random_uuid())`)), /Only the owner/)
      })
    }
    const [{ id }] = await rows(`select id from inbox_folders where name = 'Planted'`)
    await reviewer(async () => assert.match(String(await refused(`select delete_inbox_folder($1)`, [id])), /Only the owner/))
    assert.equal(await count(`inbox_folders where name = 'Planted'`), 1)
  } finally {
    await db.query(`delete from inbox_folders where name = 'Planted'`)
  }
})

test('inbox folders: moving an item into a folder works, and deleting the folder returns it to Inbox', async () => {
  await owner(async () => {
    const [{ id: folder }] = await rows(`insert into inbox_folders (name) values ('Hot') returning id`)
    const [{ id: item }] = await rows(`select id from inbox_items where status = 'new' order by created_at limit 1`)
    await db.query(`update inbox_items set folder_id = $1 where id = $2`, [folder, item])
    assert.deepEqual(await rows(`select folder_id from inbox_items where id = $1`, [item]), [{ folder_id: folder }])
    assert.equal(await count(`inbox_items where folder_id = '${folder}'`), 1)
    // Back to Inbox by hand.
    await db.query(`update inbox_items set folder_id = null where id = $1`, [item])
    await db.query(`update inbox_items set folder_id = $1 where id = $2`, [folder, item])
    await db.query(`select delete_inbox_folder($1)`, [folder])
    assert.equal(await count(`inbox_folders where id = '${folder}'`), 0)
    assert.deepEqual(await rows(`select folder_id, status from inbox_items where id = $1`, [item]), [{ folder_id: null, status: 'new' }])
    assert.match(String(await refused(`select delete_inbox_folder($1)`, [folder])), /No such folder/)
  })
})

// ---------------------------------------------------------------- run

let failed = 0
test('0054 map top-up: a map job carries the newest map on the search as previous; other kinds carry none', async () => {
  const [s] = await rows(`select id from searches where status in ('open', 'intake') order by opened_on limit 1`)
  await db.query(`update search_jobs set status = 'failed', finished_at = now() where status in ('waiting', 'working')`)
  const [{ v }] = await rows(`select coalesce(max(version), 0) + 1 as v from search_notes where search_id = $1 and tab = 'map'`, [s.id])
  await db.query(`insert into search_notes (owner_id, search_id, tab, content, structured, version, created_by) values ($1, $2, 'map', 'Map', $3::jsonb, $4, 'a6_calls')`, [ownerId, s.id, JSON.stringify({ marker: 'previous-map' }), v])
  const mapJob = (await rows(`insert into search_jobs (owner_id, search_id, kind) values ($1, $2, 'map') returning id`, [ownerId, s.id]))[0].id
  const qJob = (await rows(`insert into search_jobs (owner_id, search_id, kind) values ($1, $2, 'questions') returning id`, [ownerId, s.id]))[0].id
  const [{ ctx }] = await rows(`select agent_context('a6_calls', array['search_jobs']) as ctx`)
  assert.equal(ctx.search_jobs.find((j) => j.job_id === mapJob).previous.marker, 'previous-map')
  assert.equal(ctx.search_jobs.find((j) => j.job_id === qJob).previous, null)
  await db.query(`update search_jobs set status = 'failed', finished_at = now() where id in ($1, $2)`, [mapJob, qJob])
})

test('0059 peek: nothing waiting says no work and claims nothing; a waiting job or a run request says work', async () => {
  await db.query(`update search_jobs set status = 'failed', finished_at = now() where status in ('waiting', 'working')`)
  await db.query(`update spec_requests set status = 'failed', finished_at = now() where status in ('waiting', 'working')`)
  await db.query(`update task_jobs set status = 'failed', finished_at = now() where status in ('waiting', 'working')`)
  await db.query(`update run_requests set taken_at = now() where taken_at is null`)
  const peek = async (a, m) => (await rows(`select agent_peek($1, $2) as p`, [a, m]))[0].p
  assert.equal((await peek('a6_calls', 'research')).work, false)
  assert.equal((await peek('a9_tasks', null)).work, false)
  const [s] = await rows(`select id from searches order by opened_on limit 1`)
  const jid = (await rows(`insert into search_jobs (owner_id, search_id, kind) values ($1, $2, 'questions') returning id`, [ownerId, s.id]))[0].id
  const p1 = await peek('a6_calls', 'research')
  assert.equal(p1.work, true)
  assert.equal(p1.waiting, 1)
  assert.equal((await rows(`select status from search_jobs where id = $1`, [jid]))[0].status, 'waiting', 'peek claims nothing')
  await db.query(`update search_jobs set status = 'failed', finished_at = now() where id = $1`, [jid])
  await db.query(`insert into run_requests (agent, requested_by) values ('a9_tasks', 'owner')`)
  assert.equal((await peek('a9_tasks', null)).work, true)
  await db.query(`update run_requests set taken_at = now() where taken_at is null`)
  assert.equal((await peek('a1_review', null)).work, true)
  await assert.rejects(db.query(`set local role authenticated; select agent_peek('a9_tasks', null)`))
})

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

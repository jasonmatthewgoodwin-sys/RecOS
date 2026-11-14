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

await db.exec(read('tests', 'supabase-shim.sql'))
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

await db.exec(read('seed', 'targets.sql'))
await db.exec(read('seed', 'sample_week.sql'))
// Seeds must be safe to run twice.
await db.exec(read('seed', 'targets.sql'))
await db.exec(read('seed', 'sample_week.sql'))

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
    for (const t of [...allTables, 'kpi_week_view', 'kpi_this_week']) {
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

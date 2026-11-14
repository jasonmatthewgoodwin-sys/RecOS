// Joins every migration, policy and view into one file that can be pasted
// into the Supabase SQL editor. Use it for a brand new project only: the
// migrations are not safe to run twice.
//
//   node bundle.mjs            -> build/setup_new_project.sql
//
// The output is not kept in the repository. The numbered files are the record.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const parts = ['-- RecOS: full database setup for a NEW, EMPTY project.\n-- Paste all of this into the Supabase SQL editor and press Run, once.\n\nbegin;\n']

for (const dir of ['migrations', 'policies', 'views']) {
  for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith('.sql')).sort()) {
    parts.push(`\n-- ===== ${dir}/${file} =====\n\n${readFileSync(join(root, dir, file), 'utf8').trim()}\n`)
  }
}
parts.push('\ncommit;\n')

mkdirSync(join(root, 'build'), { recursive: true })
const out = join(root, 'build', 'setup_new_project.sql')
writeFileSync(out, parts.join(''))
console.log(`Wrote ${out}`)

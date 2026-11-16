import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRoleType, questionBank, questionSet, questionsAsText, ROLE_TYPES, type RoleType } from './questionBank'
import { createSampleSearchResearch, latestJobs, sampleLowdown, sampleMap, sampleQuestions, type SearchJobKind } from './searchResearch'

const roleTypes: RoleType[] = ['ic_pmm', 'senior_pmm', 'technical_pmm', 'head_of_pmm', 'director_vp_pmm', 'plg_pmm', 'other']

describe('the question bank', () => {
  it('gives every role type its groups, 35 to 50 questions, all from the bank', () => {
    expect(ROLE_TYPES.map((r) => r.value)).toEqual(roleTypes)
    for (const role of roleTypes) {
      const groups = questionBank(role)
      expect(groups.length).toBeGreaterThan(10)
      const all = groups.flatMap((g) => g.questions)
      expect(all.length, role).toBeGreaterThanOrEqual(35)
      expect(all.length, role).toBeLessThanOrEqual(50)
      for (const g of groups) {
        expect(g.title).toBeTruthy()
        expect(g.questions.length).toBeGreaterThan(0)
      }
      for (const q of all) {
        expect(q.source).toBe('bank')
        expect(q.text.trim().endsWith('?'), q.text).toBe(true)
      }
    }
  })

  it('has unique ids within every role type, and the same core ids across them', () => {
    for (const role of roleTypes) {
      const ids = questionBank(role).flatMap((g) => g.questions.map((q) => q.id))
      expect(new Set(ids).size, role).toBe(ids.length)
    }
    const core = (role: RoleType) => questionBank(role).filter((_, i) => i !== 1).flatMap((g) => g.questions.map((q) => q.id))
    expect(core('ic_pmm')).toEqual(core('director_vp_pmm'))
  })

  it('gives each role type its own group, second in the list', () => {
    const titles = roleTypes.map((role) => questionBank(role)[1].title)
    expect(new Set(titles).size).toBe(roleTypes.length)
    expect(questionBank('plg_pmm')[1].questions.some((q) => /free trial/.test(q.text))).toBe(true)
  })

  it('keeps the house style: no dash used as punctuation and no exclamation mark', () => {
    for (const role of roleTypes) {
      const text = questionsAsText(questionBank(role))
      expect(text).not.toMatch(/[—–!]/)
    }
  })

  it('falls back to the other set for an unknown role type, and returns a fresh copy each time', () => {
    expect(questionBank(null)).toEqual(questionBank('other'))
    expect(questionBank('cmo' as RoleType)).toEqual(questionBank('other'))
    expect(isRoleType('plg_pmm')).toBe(true)
    expect(isRoleType('cmo')).toBe(false)
    const a = questionBank('ic_pmm')
    a[0].questions[0].text = 'changed'
    expect(questionBank('ic_pmm')[0].questions[0].text).not.toBe('changed')
    expect(questionSet('senior_pmm')).toMatchObject({ role_type: 'senior_pmm', from_jd: false })
  })

  it('writes the questions out as numbered text under their group titles', () => {
    const text = questionsAsText(questionBank('other'))
    expect(text.startsWith('Why the role is open\n1. ')).toBe(true)
    expect(text).toMatch(/\n\nFor this role\n4\. /)
  })
})

describe('the sample results', () => {
  it('are in the shapes of the contract', () => {
    const q = sampleQuestions({ roleType: 'senior_pmm', jdText: 'A job description', briefDueOn: null }).structured as { role_type: string; from_jd: boolean; groups: { title: string; questions: { id: string; source: string; why?: string }[] }[] }
    expect(q.role_type).toBe('senior_pmm')
    expect(q.from_jd).toBe(true)
    expect(q.groups[0].questions.some((x) => x.source === 'jd_gap' && x.why)).toBe(true)
    const ids = q.groups.flatMap((g) => g.questions.map((x) => x.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect((sampleQuestions({ roleType: null, jdText: null, briefDueOn: null }).structured as { from_jd: boolean }).from_jd).toBe(false)

    const low = sampleLowdown('Contoso Demo')
    expect(Object.keys(low.structured)).toEqual(['worked_before', 'company', 'funding', 'leadership', 'pmm_team', 'news', 'hiring_signals', 'watch_outs', 'sources'])
    expect(low.content).toMatch(/^Contoso Demo/)

    const map = sampleMap('Senior PMM').structured as { tiers: { tier: number; companies: { name: string; why: string }[] }[]; boolean: { label: string; string: string }[]; companies_csv: string }
    expect(map.tiers.map((t) => t.tier)).toEqual([1, 2, 3])
    expect(map.companies_csv.split('\n')[0]).toBe('name,tier,why')
    expect(map.companies_csv.split('\n').length).toBe(1 + map.tiers.flatMap((t) => t.companies).length)
    for (const b of map.boolean) expect(b.string.split('(').length).toBe(b.string.split(')').length)
  })
})

describe('the sample stand-in for research jobs', () => {
  type Saved = { searchId: string; tab: SearchJobKind; content: string; structured: Record<string, unknown> }
  let saved: Saved[]
  const make = (saveFails = false) =>
    createSampleSearchResearch({
      addSearch: async ({ client }) => `s-${client}`,
      saveNote: async (searchId, tab, content, structured) => {
        if (saveFails) throw new Error('no')
        saved.push({ searchId, tab, content, structured })
      },
      delayMs: 1000,
    })

  beforeEach(() => {
    saved = []
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('starts a search and remembers the intake', async () => {
    const r = make()
    const id = await r.startSearch({ client: ' Contoso Demo ', role: 'Senior PMM', roleType: 'senior_pmm', jdText: '  Own launches. ', briefDueOn: '2026-11-20' })
    expect(id).toBe('s-Contoso Demo')
    expect(await r.searchIntake(id)).toEqual({ roleType: 'senior_pmm', jdText: 'Own launches.', briefDueOn: '2026-11-20' })
    expect(await r.searchIntake('nothing')).toEqual({ roleType: null, jdText: null, briefDueOn: null })
    await expect(r.startSearch({ client: ' ', role: 'PMM' })).rejects.toThrow(/client/)
    await expect(r.startSearch({ client: 'Contoso Demo', role: '' })).rejects.toThrow(/role/)
  })

  it('a requested job waits, works, then is ready with a result saved as a note', async () => {
    const r = make()
    const id = await r.startSearch({ client: 'Contoso Demo', role: 'Senior PMM', roleType: 'plg_pmm', jdText: 'Own launches.' })
    expect(await r.searchJobs(id)).toEqual([])
    await r.requestSearchJob(id, 'questions')
    expect((await r.searchJobs(id)).map((j) => [j.kind, j.status, j.finishedAt])).toEqual([['questions', 'waiting', null]])
    await vi.advanceTimersByTimeAsync(600)
    expect((await r.searchJobs(id))[0].status).toBe('working')
    expect(saved).toEqual([])
    await vi.advanceTimersByTimeAsync(500)
    const [job] = await r.searchJobs(id)
    expect(job.status).toBe('ready')
    expect(job.finishedAt).toBeTruthy()
    expect(saved.map((s) => [s.searchId, s.tab])).toEqual([[id, 'questions']])
    expect(saved[0].structured).toMatchObject({ role_type: 'plg_pmm', from_jd: true })
  })

  it('keeps one open job per search and kind, and allows another once it is closed', async () => {
    const r = make()
    const id = await r.startSearch({ client: 'Contoso Demo', role: 'Head of PMM' })
    await r.requestSearchJob(id, 'lowdown')
    await r.requestSearchJob(id, 'lowdown')
    await r.requestSearchJob(id, 'map')
    expect((await r.searchJobs(id)).map((j) => j.kind).sort()).toEqual(['lowdown', 'map'])
    await vi.advanceTimersByTimeAsync(1100)
    expect((await r.searchJobs(id)).every((j) => j.status === 'ready')).toBe(true)
    expect(saved.map((s) => s.tab).sort()).toEqual(['lowdown', 'map'])
    expect(saved.find((s) => s.tab === 'lowdown')!.content).toMatch(/Contoso Demo/)
    await r.requestSearchJob(id, 'lowdown')
    const jobs = await r.searchJobs(id)
    expect(jobs.length).toBe(3)
    expect(latestJobs(jobs).lowdown!.status).toBe('waiting')
    expect(latestJobs(jobs).map!.status).toBe('ready')
    expect(latestJobs(jobs).questions).toBeUndefined()
  })

  it('reports a job as failed, with a line for the screen, when the result cannot be saved', async () => {
    const r = make(true)
    await r.requestSearchJob('s-1', 'map')
    await vi.advanceTimersByTimeAsync(1100)
    const [job] = await r.searchJobs('s-1')
    expect(job.status).toBe('failed')
    expect(job.note).toBeTruthy()
  })
})

import { describe, expect, it } from 'vitest'
import { freshSampleCandidates } from './sample'
import { boardCounts, boardStages, candidateNeedsDesk, feedbackWord, inPlay, putForward, stageOrder, stageWord } from './searches'

// Jason's pipeline stages (0060, 18 November 2026).
describe('the pipeline stages', () => {
  it('runs left to right as in Spott, with Rejected and Withdrew off the board', () => {
    expect(boardStages.map((s) => stageWord[s])).toEqual(['Application', 'Sourced', 'Longlist', 'Shortlist', 'Interview 1', 'Interview 2', 'Interview 3', 'Interview 4', 'Offer', 'Placed'])
    expect(stageOrder.slice(-2)).toEqual(['rejected', 'withdrew'])
    expect(inPlay).not.toContain('placed')
    expect(putForward[0]).toBe('shortlist')
  })

  it('keeps the counters meaning what they did: longlist and beyond, shortlist and beyond, interview 1, interviews 2 to 4, offer', () => {
    const at = (stage: string, i: number) => ({ ...freshSampleCandidates()[0], id: `c-${i}`, stage }) as ReturnType<typeof freshSampleCandidates>[number]
    const cands = ['application', 'sourced', 'longlist', 'longlist', 'shortlist', 'interview_1', 'interview_2', 'interview_4', 'offer', 'rejected'].map(at)
    expect(boardCounts(cands)).toEqual({ nSourced: 8, nSpoken: 7, nSubmitted: 5, nFirstStage: 1, nLaterStage: 2, nOffer: 1 })
  })

  it('reads feedback as late on the shortlist only', () => {
    const c = { ...freshSampleCandidates()[0], stage: 'shortlist' as const, submittedOn: '2026-11-04', feedbackReceivedOn: null }
    expect(feedbackWord(c, '2026-11-11')).toBe('Feedback 5d')
    expect(candidateNeedsDesk(c, '2026-11-11')).toBe(true)
    expect(feedbackWord({ ...c, stage: 'interview_1' }, '2026-11-11')).toBeUndefined()
  })
})

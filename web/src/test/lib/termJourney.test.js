import { describe, it, expect } from 'vitest'
import { termJourney } from '@/lib/termJourney'

describe('lib/termJourney', () => {
  const mockTerm = {
    registrationOpensAt: '2026-08-01T00:00:00Z',
    registrationClosesAt: '2026-08-15T00:00:00Z',
    resultsPublishedAt: '2026-08-20T00:00:00Z',
    balanceDueAt: '2026-08-30T00:00:00Z',
    checkInStart: '2026-09-01',
    checkInEnd: '2026-09-05',
    stayStart: '2026-09-06',
    stayEnd: '2026-12-31',
  }

  it('returns empty array if term is missing', () => {
    expect(termJourney(null)).toEqual([])
    expect(termJourney(undefined)).toEqual([])
  })

  it('determines past, current, and future stages accurately', () => {
    // Current time is in registration window (2026-08-05)
    const nowRegistration = new Date('2026-08-05T00:00:00Z')
    const stages = termJourney(mockTerm, {}, nowRegistration)

    expect(stages).toHaveLength(5)
    expect(stages[0].key).toBe('registration')
    expect(stages[0].state).toBe('current')
    expect(stages[1].state).toBe('todo')
    expect(stages[2].state).toBe('todo')
    expect(stages[3].state).toBe('todo')
    expect(stages[4].state).toBe('todo')
  })

  it('marks earlier stages as done and advances current pointer', () => {
    // Current time is in payment window (2026-08-25)
    const nowPayment = new Date('2026-08-25T00:00:00Z')
    const stages = termJourney(mockTerm, {}, nowPayment)

    expect(stages[0].state).toBe('done')
    expect(stages[1].state).toBe('done')
    expect(stages[2].state).toBe('current')
    expect(stages[3].state).toBe('todo')
    expect(stages[4].state).toBe('todo')
  })

  it('attaches custom stage notes when provided', () => {
    const customNotes = {
      assignment: '15 Applications to review',
      checkin: '30 students checked in today',
    }
    const stages = termJourney(mockTerm, customNotes, new Date('2026-08-18T00:00:00Z'))

    const assignmentStage = stages.find((s) => s.key === 'assignment')
    expect(assignmentStage?.note).toBe('15 Applications to review')
    expect(assignmentStage?.custom).toBe(true)
  })
})

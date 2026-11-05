import { describe, expect, it } from 'vitest'
import { monthStart, nextMonthStart, parseEuro } from './money'
import { estimate, neededPerWeek } from './goals'
import { review } from './review'
import type { Category, Expense } from './types'

describe('parseEuro', () => {
  it('accepts dot and comma decimals', () => { expect(parseEuro('12.5')).toBe(1250); expect(parseEuro('12,50')).toBe(1250) })
  it('rounds to whole cents without float errors', () => { expect(parseEuro('0.07')).toBe(7); expect(parseEuro('19.99')).toBe(1999) })
  it('rejects zero, negatives and junk', () => { for (const v of ['0', '-3', 'abc', '', ' ']) expect(parseEuro(v)).toBeNull() })
})

describe('month bounds', () => {
  it('covers exactly one month', () => {
    const d = new Date(2026, 11, 15)
    expect(monthStart(d)).toBe('2026-12-01'); expect(nextMonthStart(d)).toBe('2027-01-01')
  })
})

const now = new Date('2026-11-20T12:00:00')
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

describe('estimate', () => {
  it('is null with no savings pace or nothing left to save', () => {
    expect(estimate([], 10000, now)).toBeNull()
    expect(estimate([{ amount_cents: 500, created_at: ago(1) }], 0, now)).toBeNull()
  })
  it('averages over weeks since the first contribution (min 1 week)', () => {
    const e = estimate([{ amount_cents: 1000, created_at: ago(1) }], 5000, now)!
    expect(e.perWeek).toBe(1000); expect(e.weeksLeft).toBe(5)
  })
  it('spreads older money across the window', () => {
    const e = estimate([{ amount_cents: 4000, created_at: ago(28) }], 4000, now)! // 4 weeks ago
    expect(e.perWeek).toBe(1000); expect(e.weeksLeft).toBe(4)
  })
  it('ignores contributions older than 8 weeks', () => {
    expect(estimate([{ amount_cents: 9999, created_at: ago(100) }], 5000, now)).toBeNull()
  })
  it('"what if" extra saving brings the date forward', () => {
    const c = [{ amount_cents: 1000, created_at: ago(1) }]
    const base = estimate(c, 6000, now)!, faster = estimate(c, 6000, now, 1000)!
    expect(faster.date.getTime()).toBeLessThan(base.date.getTime())
    expect(estimate([], 6000, now, 1000)!.weeksLeft).toBe(6) // works even with no history
  })
})

describe('neededPerWeek', () => {
  it('splits what is left over the weeks to the deadline', () => {
    // 20 Nov noon -> end of 18 Dec is 28.5 days (the deadline day itself counts): 7000 / 4.07 weeks
    expect(Math.round(neededPerWeek(7000, '2026-12-18', now)!)).toBe(1719)
  })
  it('is null without a future deadline', () => {
    expect(neededPerWeek(7000, null, now)).toBeNull(); expect(neededPerWeek(7000, '2026-11-01', now)).toBeNull()
  })
})

describe('review', () => {
  const cats: Category[] = [
    { id: 'a', name: 'Eating out', emoji: '🍕', budget_cents: 10000 },
    { id: 'b', name: 'Groceries', emoji: '🛒', budget_cents: 40000 },
  ]
  const ex = (id: string, day: string, cents: number): Expense => ({ id: Math.random().toString(), member_id: 'm', category_id: id, amount_cents: cents, note: '', spent_on: day })
  it('compares month-to-date with the same days last month', () => {
    const r = review([
      ex('a', '2026-10-05', 10000), ex('a', '2026-10-28', 99999), // 28th is after "day 20": excluded
      ex('a', '2026-11-05', 8000), ex('b', '2026-11-06', 5000),
    ], cats, now)
    expect(r.totalBefore).toBe(10000); expect(r.totalNow).toBe(13000); expect(r.totalPct).toBe(30)
    expect(r.less[0]).toMatchObject({ name: 'Eating out', pct: -20 })
    expect(r.more[0]).toMatchObject({ name: 'Groceries', pct: null }) // nothing last month
  })
  it('skips tiny changes and flags categories well under budget', () => {
    const r = review([ex('a', '2026-10-05', 1000), ex('a', '2026-11-05', 1200)], cats, now)
    expect(r.less).toEqual([]); expect(r.more).toEqual([])
    expect(r.underBudget.map(c => c.name)).toContain('Eating out')
  })
  it('copes with an empty history', () => {
    const r = review([], cats, now)
    expect(r.totalPct).toBeNull(); expect(r.underBudget).toEqual([])
  })
  it('handles the 31st when last month is shorter', () => {
    const r = review([ex('a', '2026-02-28', 7000)], cats, new Date('2026-03-31T10:00:00'))
    expect(r.totalBefore).toBe(7000)
  })
})

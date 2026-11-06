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

import { dueDates, dueList, monthlySetAside, upcoming, yearlyCost, type Bill, type Payment } from './bills'
import { niceAxis, yearModel } from './year'

const bill = (o: Partial<Bill> = {}): Bill => ({ id: 'b1', name: 'Car insurance', category_id: null, amount_cents: 62000, times_per_year: 1, due_month: 3, due_day: 15, archived: false, created_at: '2026-01-02T10:00:00Z', ...o })

describe('bill schedule', () => {
  it('yearly: one date', () => expect(dueDates(bill(), 2026)).toEqual(['2026-03-15']))
  it('every 6 months wraps around the year, sorted', () => expect(dueDates(bill({ times_per_year: 2, due_month: 9 }), 2026)).toEqual(['2026-03-15', '2026-09-15']))
  it('quarterly', () => expect(dueDates(bill({ times_per_year: 4, due_month: 2 }), 2026)).toEqual(['2026-02-15', '2026-05-15', '2026-08-15', '2026-11-15']))
  it('monthly gives 12 dates', () => expect(dueDates(bill({ times_per_year: 12, due_month: 1 }), 2026)).toHaveLength(12))
  it('clamps the 31st to short months, and leap years', () => {
    expect(dueDates(bill({ times_per_year: 4, due_month: 2, due_day: 31 }), 2026)).toEqual(['2026-02-28', '2026-05-31', '2026-08-31', '2026-11-30'])
    expect(dueDates(bill({ due_month: 2, due_day: 30 }), 2028)).toEqual(['2028-02-29'])
  })
  it('yearly cost and the monthly amount to put aside', () => {
    expect(yearlyCost(bill())).toBe(62000); expect(monthlySetAside(bill())).toBe(5167)
    expect(yearlyCost(bill({ times_per_year: 4, amount_cents: 9000 }))).toBe(36000)
  })
})

describe('due list and reminders', () => {
  const today = new Date('2026-03-01T12:00:00')
  const paid: Payment = { id: 'p', bill_id: 'b1', due_on: '2026-03-15', expense_id: 'e', expenses: { amount_cents: 60500, spent_on: '2026-03-10' } }
  it('flags upcoming and overdue unpaid dates', () => {
    expect(upcoming([bill()], [], today).map(d => [d.due, d.overdue])).toEqual([['2026-03-15', false]])
    expect(upcoming([bill()], [], new Date('2026-03-20T12:00:00'))[0]).toMatchObject({ overdue: true, days: -5 })
  })
  it('nothing to remind once paid, or when due far away', () => {
    expect(upcoming([bill()], [paid], today)).toEqual([])
    expect(upcoming([bill({ due_month: 9 })], [], today)).toEqual([])
  })
  it('does not call a due date missed if the bill did not exist yet', () => {
    const b = bill({ created_at: '2026-06-10T00:00:00Z' })
    expect(dueList([b], [], 2026, new Date('2026-07-01T12:00:00'))).toEqual([])
  })
  it('keeps paid history of a bill that has ended, but hides its unpaid dates', () => {
    const ended = bill({ archived: true, times_per_year: 2, due_month: 3 })
    const list = dueList([ended], [paid], 2026, today)
    expect(list.map(d => d.due)).toEqual(['2026-03-15'])
  })
  it('sees January reminders in late December', () => {
    const jan = bill({ due_month: 1, due_day: 10 })
    const janPaid: Payment = { id: 'q', bill_id: 'b1', due_on: '2026-01-10', expense_id: 'e2', expenses: null }
    expect(upcoming([jan], [janPaid], new Date('2026-12-28T12:00:00')).map(d => d.due)).toEqual(['2027-01-10'])
    // and this year's January, if it was never paid, is reported as overdue rather than forgotten
    expect(upcoming([jan], [], new Date('2026-12-28T12:00:00')).map(d => d.due)).toEqual(['2026-01-10', '2027-01-10'])
  })
})

describe('year model', () => {
  const cats: Category[] = [
    { id: 'a', name: 'Eating out', emoji: '🍕', budget_cents: 10000 },
    { id: 'b', name: 'Groceries', emoji: '🛒', budget_cents: 40000 },
    { id: 'z', name: 'Old', emoji: '📦', budget_cents: 5000, archived: true },
  ]
  const rows = [
    { month: 1, category_id: 'a', is_bill: false, total_cents: 7000 }, { month: 1, category_id: 'b', is_bill: false, total_cents: 30000 },
    { month: 3, category_id: 'b', is_bill: true, total_cents: 60500 }, { month: 3, category_id: null, is_bill: false, total_cents: 1000 },
  ]
  const m = yearModel(rows, cats)
  it('splits months into everyday and bills', () => {
    expect(m.months[0]).toMatchObject({ everyday: 37000, bills: 0, total: 37000 })
    expect(m.months[2]).toMatchObject({ everyday: 1000, bills: 60500, total: 61500 })
    expect(m.months[5].total).toBe(0)
  })
  it('totals and busiest month', () => {
    expect(m).toMatchObject({ total: 98500, everyday: 38000, bills: 60500 })
    expect(m.topMonth?.month).toBe(3)
  })
  it('categories: everyday only, ranked, with yearly budget, uncategorised last resort, archived hidden if unused', () => {
    expect(m.categories.map(c => c.name)).toEqual(['Groceries', 'Eating out', 'Uncategorised'])
    expect(m.categories[0]).toMatchObject({ spent: 30000, budget: 480000 }) // bill money is not counted here
  })
  it('monthly budget ignores archived categories', () => expect(m.monthlyBudget).toBe(50000))
  it('an empty year', () => expect(yearModel([], cats).topMonth).toBeNull())
})

describe('niceAxis', () => {
  it('rounds the top to a clean number with 4 even steps', () => {
    expect(niceAxis(37000)).toEqual({ top: 40000, ticks: [0, 10000, 20000, 30000, 40000] })
    expect(niceAxis(61500).top).toBe(80000) // clean steps (20,000) beat a tighter but ugly 62,500
    expect(niceAxis(100).top).toBeGreaterThanOrEqual(100)
  })
  it('does not waste space: a 1,388 euro peak gets a 1,600 euro axis, not 2,000', () => {
    expect(niceAxis(138800)).toEqual({ top: 160000, ticks: [0, 40000, 80000, 120000, 160000] })
  })
  it('always covers the maximum', () => { for (const v of [1, 99, 1234, 98765, 4_000_000]) expect(niceAxis(v).top).toBeGreaterThanOrEqual(v) })
  it('has a sensible empty case', () => expect(niceAxis(0).ticks[0]).toBe(0))
})

import { changes } from './expense'
describe('expense edit payload', () => {
  const old: Expense = { id: 'x', member_id: 'm', category_id: 'a', amount_cents: 1250, note: 'lunch', spent_on: '2026-11-03' }
  const same = { cents: 1250, cat: 'a', note: 'lunch', date: '2026-11-03' }
  it('is empty when nothing changed, so nothing is sent', () => expect(changes(old, same)).toEqual({}))
  it('sends only the fields that changed', () => {
    expect(changes(old, { ...same, cents: 2150 })).toEqual({ amount_cents: 2150 })
    expect(changes(old, { ...same, cat: 'b', note: 'dinner' })).toEqual({ category_id: 'b', note: 'dinner' })
    expect(changes(old, { ...same, date: '2026-11-02' })).toEqual({ spent_on: '2026-11-02' })
  })
  it('never sends an empty category (an uncategorised expense stays as it is)', () => {
    expect(changes({ ...old, category_id: null }, { ...same, cat: '' })).toEqual({})
  })
})

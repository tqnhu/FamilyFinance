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

import { fitWithin } from './image'
describe('fitWithin (receipt photo size)', () => {
  it('shrinks the longest side to the limit, keeping the shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 1600, h: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ w: 1200, h: 1600 })
  })
  it('never enlarges a small photo', () => expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 }))
  it('survives extreme shapes', () => { expect(fitWithin(20000, 10).h).toBeGreaterThanOrEqual(1); expect(fitWithin(1, 1)).toEqual({ w: 1, h: 1 }) })
})

import { isSeparateBill } from './expense'
import { isMonthlyBill } from './bills'
describe('which bill payments count as everyday spending', () => {
  it('ordinary expenses and monthly fees count; yearly-type bills are kept apart', () => {
    expect(isSeparateBill({ bill_id: null, monthly_fee: false })).toBe(false)
    expect(isSeparateBill({})).toBe(false)
    expect(isSeparateBill({ bill_id: 'b', monthly_fee: true })).toBe(false) // a monthly fee is ordinary spending
    expect(isSeparateBill({ bill_id: 'b', monthly_fee: false })).toBe(true)
    expect(isSeparateBill({ bill_id: 'b' })).toBe(true) // payments from before the flag existed
  })
  it('only monthly bills skip the "put aside" amount', () => {
    expect([1, 2, 4, 12].map(n => isMonthlyBill({ times_per_year: n as 1 | 2 | 4 | 12 }))).toEqual([false, false, false, true])
  })
})

import { joinMessage } from './join'
describe('joinMessage', () => {
  it('is null once the person is in the family', () => {
    for (const ok of ['parent', 'child', 'already_in_this_family']) expect(joinMessage(ok)).toBeNull()
  })
  it('explains every way it can fail, in plain words', () => {
    for (const bad of ['invalid_code', 'too_many_attempts', 'name_required', 'already_member']) {
      const m = joinMessage(bad)
      expect(m).toBeTruthy(); expect(m).not.toContain('_') // never shows a code word to a person
    }
    expect(joinMessage('invalid_code')).toContain('12')
    expect(joinMessage('too_many_attempts')).toContain('hour')
  })
  it('never treats an unknown answer as success', () => {
    for (const odd of [null, undefined, '', 'PARENT', 42, {}]) expect(joinMessage(odd)).toBeTruthy()
  })
})

import { canStep, monthLines, periodLabel, periodNow, periodRange, stepPeriod, tagLines } from './tags'
describe('tag periods', () => {
  const p = (kind: 'month' | 'year' | 'all', year = 2026, month = 10) => ({ kind, year, month })
  it('month, year and all-time ranges, end date exclusive', () => {
    expect(periodRange(p('month'))).toEqual({ from: '2026-11-01', to: '2026-12-01' })
    expect(periodRange(p('month', 2026, 11))).toEqual({ from: '2026-12-01', to: '2027-01-01' }) // December rolls into January
    expect(periodRange(p('month', 2026, 0))).toEqual({ from: '2026-01-01', to: '2026-02-01' })
    expect(periodRange(p('year'))).toEqual({ from: '2026-01-01', to: '2027-01-01' })
    expect(periodRange(p('all'))).toEqual({ from: null, to: null })
  })
  it('labels', () => {
    expect(periodLabel(p('month'))).toBe('November 2026'); expect(periodLabel(p('year'))).toBe('2026'); expect(periodLabel(p('all'))).toBe('All time')
  })
  it('steps across year ends', () => {
    expect(stepPeriod(p('month', 2026, 0), -1)).toMatchObject({ year: 2025, month: 11 })
    expect(stepPeriod(p('month', 2026, 11), 1)).toMatchObject({ year: 2027, month: 0 })
    expect(stepPeriod(p('year'), -1).year).toBe(2025); expect(stepPeriod(p('all'), 1)).toEqual(p('all'))
  })
  it('never steps into the future', () => {
    const now = new Date('2026-11-15T12:00:00')
    expect(canStep(periodNow('month', now), 1, now)).toBe(false); expect(canStep(periodNow('month', now), -1, now)).toBe(true)
    expect(canStep(periodNow('year', now), 1, now)).toBe(false); expect(canStep(p('month', 2026, 9), 1, now)).toBe(true)
    expect(canStep(p('all'), -1, now)).toBe(false)
  })
})
describe('tag totals', () => {
  const tags = [{ id: 'a', name: 'Vietnam', archived: false }, { id: 'b', name: 'Kitchen', archived: true }, { id: 'c', name: 'Unused', archived: false }]
  it('ranks tags, keeps "no tag" apart, and adds up', () => {
    const r = tagLines([{ tag_id: 'a', total_cents: 5000, n: 3 }, { tag_id: null, total_cents: 900, n: 2 }, { tag_id: 'b', total_cents: 12000, n: 1 }], tags)
    expect(r.lines.map(l => [l.name, l.total, l.n])).toEqual([['Kitchen', 12000, 1], ['Vietnam', 5000, 3]])
    expect(r.untagged).toEqual({ total: 900, n: 2 }); expect(r.tagged).toBe(17000); expect(r.all).toBe(17900)
  })
  it('ignores unknown tags and empty periods', () => {
    expect(tagLines([{ tag_id: 'zzz', total_cents: 100, n: 1 }], tags).lines).toEqual([])
    expect(tagLines([], tags)).toMatchObject({ lines: [], tagged: 0, all: 0, untagged: { total: 0, n: 0 } })
  })
  it('breaks ties by name so the order is stable', () => {
    expect(tagLines([{ tag_id: 'c', total_cents: 5, n: 1 }, { tag_id: 'a', total_cents: 5, n: 1 }], tags).lines.map(l => l.name)).toEqual(['Unused', 'Vietnam'])
  })
  it('month rows are oldest first with readable labels', () => {
    const m = monthLines([{ month: '2026-04-01', total_cents: 4000, n: 1 }, { month: '2025-12-01', total_cents: 1000, n: 1 }])
    expect(m.map(x => x.label)).toEqual(['Dec 2025', 'Apr 2026']); expect(m[1].total).toBe(4000)
  })
})
describe('expense changes with a tag', () => {
  const old = { id: 'x', member_id: 'm', category_id: 'a', amount_cents: 100, note: '', spent_on: '2026-01-01', tag_id: 't1' }
  const same = { cents: 100, cat: 'a', note: '', date: '2026-01-01' }
  it('sends the tag only when it changed', () => {
    expect(changes(old, { ...same, tag: 't1' })).toEqual({})
    expect(changes(old, { ...same, tag: 't2' })).toEqual({ tag_id: 't2' })
  })
  it('an empty choice removes the tag (null), and an untagged expense stays untagged', () => {
    expect(changes(old, { ...same, tag: '' })).toEqual({ tag_id: null })
    expect(changes({ ...old, tag_id: null }, { ...same, tag: '' })).toEqual({})
    expect(changes({ ...old, tag_id: undefined }, { ...same, tag: '' })).toEqual({})
  })
  it('callers that do not know about tags leave them alone', () => expect(changes(old, same)).toEqual({}))
})

import { NO_TAG, bulkMessage, chunk, usedTagIds, visibleExpenses } from './expense'
describe('Home list filter', () => {
  const list = [
    { id: 1, bill_id: null, monthly_fee: false, tag_id: 'a' }, { id: 2, bill_id: null, monthly_fee: false, tag_id: null },
    { id: 3, bill_id: 'b', monthly_fee: true, tag_id: null }, // a monthly fee: everyday spending
    { id: 4, bill_id: 'b', monthly_fee: false, tag_id: 'a' }, // a yearly bill payment
    { id: 5, bill_id: 'b', monthly_fee: false, tag_id: null }, // a yearly bill payment without a tag
  ]
  it('no filter: everyday spending, as before', () => expect(visibleExpenses(list, '').map(x => x.id)).toEqual([1, 2, 3]))
  it('a tag: everything with it, bill payments included (matches the tag total)', () => expect(visibleExpenses(list, 'a').map(x => x.id)).toEqual([1, 4]))
  it('"no tag": untagged everyday spending, which is what is left to tag', () => expect(visibleExpenses(list, NO_TAG).map(x => x.id)).toEqual([2, 3]))
  it('a tag nobody uses shows nothing', () => expect(visibleExpenses(list, 'zzz')).toEqual([]))
  it('lists the tags that are in use', () => expect([...usedTagIds(list)]).toEqual(['a']))
})
describe('chunk', () => {
  it('splits into pieces of at most the size, keeping order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]); expect(chunk([], 3)).toEqual([]); expect(chunk([1, 2], 5)).toEqual([[1, 2]])
  })
  it('250 ids become 3 requests of at most 100', () => expect(chunk(Array.from({ length: 250 }, (_, i) => i), 100).map(c => c.length)).toEqual([100, 100, 50]))
  it('refuses a size that would loop forever', () => expect(() => chunk([1], 0)).toThrow())
})
describe('bulkMessage', () => {
  it('says what happened', () => {
    expect(bulkMessage(3, 3, 'Holiday')).toBe('Tagged 3 expenses with #Holiday.'); expect(bulkMessage(1, 1, 'Holiday')).toBe('Tagged 1 expense with #Holiday.')
    expect(bulkMessage(2, 2, null)).toBe('Removed the tag from 2 expenses.')
  })
  it('reports expenses that could not be changed', () => {
    const m = bulkMessage(5, 3, 'Kitchen'); expect(m).toContain('Tagged 3 expenses'); expect(m).toContain('2 expenses could not be changed')
    expect(bulkMessage(2, 1, null)).toContain('1 expense could not be changed')
  })
})

import { categoryExpenses, latest, monthKey, monthOffset, newestFirst, parseMonthKey, separateBillsIn, shiftMonth, sumCents } from './category'
describe('month keys', () => {
  it('formats and parses', () => {
    expect(monthKey(new Date(2026, 10, 5))).toBe('2026-11'); expect(monthKey(new Date(2026, 0, 31))).toBe('2026-01')
    expect(parseMonthKey('2026-11')?.getMonth()).toBe(10)
  })
  it('rejects things that are not months', () => {
    for (const bad of ['2026-13', '2026-00', '26-11', '2026-1', 'november', '', null, undefined, '2026-11-01']) expect(parseMonthKey(bad as string)).toBeNull()
  })
  it('counts months back from now, and refuses the future or the far past', () => {
    const now = new Date('2026-11-15T12:00:00')
    expect(monthOffset('2026-11', now)).toBe(0); expect(monthOffset('2026-10', now)).toBe(-1); expect(monthOffset('2025-11', now)).toBe(-12)
    expect(monthOffset('2026-12', now)).toBeNull(); expect(monthOffset('2020-01', now)).toBeNull(); expect(monthOffset('junk', now)).toBeNull()
  })
  it('shifts across year ends', () => { expect(shiftMonth('2026-01', -1)).toBe('2025-12'); expect(shiftMonth('2026-12', 1)).toBe('2027-01'); expect(shiftMonth('2026-05', -4)).toBe('2026-01') })
})
describe('category expenses', () => {
  const e = (id: string, cat: string, spent_on: string, o: Record<string, unknown> = {}) => ({ id, category_id: cat, spent_on, amount_cents: 100, created_at: `${spent_on}T10:00:00Z`, bill_id: null, monthly_fee: false, ...o })
  const all = [e('a', 'T', '2026-11-02'), e('b', 'T', '2026-11-10'), e('c', 'G', '2026-11-11'), e('d', 'T', '2026-11-10', { created_at: '2026-11-10T18:00:00Z' }),
    e('fee', 'T', '2026-11-05', { bill_id: 'x', monthly_fee: true }), e('yr', 'T', '2026-11-06', { bill_id: 'y', amount_cents: 60000 }), e('e', 'T', '2026-11-08'), e('f', 'T', '2026-11-01')]
  it('keeps the category, everyday spending and monthly fees, and drops yearly bills (the rule behind the Home number)', () => {
    const ids = categoryExpenses(all, 'T').map(x => x.id)
    expect(ids).toContain('fee')          // a monthly fee is everyday spending
    expect(ids).not.toContain('yr')       // a yearly bill payment is not
    expect(ids).not.toContain('c')        // another category is not
  })
  it('newest first, and same-day ones by when they were entered', () => {
    expect(categoryExpenses(all, 'T').map(x => x.id)).toEqual(['d', 'b', 'e', 'fee', 'a', 'f'])
  })
  it('the three latest', () => expect(latest(categoryExpenses(all, 'T')).map(x => x.id)).toEqual(['d', 'b', 'e']))
  it('fewer than three is fine, and none is empty', () => { expect(latest([all[2]]).length).toBe(1); expect(latest([])).toEqual([]) })
  it('does not depend on the order it is given', () => expect(latest([...all].reverse().filter(x => x.category_id === 'T' && !x.bill_id)).map(x => x.id)).toEqual(['d', 'b', 'e']))
  it('totals add up and match what Home counts', () => { expect(sumCents(categoryExpenses(all, 'T'))).toBe(600); expect(sumCents(categoryExpenses(all, 'G'))).toBe(100) })
  it('finds the yearly bills kept apart', () => { expect(separateBillsIn(all, 'T').map(x => x.id)).toEqual(['yr']); expect(separateBillsIn(all, 'G')).toEqual([]) })
  it('an unknown category has nothing', () => expect(categoryExpenses(all, 'nope')).toEqual([]))
  it('ordering helper is stable for missing created_at', () => expect(newestFirst({ spent_on: '2026-01-02' }, { spent_on: '2026-01-01' })).toBeLessThan(0))
})

import { FAMILY_NAME_MAX, NAME_MAX, RESET_SENT, inviteText, isRateLimit, nameProblem, passwordProblem, saveNameMessage, usernameMessage } from './profile'
describe('passwordProblem', () => {
  it('accepts a good password', () => expect(passwordProblem('correct horse', 'correct horse')).toBeNull())
  it('wants at least 8 characters', () => { expect(passwordProblem('short', 'short')).toContain('8'); expect(passwordProblem('1234567', '1234567')).not.toBeNull(); expect(passwordProblem('12345678', '12345678')).toBeNull() })
  it('refuses a password of only spaces', () => expect(passwordProblem('        ', '        ')).toContain('spaces'))
  it('wants both boxes to match', () => expect(passwordProblem('longenough1', 'longenough2')).toContain('do not match'))
  it('checks length before matching, so the first problem is the clearest', () => expect(passwordProblem('abc', 'xyz')).toContain('8'))
})
describe('nameProblem', () => {
  it('accepts sensible names, with spaces and accents', () => { expect(nameProblem('Mia')).toBeNull(); expect(nameProblem('  Nguyễn Thị Hà ')).toBeNull() })
  it('refuses empty and blank', () => { expect(nameProblem('')).toContain('type'); expect(nameProblem('   ')).toContain('type') })
  it('has a limit, measured after trimming', () => {
    expect(nameProblem('x'.repeat(NAME_MAX))).toBeNull(); expect(nameProblem('x'.repeat(NAME_MAX + 1))).toContain(String(NAME_MAX))
    expect(nameProblem(' ' + 'x'.repeat(NAME_MAX) + ' ')).toBeNull()
    expect(nameProblem('y'.repeat(FAMILY_NAME_MAX + 1), FAMILY_NAME_MAX, 'family name')).toContain('family name')
  })
})
describe('usernameMessage and saveNameMessage', () => {
  it('turns answers into plain words and never shows a code word', () => {
    expect(usernameMessage('ok')).toBeNull()
    for (const a of ['invalid', 'taken', 'weird', null, undefined]) { const m = usernameMessage(a); expect(m).toBeTruthy(); expect(m).not.toMatch(/^(invalid|taken)$/) }
    expect(saveNameMessage('ok')).toBeNull(); expect(saveNameMessage('invalid', 'family name')).toContain('family name'); expect(saveNameMessage(undefined)).toBeTruthy()
  })
})
describe('isRateLimit', () => {
  it('recognises a too-many-requests answer however it is worded', () => {
    expect(isRateLimit({ status: 429 })).toBe(true)
    expect(isRateLimit({ message: 'For security purposes, you can only request this after 59 seconds.' })).toBe(true)
    expect(isRateLimit({ message: 'Email rate limit exceeded' })).toBe(true)
  })
  it('does not mistake other errors for it', () => { expect(isRateLimit({ status: 500, message: 'boom' })).toBe(false); expect(isRateLimit(null)).toBe(false); expect(isRateLimit(undefined)).toBe(false) })
})
describe('reset wording and invitations', () => {
  it('the reset message never says whether the account exists', () => { expect(RESET_SENT).toMatch(/^If an account exists/); expect(RESET_SENT).not.toMatch(/not found|no account|unknown/i) })
  it('an invitation has the link, the steps and the right kind of code', () => {
    const t = inviteText({ familyName: 'The Smiths', who: 'kid', code: 'abc123def456', url: 'https://app.example' })
    expect(t).toContain('The Smiths'); expect(t).toContain('https://app.example'); expect(t).toContain('kid code: abc123def456'); expect(t).toContain('Join your family')
    expect(inviteText({ familyName: 'F', who: 'parent', code: 'c', url: 'u' })).toContain('parent code: c')
  })
})

import { badgeText, unseenAnswers } from './badges'
import { DEFAULT_BUDGETS, budgetsChanged, checklistSteps, progress, type Facts } from './checklist'
import { getLocal, removeLocal, setLocal } from './local'

describe('badgeText', () => {
  it('is empty for nothing, the number to 9, then 9+', () => {
    expect(badgeText(0)).toBe(''); expect(badgeText(-3)).toBe(''); expect(badgeText(1)).toBe('1'); expect(badgeText(9)).toBe('9'); expect(badgeText(10)).toBe('9+'); expect(badgeText(250)).toBe('9+')
  })
})
describe('unseenAnswers (what a child has not seen yet)', () => {
  const now = new Date('2026-11-24T12:00:00Z')
  const row = (status: string, daysAgo: number | null) => ({ status, decided_at: daysAgo === null ? null : new Date(now.getTime() - daysAgo * 86_400_000).toISOString() })
  it('counts yes and no answers, not requests still waiting', () => {
    expect(unseenAnswers([row('approved', 1), row('declined', 2), row('pending', 0), row('cancelled', 1)], null, now)).toBe(2)
  })
  it('only answers newer than the last visit', () => {
    const seen = new Date(now.getTime() - 36 * 3_600_000).toISOString() // 1.5 days ago
    expect(unseenAnswers([row('approved', 1), row('approved', 2), row('declined', 3)], seen, now)).toBe(1)
  })
  it('never reaches back more than two weeks, even with no recorded visit (a new device)', () => {
    expect(unseenAnswers([row('approved', 13), row('approved', 15), row('declined', 40)], null, now)).toBe(1)
  })
  it('an answer with no time cannot be counted, and a garbled visit time is ignored', () => {
    expect(unseenAnswers([row('approved', null)], null, now)).toBe(0)
    expect(unseenAnswers([row('approved', 1)], 'not a date', now)).toBe(1)
  })
  it('nothing in, nothing out', () => expect(unseenAnswers([], null, now)).toBe(0))
})

describe('getting-started checklist', () => {
  const base: Facts = { role: 'parent', expenses: 0, members: 1, children: 0, allowances: 0, bills: 0, budgetsChanged: false, budgetsConfirmed: false, standalone: false, jarsVisited: false }
  const ids = (f: Partial<Facts>) => checklistSteps({ ...base, ...f }).map(s => s.id)
  const done = (f: Partial<Facts>) => Object.fromEntries(checklistSteps({ ...base, ...f }).map(s => [s.id, s.done]))
  it('a brand-new family starts at nothing done', () => {
    expect(progress(checklistSteps(base))).toEqual({ done: 0, total: 3, complete: false })
    expect(ids({})).toEqual(['expense', 'budgets', 'invite', 'bill', 'install'])
  })
  it('the allowance step only exists once there is a child', () => {
    expect(ids({ children: 0 })).not.toContain('allowance'); expect(ids({ members: 2, children: 1 })).toContain('allowance')
  })
  it('each step turns done from the family\'s own data', () => {
    expect(done({ expenses: 1 }).expense).toBe(true); expect(done({ members: 2 }).invite).toBe(true); expect(done({ children: 1, allowances: 1 }).allowance).toBe(true)
    expect(done({ bills: 1 }).bill).toBe(true); expect(done({ standalone: true }).install).toBe(true)
  })
  it('budgets count as done if edited OR confirmed by a parent', () => {
    expect(done({}).budgets).toBe(false); expect(done({ budgetsChanged: true }).budgets).toBe(true); expect(done({ budgetsConfirmed: true }).budgets).toBe(true)
  })
  it('optional steps never hold the checklist open', () => {
    const f = { expenses: 3, members: 2, budgetsConfirmed: true }
    expect(progress(checklistSteps({ ...base, ...f }))).toEqual({ done: 3, total: 3, complete: true })
    expect(done(f).bill).toBe(false) // still not done, and not needed
  })
  it('with a child, finishing needs the allowance too', () => {
    const f = { expenses: 3, members: 2, budgetsConfirmed: true, children: 1 }
    expect(progress(checklistSteps({ ...base, ...f })).complete).toBe(false)
    expect(progress(checklistSteps({ ...base, ...f, allowances: 1 })).complete).toBe(true)
  })
  it('a child gets a short list of their own', () => {
    const kid = (f: Partial<Facts>) => checklistSteps({ ...base, role: 'child', ...f })
    expect(kid({}).map(s => s.id)).toEqual(['expense', 'jars', 'install'])
    expect(progress(kid({}))).toEqual({ done: 0, total: 2, complete: false })
    expect(progress(kid({ expenses: 1, jarsVisited: true })).complete).toBe(true)
  })
  it('every step says where to go or what to do', () => { for (const s of checklistSteps({ ...base, children: 1 })) expect(Boolean(s.to || s.action)).toBe(true) })
  it('knows when the starting budgets were changed', () => {
    const start = Object.entries(DEFAULT_BUDGETS).map(([name, budget_cents]) => ({ name, budget_cents }))
    expect(budgetsChanged(start)).toBe(false)
    expect(budgetsChanged(start.map(c => (c.name === 'Fun' ? { ...c, budget_cents: 9000 } : c)))).toBe(true)
    expect(budgetsChanged([...start, { name: 'Pets', budget_cents: 0 }])).toBe(true)
    expect(budgetsChanged(start.slice(1))).toBe(true)
    expect(budgetsChanged(start.map(c => (c.name === 'Kids' ? { ...c, archived: true } : c)))).toBe(true)
    expect(budgetsChanged(start.map(c => (c.name === 'Kids' ? { ...c, name: 'Children' } : c)))).toBe(true)
  })
})

describe('local storage helper', () => {
  it('stores and removes', () => {
    const mem: Record<string, string> = {}
    ;(globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v }, removeItem: (k: string) => { delete mem[k] } } }
    setLocal('a', '1'); expect(getLocal('a')).toBe('1'); removeLocal('a'); expect(getLocal('a')).toBeNull()
  })
  it('never throws when the browser refuses storage', () => {
    const boom = () => { throw new Error('blocked') }
    ;(globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: boom, setItem: boom, removeItem: boom } }
    expect(getLocal('a')).toBeNull(); expect(() => setLocal('a', '1')).not.toThrow(); expect(() => removeLocal('a')).not.toThrow()
  })
})

import { SOON_DAYS, UPCOMING_DAYS, comingUp, dueBillCount, dueText, nextUnpaid, urgency } from './bills'
describe('urgency and wording of a due date', () => {
  it('overdue below zero, soon up to 7 days, upcoming up to 30, then later (boundaries exact)', () => {
    const at = (d: number) => urgency(d)
    expect([at(-30), at(-1)]).toEqual(['overdue', 'overdue']); expect([at(0), at(1), at(SOON_DAYS)]).toEqual(['soon', 'soon', 'soon'])
    expect([at(SOON_DAYS + 1), at(UPCOMING_DAYS)]).toEqual(['upcoming', 'upcoming']); expect([at(UPCOMING_DAYS + 1), at(400)]).toEqual(['later', 'later'])
  })
  it('says it in plain words, singular and plural', () => {
    expect(dueText(0)).toBe('Due today'); expect(dueText(1)).toBe('Due tomorrow'); expect(dueText(3)).toBe('Due in 3 days'); expect(dueText(-1)).toBe('1 day overdue'); expect(dueText(-5)).toBe('5 days overdue')
  })
})
describe('coming up', () => {
  const today = new Date('2026-11-24T12:00:00')
  const bill = (id: string, due_month: number, due_day: number, o: Partial<Bill> = {}): Bill => ({ id, name: id, category_id: null, amount_cents: 1000, times_per_year: 1, due_month, due_day, archived: false, created_at: '2026-11-01T00:00:00Z', ...o })
  const all = [bill('Overdue', 11, 20), bill('Soon', 11, 27), bill('Upcoming', 12, 15), bill('Later', 3, 1), bill('Ended', 11, 25, { archived: true })]
  it('lists overdue, soon and upcoming bills, soonest first, and leaves out later and ended ones', () => {
    expect(comingUp(all, [], today).map(c => [c.bill.id, urgency(c.next.days)])).toEqual([['Overdue', 'overdue'], ['Soon', 'soon'], ['Upcoming', 'upcoming']])
  })
  it('a paid date drops out', () => {
    const paid: Payment = { id: 'p', bill_id: 'Soon', due_on: '2026-11-27', expense_id: 'e', expenses: { amount_cents: 1000, spent_on: '2026-11-26' } }
    expect(comingUp(all, [paid], today).map(c => c.bill.id)).toEqual(['Overdue', 'Upcoming'])
  })
  it('a bill unpaid for months shows once, with a count of the rest', () => {
    const monthly = bill('Monthly', 1, 5, { times_per_year: 12, created_at: '2025-01-01T00:00:00Z' })
    const rows = comingUp([monthly], [], today)
    expect(rows).toHaveLength(1); expect(rows[0].next.due).toBe('2026-01-05'); expect(rows[0].more).toBe(11) // Jan to Nov overdue, plus 5 Dec inside 30 days = 12 dates
  })
  it('the window can be changed', () => {
    expect(comingUp(all, [], today, 2).map(c => c.bill.id)).toEqual(['Overdue'])
    expect(comingUp(all, [], today, 5).map(c => c.bill.id)).toEqual(['Overdue', 'Soon'])
  })
  it('looks across the new year', () => {
    expect(comingUp([bill('NewYear', 1, 3)], [], new Date('2026-12-28T12:00:00')).map(c => c.next.due)).toEqual(['2027-01-03'])
  })
  it('nothing in, nothing out', () => { expect(comingUp([], [], today)).toEqual([]); expect(comingUp([bill('Later', 3, 1)], [], today)).toEqual([]) })
  it('finds each bill\'s next unpaid date, including far-off ones', () => {
    const n = nextUnpaid(all, [], today)
    expect(n.get('Overdue')?.due).toBe('2026-11-20'); expect(n.get('Later')?.due).toBe('2027-03-01'); expect(n.has('Ended')).toBe(false)
  })
  it('counts bills, not dates', () => {
    const dues = comingUp([bill('Monthly', 1, 5, { times_per_year: 12, created_at: '2025-01-01T00:00:00Z' }), ...all.slice(0, 2)], [], today)
    expect(dueBillCount(dues)).toBe(3)
    expect(dueBillCount([{ bill: all[0] }, { bill: all[0] }, { bill: all[1] }])).toBe(2)
  })
})

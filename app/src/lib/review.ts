import type { Category, Expense } from './types'

export type Change = { name: string; emoji: string; now: number; before: number; pct: number | null }
export type Review = {
  totalNow: number; totalBefore: number; totalPct: number | null
  less: Change[]; more: Change[]; underBudget: { name: string; emoji: string; left: number }[]
}

const iso = (d: Date) => d.toLocaleDateString('sv')
const MIN_CHANGE_CENTS = 500 // ignore changes smaller than 5 euro: noise, not news

/**
 * Month-to-date vs the same days of last month (so a half-finished month is not compared with a full one).
 * `expenses` must cover last month and this month.
 */
export function review(expenses: Expense[], cats: Category[], now = new Date()): Review {
  const day = now.getDate()
  const thisStart = iso(new Date(now.getFullYear(), now.getMonth(), 1))
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevLast = new Date(prevStart.getFullYear(), prevStart.getMonth() + 1, 0).getDate()
  const prevCut = iso(new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(day, prevLast)))
  const cur = expenses.filter(e => e.spent_on >= thisStart)
  const prev = expenses.filter(e => e.spent_on >= iso(prevStart) && e.spent_on <= prevCut)
  const sum = (xs: Expense[], id?: string) => xs.filter(e => id === undefined || e.category_id === id).reduce((s, e) => s + e.amount_cents, 0)
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)

  const changes: Change[] = cats.map(c => {
    const now_ = sum(cur, c.id), before = sum(prev, c.id)
    return { name: c.name, emoji: c.emoji, now: now_, before, pct: pct(now_, before) }
  }).filter(c => Math.abs(c.now - c.before) >= MIN_CHANGE_CENTS)

  const totalNow = sum(cur), totalBefore = sum(prev)
  return {
    totalNow, totalBefore, totalPct: pct(totalNow, totalBefore),
    less: changes.filter(c => c.now < c.before).sort((a, b) => (a.now - a.before) - (b.now - b.before)).slice(0, 3),
    more: changes.filter(c => c.now > c.before).sort((a, b) => (b.now - b.before) - (a.now - a.before)).slice(0, 3),
    underBudget: cats.filter(c => c.budget_cents > 0 && sum(cur, c.id) <= c.budget_cents * 0.8 && sum(cur, c.id) > 0)
      .map(c => ({ name: c.name, emoji: c.emoji, left: c.budget_cents - sum(cur, c.id) })),
  }
}

import type { Category } from './types'

export type SummaryRow = { month: number; category_id: string | null; is_bill: boolean; total_cents: number }
export type MonthBar = { month: number; everyday: number; bills: number; total: number }
export type CatTotal = { id: string | null; name: string; emoji: string; spent: number; budget: number }
export type YearModel = {
  months: MonthBar[]; total: number; everyday: number; bills: number
  topMonth: MonthBar | null; categories: CatTotal[]; monthlyBudget: number
}

/** Turns the database's (month x category x kind) rows into what the charts draw. */
export function yearModel(rows: SummaryRow[], cats: Category[]): YearModel {
  const months: MonthBar[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, everyday: 0, bills: 0, total: 0 }))
  const byCat = new Map<string | null, number>()
  for (const r of rows) {
    const m = months[r.month - 1]
    if (r.is_bill) m.bills += r.total_cents
    else { m.everyday += r.total_cents; byCat.set(r.category_id, (byCat.get(r.category_id) ?? 0) + r.total_cents) }
    m.total += r.total_cents
  }
  const categories: CatTotal[] = []
  for (const c of cats) {
    const spent = byCat.get(c.id) ?? 0
    if (spent > 0 || (!c.archived && c.budget_cents > 0)) categories.push({ id: c.id, name: c.name, emoji: c.emoji, spent, budget: c.budget_cents * 12 })
    byCat.delete(c.id)
  }
  const rest = [...byCat.values()].reduce((s, v) => s + v, 0)
  if (rest > 0) categories.push({ id: null, name: 'Uncategorised', emoji: '📦', spent: rest, budget: 0 })
  categories.sort((a, b) => b.spent - a.spent)
  const everyday = months.reduce((s, m) => s + m.everyday, 0), bills = months.reduce((s, m) => s + m.bills, 0)
  const top = months.reduce((a, b) => (b.total > a.total ? b : a), months[0])
  return {
    months, total: everyday + bills, everyday, bills, topMonth: top.total > 0 ? top : null, categories,
    monthlyBudget: cats.filter(c => !c.archived).reduce((s, c) => s + c.budget_cents, 0),
  }
}

/** A round axis maximum (1, 2, 2.5, 5 x 10^k) at or above `max`, and 4 evenly spaced ticks up to it. */
export function niceAxis(max: number, intervals = 4): { top: number; ticks: number[] } {
  if (max <= 0) return { top: intervals * 100, ticks: Array.from({ length: intervals + 1 }, (_, i) => i * 100) } // 0..4 euro
  const raw = max / intervals
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 3, 4, 5, 10].map(f => f * mag).find(s => s >= raw)!
  const top = step * intervals
  return { top, ticks: Array.from({ length: intervals + 1 }, (_, i) => i * step) }
}

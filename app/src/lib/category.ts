import { isSeparateBill } from './expense'
import type { Expense } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-11" for a date: the month used in addresses such as /review?category=…&month=2026-11. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

/** The first day of a "YYYY-MM" month, or null when the text is not a real month. */
export function parseMonthKey(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? '')
  if (!m) return null
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? new Date(Number(m[1]), month - 1, 1) : null
}

/** How many months before this one (0 = this month, -1 = last month). Null for a bad, future or too-old month. */
export function monthOffset(key: string | null | undefined, now = new Date(), maxBack = 24): number | null {
  const d = parseMonthKey(key)
  if (!d) return null
  const off = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth())
  return off <= 0 && off >= -maxBack ? off : null
}

/** The month key `delta` months from `key`. */
export function shiftMonth(key: string, delta: number): string {
  const d = parseMonthKey(key) ?? new Date()
  return monthKey(new Date(d.getFullYear(), d.getMonth() + delta, 1))
}

/** Newest first: by day, then by when it was entered. */
export function newestFirst(a: Pick<Expense, 'spent_on' | 'created_at'>, b: Pick<Expense, 'spent_on' | 'created_at'>): number {
  return b.spent_on.localeCompare(a.spent_on) || (b.created_at ?? '').localeCompare(a.created_at ?? '')
}

/**
 * The expenses Home counts for a category: everyday spending, monthly fees included, yearly bill payments left out.
 * This is the rule behind the number on the Home screen, so a category's detail view adds up to it.
 */
export const categoryExpenses = <T extends Pick<Expense, 'category_id' | 'bill_id' | 'monthly_fee' | 'spent_on' | 'created_at'>>(all: T[], categoryId: string): T[] =>
  all.filter(x => x.category_id === categoryId && !isSeparateBill(x)).sort(newestFirst)

/** The most recent few (default 3) for the hover preview. */
export const latest = <T extends Pick<Expense, 'spent_on' | 'created_at'>>(list: T[], n = 3): T[] => [...list].sort(newestFirst).slice(0, n)

export const sumCents = (list: Pick<Expense, 'amount_cents'>[]) => list.reduce((s, x) => s + x.amount_cents, 0)

/** Yearly and other non-monthly bill payments filed under a category (kept out of the numbers above). */
export const separateBillsIn = <T extends Pick<Expense, 'category_id' | 'bill_id' | 'monthly_fee'>>(all: T[], categoryId: string): T[] =>
  all.filter(x => x.category_id === categoryId && isSeparateBill(x))

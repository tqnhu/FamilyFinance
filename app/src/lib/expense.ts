import type { Expense } from './types'

/** What changed between the stored expense and the form, as an update payload (empty = nothing to save). */
export function changes(old: Expense, now: { cents: number; cat: string; note: string; date: string; tag?: string }) {
  const out: { amount_cents?: number; category_id?: string; note?: string; spent_on?: string; tag_id?: string | null } = {}
  if (now.cents !== old.amount_cents) out.amount_cents = now.cents
  if (now.cat && now.cat !== old.category_id) out.category_id = now.cat
  if (now.note !== old.note) out.note = now.note
  if (now.date !== old.spent_on) out.spent_on = now.date
  if (now.tag !== undefined && now.tag !== (old.tag_id ?? '')) out.tag_id = now.tag || null // '' = no tag
  return out
}

/**
 * A bill payment that is kept out of everyday spending and the monthly budgets: yearly, half-yearly and quarterly
 * bills. A monthly fee is ordinary spending in the month it was charged, so it is not "separate".
 */
export const isSeparateBill = (x: Pick<Expense, 'bill_id' | 'monthly_fee'>) => Boolean(x.bill_id) && !x.monthly_fee

/* ---------- Home list: tag filter and bulk tagging ---------- */

/** '' = everything, NO_TAG = expenses without a tag, otherwise a tag id. */
export const NO_TAG = '__none'

/**
 * What the list shows. With no filter: everyday spending (yearly bills are tracked on the Plan page).
 * With a tag chosen: every expense with that tag, bill payments included, so the list matches the tag's total.
 */
export function visibleExpenses<T extends Pick<Expense, 'bill_id' | 'monthly_fee' | 'tag_id'>>(all: T[], filter: string): T[] {
  if (filter === '') return all.filter(x => !isSeparateBill(x))
  if (filter === NO_TAG) return all.filter(x => !isSeparateBill(x) && !x.tag_id)
  return all.filter(x => x.tag_id === filter)
}

/** Tag ids that appear on at least one expense (so the filter only offers tags that would show something). */
export const usedTagIds = (all: Pick<Expense, 'tag_id'>[]): Set<string> => new Set(all.map(x => x.tag_id).filter((t): t is string => Boolean(t)))

/** Splits a long list into requests small enough for a URL (a request lists every id it touches). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** The sentence shown after a bulk change. `updated` can be lower than `asked`: bill payments and others' expenses are skipped. */
export function bulkMessage(asked: number, updated: number, tag: string | null): string {
  const what = (n: number) => `${n} ${n === 1 ? 'expense' : 'expenses'}`
  const done = tag ? `Tagged ${what(updated)} with #${tag}.` : `Removed the tag from ${what(updated)}.`
  const skipped = asked - updated
  return skipped > 0 ? `${done} ${what(skipped)} could not be changed (bill payments can only be changed on the Plan page).` : done
}

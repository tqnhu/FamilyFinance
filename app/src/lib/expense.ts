import type { Expense } from './types'

/** What changed between the stored expense and the form, as an update payload (empty = nothing to save). */
export function changes(old: Expense, now: { cents: number; cat: string; note: string; date: string; annual?: boolean }) {
  const out: { amount_cents?: number; category_id?: string; note?: string; spent_on?: string; annual_fee?: boolean } = {}
  if (now.cents !== old.amount_cents) out.amount_cents = now.cents
  if (now.cat && now.cat !== old.category_id) out.category_id = now.cat
  if (now.note !== old.note) out.note = now.note
  if (now.date !== old.spent_on) out.spent_on = now.date
  if (now.annual !== undefined && now.annual !== Boolean(old.annual_fee)) out.annual_fee = now.annual
  return out
}

/**
 * A bill payment that is kept out of everyday spending and the monthly budgets: yearly, half-yearly and quarterly
 * bills. A monthly fee is ordinary spending in the month it was charged, so it is not "separate".
 */
export const isBillPayment = (x: Pick<Expense, 'bill_id' | 'monthly_fee'>) => Boolean(x.bill_id) && !x.monthly_fee

/**
 * Everything kept out of everyday spending, the monthly total, the budgets and the category shares: yearly-type bill payments,
 * and expenses marked as an annual fee (for example a yearly membership that came in through a bank import).
 */
export const isSeparateBill = (x: Pick<Expense, 'bill_id' | 'monthly_fee' | 'annual_fee'>) => isBillPayment(x) || Boolean(x.annual_fee)

/* ---------- Home list: tag filter and bulk tagging ---------- */

/** '' = everything, NO_TAG = expenses without a tag, otherwise a tag id. */
export const NO_TAG = '__none'

/**
 * What the list shows. With no filter: everyday spending and annual fees (marked as such, so they can be found and corrected);
 * yearly bill payments are tracked on the Plan page.
 * With a tag chosen: every expense with that tag, bill payments included, so the list matches the tag's total.
 */
export function visibleExpenses<T extends Pick<Expense, 'bill_id' | 'monthly_fee' | 'tag_ids'>>(all: T[], filter: string): T[] {
  if (filter === '') return all.filter(x => !isBillPayment(x))
  if (filter === NO_TAG) return all.filter(x => !isBillPayment(x) && !x.tag_ids?.length)
  return all.filter(x => x.tag_ids?.includes(filter))
}

/** Tag ids that appear on at least one expense (so the filter only offers tags that would show something). */
export const usedTagIds = (all: Pick<Expense, 'tag_ids'>[]): Set<string> => new Set(all.flatMap(x => x.tag_ids ?? []))

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
  const done = tag ? `Tagged ${what(updated)} with #${tag}.` : `Removed the tags from ${what(updated)}.`
  const skipped = asked - updated
  return skipped > 0 ? `${done} ${what(skipped)} could not be changed (bill payments can only be changed on the Plan page).` : done
}

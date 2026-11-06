import type { Expense } from './types'

/** What changed between the stored expense and the form, as an update payload (empty = nothing to save). */
export function changes(old: Expense, now: { cents: number; cat: string; note: string; date: string }) {
  const out: { amount_cents?: number; category_id?: string; note?: string; spent_on?: string } = {}
  if (now.cents !== old.amount_cents) out.amount_cents = now.cents
  if (now.cat && now.cat !== old.category_id) out.category_id = now.cat
  if (now.note !== old.note) out.note = now.note
  if (now.date !== old.spent_on) out.spent_on = now.date
  return out
}

/**
 * A bill payment that is kept out of everyday spending and the monthly budgets: yearly, half-yearly and quarterly
 * bills. A monthly fee is ordinary spending in the month it was charged, so it is not "separate".
 */
export const isSeparateBill = (x: Pick<Expense, 'bill_id' | 'monthly_fee'>) => Boolean(x.bill_id) && !x.monthly_fee

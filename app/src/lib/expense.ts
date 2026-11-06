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

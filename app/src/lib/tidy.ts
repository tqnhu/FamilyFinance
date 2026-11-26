import { classify, type History, type Rule } from './classify'
import type { Category, Expense } from './types'

/** Tidy up Other: past expenses filed under Other that the rules, history or starter list can now place. */

type Source = Pick<Expense, 'id' | 'note' | 'amount_cents' | 'spent_on' | 'category_id' | 'tag_id' | 'annual_fee'>

export type Candidate = {
  id: string; note: string; amount_cents: number; spent_on: string
  categoryId: string; confidence: 'high' | 'medium'; source: 'rule' | 'history' | 'keyword'; why: string
  tagId: string | null        // set only when a rule names a tag and the expense has none
  annualFee: boolean          // set only when a rule says annual fee and the expense is not one yet
  prev: { category_id: string | null; tag_id: string | null; annual_fee: boolean }
}

/**
 * `other` is the Other category: it is never suggested, and what the family filed there teaches nothing.
 * Returns the expenses that have a suggestion, newest first, and how many have none.
 */
export function tidyCandidates(expenses: Source[], cats: Category[], other: string, history: History, rules: Rule[]): { rows: Candidate[]; none: number } {
  const usable = cats.filter(c => c.id !== other)
  const usableRules = rules.filter(r => r.category_id !== other)
  const rows: Candidate[] = []
  let none = 0
  for (const e of expenses) {
    if (e.category_id !== other) continue
    const s = e.note ? classify(e.note, history, usable, { rules: usableRules, cents: e.amount_cents }) : null
    if (!s) { none++; continue }
    rows.push({
      id: e.id, note: e.note, amount_cents: e.amount_cents, spent_on: e.spent_on,
      categoryId: s.categoryId, confidence: s.confidence, source: s.source, why: s.why,
      tagId: s.tagId && !e.tag_id ? s.tagId : null,
      annualFee: Boolean(s.annualFee) && !e.annual_fee,
      prev: { category_id: e.category_id, tag_id: e.tag_id ?? null, annual_fee: Boolean(e.annual_fee) },
    })
  }
  rows.sort((a, b) => b.spent_on.localeCompare(a.spent_on))
  return { rows, none }
}

export type Batch = { patch: { category_id: string | null; tag_id?: string | null; annual_fee?: boolean }; ids: string[] }

const group = (rows: Candidate[], patchOf: (r: Candidate) => Batch['patch']): Batch[] => {
  const by = new Map<string, Batch>()
  for (const r of rows) {
    const patch = patchOf(r), key = JSON.stringify(patch)
    const b = by.get(key) ?? { patch, ids: [] }
    b.ids.push(r.id); by.set(key, b)
  }
  return [...by.values()]
}

/** The updates that move the chosen expenses: one per distinct change, so a request touches many rows at once. */
export const applyBatches = (rows: Candidate[]): Batch[] => group(rows, r => ({
  category_id: r.categoryId, ...(r.tagId ? { tag_id: r.tagId } : {}), ...(r.annualFee ? { annual_fee: true } : {}),
}))

/** The updates that put them back exactly as they were. */
export const undoBatches = (rows: Candidate[]): Batch[] => group(rows, r => ({
  category_id: r.prev.category_id, ...(r.tagId ? { tag_id: r.prev.tag_id } : {}), ...(r.annualFee ? { annual_fee: r.prev.annual_fee } : {}),
}))

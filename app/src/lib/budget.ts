import { euroTidy } from './money'

export type BudgetHint = { pct: number; state: 'ok' | 'near' | 'over'; text: string }

/**
 * What a category's budget says about what was spent in it. null when the category has no budget.
 * "near" starts at 80% (the same line the old month review used). `finished` words it for a month that is over.
 */
export function budgetHint(spent: number, budget: number, finished: boolean): BudgetHint | null {
  if (!(budget > 0)) return null
  const pct = Math.min(100, Math.round((spent / budget) * 100))
  const b = euroTidy(budget)
  if (spent > budget) return { pct, state: 'over', text: finished ? `Ended ${euroTidy(spent - budget)} over its ${b} budget` : `${euroTidy(spent - budget)} over its ${b} budget` }
  const left = euroTidy(budget - spent)
  const near = spent >= budget * 0.8
  return {
    pct, state: near ? 'near' : 'ok',
    text: finished ? `Ended ${left} under its ${b} budget` : near ? `${left} left of ${b}, nearly used` : `${left} left of ${b}`,
  }
}

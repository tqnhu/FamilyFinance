export type Member = { user_id: string; family_id: string; display_name: string; role: 'parent' | 'child'; username: string | null }
export type Category = { id: string; name: string; emoji: string; budget_cents: number }
export type Expense = {
  id: string; member_id: string; category_id: string | null
  amount_cents: number; note: string; spent_on: string
}

export type Jar = 'spend' | 'save' | 'give'
export type JarEntry = { id: string; child_id: string; jar: Jar; amount_cents: number; kind: string; note: string; created_at: string }
export type PurchaseRequest = {
  id: string; child_id: string; jar: 'spend' | 'give'; item: string; amount_cents: number
  status: 'pending' | 'approved' | 'declined' | 'cancelled'; decision_note: string; created_at: string
}
export type Allowance = {
  child_id: string; weekly_cents: number; spend_pct: number; save_pct: number; give_pct: number
  match_pct: number; next_pay_on: string
}

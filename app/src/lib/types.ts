export type Member = { user_id: string; family_id: string; display_name: string; role: 'parent' | 'child' }
export type Category = { id: string; name: string; emoji: string; budget_cents: number }
export type Expense = {
  id: string; member_id: string; category_id: string | null
  amount_cents: number; note: string; spent_on: string
}

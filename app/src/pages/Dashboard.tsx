import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { euro, monthStart, nextMonthStart } from '../lib/money'
import { isoDate } from '../lib/bills'
import { isSeparateBill } from '../lib/expense'
import type { Category, Expense, Member } from '../lib/types'
import AddExpense from './AddExpense'
import DueSoon from '../components/DueSoon'
import ExpenseList from '../components/ExpenseList'

export default function Dashboard() {
  const { member } = useAuth()
  const [cats, setCats] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [people, setPeople] = useState<Member[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [offset, setOffset] = useState(0) // 0 = this month, -1 = last month, ... (so older mistakes can be fixed too)
  const isParent = member?.role === 'parent'
  const viewed = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1)
  const isCurrent = offset === 0

  const load = useCallback(async () => {
    const [c, e, m] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('expenses').select('*').gte('spent_on', monthStart(viewed)).lt('spent_on', nextMonthStart(viewed))
        .order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('members').select('*'),
    ])
    setCats(c.data ?? []); setExpenses(e.data ?? []); setPeople(m.data ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset])
  useEffect(() => { void load() }, [load])

  // Monthly fees count like any other spending. Yearly, half-yearly and quarterly bills are tracked on the Plan page instead.
  const everyday = expenses.filter(x => !isSeparateBill(x))
  const billsPaid = expenses.filter(isSeparateBill).reduce((s, x) => s + x.amount_cents, 0)
  const total = everyday.reduce((s, x) => s + x.amount_cents, 0)
  const budget = cats.filter(c => !c.archived).reduce((s, c) => s + c.budget_cents, 0)
  const spentBy = (id: string | null) => everyday.filter(x => x.category_id === id).reduce((s, x) => s + x.amount_cents, 0)
  const now = new Date()
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
  const nameOf = (id: string) => people.find(p => p.user_id === id)?.display_name ?? '?'

  const canEdit = (x: Expense) => isParent || x.member_id === member?.user_id
  // the edit sheet must offer the expense's current category even if it has since been archived
  const editCats = (x: Expense) => cats.filter(c => !c.archived || c.id === x.category_id)
  const monthLabel = viewed.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
  const lastDayOfViewed = isoDate(new Date(viewed.getFullYear(), viewed.getMonth() + 1, 0))

  return (
    <>
      <div className="stepper">
        <button aria-label="Previous month" onClick={() => setOffset(offset - 1)} disabled={offset <= -24}>‹</button>
        <strong>{isCurrent ? 'This month' : monthLabel}</strong>
        <button aria-label="Next month" onClick={() => setOffset(offset + 1)} disabled={isCurrent}>›</button>
      </div>

      <section className="card">
        <p className="muted">{isParent ? 'Family spending' : 'Your spending'} {isCurrent ? 'this month' : `in ${monthLabel}`}</p>
        <div className="big">{euro(total)}</div>
        {isParent && budget > 0 && <Bar spent={total} budget={budget} label={`of ${euro(budget)} budget${isCurrent ? ` · ${daysLeft} days left` : ''}`} />}
        {billsPaid > 0 && <p className="muted small">Not counted: {euro(billsPaid)} of yearly and other non-monthly bills paid {isCurrent ? 'this month' : 'that month'}.</p>}
      </section>

      {isParent && isCurrent && <DueSoon />}

      <section className="card">
        <h2>By category</h2>
        {cats.map(c => {
          const s = spentBy(c.id)
          if (!s && (!c.budget_cents || c.archived)) return null
          return (
            <div key={c.id} className="cat">
              <div className="row"><span>{c.emoji} {c.name}</span><span>{euro(s)}{c.budget_cents > 0 && <span className="muted"> / {euro(c.budget_cents)}</span>}</span></div>
              {c.budget_cents > 0 && isParent && <Bar spent={s} budget={c.budget_cents} />}
            </div>
          )
        })}
        {!everyday.length && <p className="muted">No expenses {isCurrent ? 'yet this month' : 'in this month'}.</p>}
      </section>

      <ExpenseList expenses={expenses} cats={cats} title={isCurrent ? 'Recent' : 'Expenses'} nameOf={nameOf} canEdit={canEdit}
        onEdit={setEditing} onChanged={() => void load()} />

      <button className="fab" aria-label="Add expense" onClick={() => setAdding(true)}>+</button>
      {adding && <AddExpense cats={cats.filter(c => !c.archived)} defaultDate={isCurrent ? undefined : lastDayOfViewed} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load() }} />}
      {editing && <AddExpense expense={editing} cats={editCats(editing)} nameOf={nameOf} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />}
    </>
  )
}

function Bar({ spent, budget, label }: { spent: number; budget: number; label?: string }) {
  const pct = Math.min(100, Math.round((spent / budget) * 100))
  const state = spent > budget ? 'over' : spent >= budget * 0.8 ? 'warn' : 'ok'
  return (
    <div>
      <div className="bar"><div className={`fill ${state}`} style={{ width: `${pct}%` }} /></div>
      {label && <div className="muted small">{label}</div>}
      {state === 'over' && <div className="small error">Over budget by {euro(spent - budget)}</div>}
    </div>
  )
}

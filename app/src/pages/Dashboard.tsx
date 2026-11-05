import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { euro, monthStart, nextMonthStart } from '../lib/money'
import type { Category, Expense, Member } from '../lib/types'
import AddExpense from './AddExpense'
import DueSoon from '../components/DueSoon'

export default function Dashboard() {
  const { member } = useAuth()
  const [cats, setCats] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [people, setPeople] = useState<Member[]>([])
  const [adding, setAdding] = useState(false)
  const isParent = member?.role === 'parent'

  const load = useCallback(async () => {
    const [c, e, m] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('expenses').select('*').gte('spent_on', monthStart()).lt('spent_on', nextMonthStart())
        .order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('members').select('*'),
    ])
    setCats(c.data ?? []); setExpenses(e.data ?? []); setPeople(m.data ?? [])
  }, [])
  useEffect(() => { void load() }, [load])

  const everyday = expenses.filter(x => !x.bill_id) // yearly bill payments are tracked on the Plan page, not against budgets
  const billsPaid = expenses.filter(x => x.bill_id).reduce((s, x) => s + x.amount_cents, 0)
  const total = everyday.reduce((s, x) => s + x.amount_cents, 0)
  const budget = cats.filter(c => !c.archived).reduce((s, c) => s + c.budget_cents, 0)
  const spentBy = (id: string | null) => everyday.filter(x => x.category_id === id).reduce((s, x) => s + x.amount_cents, 0)
  const now = new Date()
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
  const catOf = (id: string | null) => cats.find(c => c.id === id)
  const nameOf = (id: string) => people.find(p => p.user_id === id)?.display_name ?? '?'

  async function remove(id: string) {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    void load()
  }

  return (
    <>
      <section className="card">
        <p className="muted">{isParent ? 'Family spending' : 'Your spending'} this month</p>
        <div className="big">{euro(total)}</div>
        {isParent && budget > 0 && <Bar spent={total} budget={budget} label={`of ${euro(budget)} budget · ${daysLeft} days left`} />}
        {billsPaid > 0 && <p className="muted small">Not counted: {euro(billsPaid)} of yearly bills paid this month.</p>}
      </section>

      {isParent && <DueSoon />}

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
        {!everyday.length && <p className="muted">No expenses yet this month.</p>}
      </section>

      <section className="card">
        <h2>Recent</h2>
        {everyday.slice(0, 30).map(x => (
          <div key={x.id} className="row item">
            <div>
              <div>{catOf(x.category_id)?.emoji ?? '📦'} {x.note || catOf(x.category_id)?.name || 'Expense'}</div>
              <div className="muted small">{x.spent_on} · {nameOf(x.member_id)}</div>
            </div>
            <div className="right">
              <strong>{euro(x.amount_cents)}</strong>
              {(isParent || x.member_id === member?.user_id) && <button className="link small" onClick={() => remove(x.id)}>delete</button>}
            </div>
          </div>
        ))}
      </section>

      <button className="fab" aria-label="Add expense" onClick={() => setAdding(true)}>+</button>
      {adding && <AddExpense cats={cats.filter(c => !c.archived)} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load() }} />}
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

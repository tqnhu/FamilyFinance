import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { euro, monthStart, nextMonthStart } from '../lib/money'
import { isoDate } from '../lib/bills'
import type { Category, Expense, Member } from '../lib/types'
import AddExpense from './AddExpense'
import DueSoon from '../components/DueSoon'

export default function Dashboard() {
  const { member } = useAuth()
  const [cats, setCats] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [people, setPeople] = useState<Member[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [showAll, setShowAll] = useState(false)
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

  const everyday = expenses.filter(x => !x.bill_id) // yearly bill payments are tracked on the Plan page, not against budgets
  const billsPaid = expenses.filter(x => x.bill_id).reduce((s, x) => s + x.amount_cents, 0)
  const total = everyday.reduce((s, x) => s + x.amount_cents, 0)
  const budget = cats.filter(c => !c.archived).reduce((s, c) => s + c.budget_cents, 0)
  const spentBy = (id: string | null) => everyday.filter(x => x.category_id === id).reduce((s, x) => s + x.amount_cents, 0)
  const now = new Date()
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
  const catOf = (id: string | null) => cats.find(c => c.id === id)
  const nameOf = (id: string) => people.find(p => p.user_id === id)?.display_name ?? '?'

  const canEdit = (x: Expense) => isParent || x.member_id === member?.user_id
  // the edit sheet must offer the expense's current category even if it has since been archived
  const editCats = (x: Expense) => cats.filter(c => !c.archived || c.id === x.category_id)
  const monthLabel = viewed.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
  const lastDayOfViewed = isoDate(new Date(viewed.getFullYear(), viewed.getMonth() + 1, 0))

  return (
    <>
      <div className="stepper">
        <button aria-label="Previous month" onClick={() => { setOffset(offset - 1); setShowAll(false) }} disabled={offset <= -24}>‹</button>
        <strong>{isCurrent ? 'This month' : monthLabel}</strong>
        <button aria-label="Next month" onClick={() => { setOffset(offset + 1); setShowAll(false) }} disabled={isCurrent}>›</button>
      </div>

      <section className="card">
        <p className="muted">{isParent ? 'Family spending' : 'Your spending'} {isCurrent ? 'this month' : `in ${monthLabel}`}</p>
        <div className="big">{euro(total)}</div>
        {isParent && budget > 0 && <Bar spent={total} budget={budget} label={`of ${euro(budget)} budget${isCurrent ? ` · ${daysLeft} days left` : ''}`} />}
        {billsPaid > 0 && <p className="muted small">Not counted: {euro(billsPaid)} of yearly bills paid {isCurrent ? 'this month' : 'that month'}.</p>}
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

      <section className="card">
        <h2>{isCurrent ? 'Recent' : 'Expenses'}</h2>
        {everyday.length > 0 && <p className="muted small">Tap an expense to fix a mistake.</p>}
        {(showAll ? everyday : everyday.slice(0, 30)).map(x => {
          const open = canEdit(x) ? () => setEditing(x) : undefined
          return (
            <div key={x.id} className={`row item ${open ? 'tappable' : ''}`} role={open ? 'button' : undefined} tabIndex={open ? 0 : undefined}
              aria-label={open ? `Edit ${x.note || catOf(x.category_id)?.name || 'expense'}, ${euro(x.amount_cents)}${x.receipt_path ? ', has a receipt photo' : ''}` : undefined}
              onClick={open} onKeyDown={e => { if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open() } }}>
              <div>
                <div>{catOf(x.category_id)?.emoji ?? '📦'} {x.note || catOf(x.category_id)?.name || 'Expense'}{x.receipt_path && <span title="Has a receipt photo" aria-hidden> 📎</span>}</div>
                <div className="muted small">{x.spent_on} · {nameOf(x.member_id)}{x.edited_at && <span className="tag">edited{x.edited_by ? ` by ${nameOf(x.edited_by)}` : ''}</span>}</div>
              </div>
              <div className="right"><strong>{euro(x.amount_cents)}</strong>{open && <span className="muted small"> ✎</span>}</div>
            </div>
          )
        })}
        {!showAll && everyday.length > 30 && <button className="link" onClick={() => setShowAll(true)}>Show all {everyday.length}</button>}
      </section>

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

import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { WITH_TAGS, withTags } from '../lib/expenseTags'
import { useAuth } from '../auth'
import { euro, euroTidy, monthStart, nextMonthStart } from '../lib/money'
import { isoDate } from '../lib/bills'
import { isSeparateBill } from '../lib/expense'
import type { Category, Expense, Member } from '../lib/types'
import AddExpense from './AddExpense'
import DueSoon from '../components/DueSoon'
import ExpenseList from '../components/ExpenseList'
import Bar from '../components/Bar'
import GettingStarted from '../components/GettingStarted'
import { categoryExpenses, latest, monthKey, monthOffset } from '../lib/category'

export default function Dashboard() {
  const { member } = useAuth()
  const [cats, setCats] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [people, setPeople] = useState<Member[]>([])
  const [adding, setAdding] = useState(false)
  const [version, setVersion] = useState(0) // bumped after each load so the checklist re-checks what is done
  const [editing, setEditing] = useState<Expense | null>(null)
  const [params] = useSearchParams()
  // 0 = this month, -1 = last month, ... (so older mistakes can be fixed too). A ?month=YYYY-MM in the address opens that month (the back link of a category page uses it).
  const [offset, setOffset] = useState(() => monthOffset(params.get('month')) ?? 0)
  const isParent = member?.role === 'parent'
  const viewed = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1)
  const isCurrent = offset === 0

  const load = useCallback(async () => {
    const [c, e, m] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('expenses').select(WITH_TAGS).gte('spent_on', monthStart(viewed)).lt('spent_on', nextMonthStart(viewed))
        .order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('members').select('*'),
    ])
    setCats(c.data ?? []); setExpenses(withTags(e.data) as unknown as Expense[]); setPeople(m.data ?? []); setVersion(v => v + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset])
  useEffect(() => { void load() }, [load])

  // Monthly fees count like any other spending. Yearly, half-yearly and quarterly bills are tracked on the Plan page instead, and expenses marked as annual fees are kept apart too.
  const everyday = expenses.filter(x => !isSeparateBill(x))
  const billsPaid = expenses.filter(isSeparateBill).reduce((s, x) => s + x.amount_cents, 0)
  const total = everyday.reduce((s, x) => s + x.amount_cents, 0)
  const budget = cats.filter(c => !c.archived).reduce((s, c) => s + c.budget_cents, 0)
  const spentBy = (id: string | null) => everyday.filter(x => x.category_id === id).reduce((s, x) => s + x.amount_cents, 0)
  const now = new Date()
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1 // today counts
  const left = budget - total
  // the category tiles: the tightest first (over budget, then the closest to its limit), then categories without a budget by what was spent
  const tiles = cats.map(c => ({ c, s: spentBy(c.id) })).filter(({ c, s }) => s || (c.budget_cents && !c.archived))
    .sort((a, b) => {
      const ra = isParent && a.c.budget_cents > 0 ? a.s / a.c.budget_cents : -1, rb = isParent && b.c.budget_cents > 0 ? b.s / b.c.budget_cents : -1
      return rb - ra || b.s - a.s
    })
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

      {isCurrent && <GettingStarted onAddExpense={() => setAdding(true)} version={version} />}

      {isParent && budget > 0 ? (
        <section className="card leftcard">
          <p className="muted">{isCurrent ? 'Left to spend this month' : `Left of the budget in ${monthLabel}`}</p>
          <div className="big">{left >= 0 ? euroTidy(left) : `${euroTidy(-left)} over`}</div>
          <Bar spent={total} budget={budget}
            label={`${euroTidy(total)} spent of ${euroTidy(budget)}${isCurrent ? ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left${left > 0 ? ` · about ${euroTidy(Math.floor(left / daysLeft))} a day` : ''}` : ''}`} />
          {billsPaid > 0 && <p className="muted small">Not counted: {euro(billsPaid)} of yearly bills and annual fees {isCurrent ? 'this month' : 'that month'}.</p>}
        </section>
      ) : (
        <section className="card">
          <p className="muted">{isParent ? 'Family spending' : 'Your spending'} {isCurrent ? 'this month' : `in ${monthLabel}`}</p>
          <div className="big">{euro(total)}</div>
          {billsPaid > 0 && <p className="muted small">Not counted: {euro(billsPaid)} of yearly bills and annual fees {isCurrent ? 'this month' : 'that month'}.</p>}
        </section>
      )}

      {isParent && isCurrent && <DueSoon />}

      <section>
        <h2>By category</h2>
        {tiles.length > 0 && <p className="muted small">{isParent ? 'Tightest first. ' : ''}Tap one to see its details.</p>}
        <div className="tiles">
          {tiles.map(({ c, s: spent }) => {
            const mine = categoryExpenses(expenses, c.id) // the same expenses the amount adds up
            const top = latest(mine, 3)
            const budgeted = isParent && c.budget_cents > 0
            const over = budgeted && spent > c.budget_cents
            return (
              <Link key={c.id} className="cat catlink tile" to={`/review?category=${c.id}&month=${monthKey(viewed)}`}
                aria-label={`${c.name}: ${euro(spent)}${budgeted ? `, ${over ? `${euro(spent - c.budget_cents)} over budget` : `${euro(c.budget_cents - spent)} left`}` : ''}. Open this category`} aria-describedby={`pop-${c.id}`}>
                <span className="tile-name">{c.emoji} {c.name}</span>
                <span className={`tile-left ${over ? 'over' : ''}`}>{budgeted ? (over ? `${euroTidy(spent - c.budget_cents)} over` : `${euroTidy(c.budget_cents - spent)} left`) : euroTidy(spent)}</span>
                {budgeted && <Bar spent={spent} budget={c.budget_cents} compact />}
                <span className="muted small">{budgeted ? `${euroTidy(spent)} of ${euroTidy(c.budget_cents)}` : isParent ? 'No budget' : 'spent'}</span>
                <span className="cat-pop" role="tooltip" id={`pop-${c.id}`}>
                  <span className="pop-head">{c.emoji} {c.name} · {isCurrent ? 'this month' : monthLabel}</span>
                  {top.length === 0 && <span className="muted small">No expenses yet.</span>}
                  {top.map(x => (
                    <span key={x.id} className="pop-row">
                      <span className="pop-date">{new Date(x.spent_on + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}</span>
                      <span className="pop-note">{x.note || c.name}{isParent && <span className="muted"> · {nameOf(x.member_id)}</span>}</span>
                      <strong>{euro(x.amount_cents)}</strong>
                    </span>
                  ))}
                  <span className="muted small pop-foot">{mine.length > 3 ? `+${mine.length - 3} more · ` : ''}Click to see all</span>
                </span>
              </Link>
            )
          })}
        </div>
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

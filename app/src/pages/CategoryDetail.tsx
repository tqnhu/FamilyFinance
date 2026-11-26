import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { euro, monthStart, nextMonthStart } from '../lib/money'
import { categoryExpenses, monthKey, monthOffset, parseMonthKey, separateBillsIn, shiftMonth, sumCents } from '../lib/category'
import { isSeparateBill } from '../lib/expense'
import type { Category, Expense, Member } from '../lib/types'
import AddExpense from './AddExpense'
import Bar from '../components/Bar'
import ExpenseList from '../components/ExpenseList'

/** Every expense in one category for one month, opened from a category on Home. */
export default function CategoryDetail({ categoryId }: { categoryId: string }) {
  const { member } = useAuth()
  const [params, setParams] = useSearchParams()
  const isParent = member?.role === 'parent'
  const fromAddress = params.get('month')
  const key = monthOffset(fromAddress) !== null ? fromAddress! : monthKey(new Date())
  const viewed = parseMonthKey(key)!
  const prevStart = new Date(viewed.getFullYear(), viewed.getMonth() - 1, 1)

  const [cats, setCats] = useState<Category[]>([])
  const [both, setBoth] = useState<Expense[]>([]) // this month and the one before, for the comparison
  const [people, setPeople] = useState<Member[]>([])
  const [editing, setEditing] = useState<Expense | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [c, e, m] = await Promise.all([
      supabase.from('categories').select('*'),
      supabase.from('expenses').select('*').gte('spent_on', monthStart(prevStart)).lt('spent_on', nextMonthStart(viewed))
        .order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('members').select('*'),
    ])
    if (c.error || e.error) setError((c.error ?? e.error)!.message)
    setCats((c.data ?? []) as Category[]); setBoth((e.data ?? []) as Expense[]); setPeople((m.data ?? []) as Member[]); setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => { void load() }, [load])

  const cat = cats.find(c => c.id === categoryId)
  const monthLabel = viewed.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
  const back = (
    <div className="row">
      <Link to={`/?month=${key}`}>← Back to Home</Link>
      {isParent && <Link to="/review">Month review</Link>}
    </div>
  )
  if (error) return <>{back}<p className="error">Could not load this category: {error}</p></>
  if (!loaded) return <>{back}<p className="muted center-text">Loading…</p></>
  if (!cat) return <>{back}<section className="card"><h2>Category not found</h2><p className="muted">It may have been removed. Go back to Home to pick another.</p></section></>

  const startThis = monthStart(viewed), endThis = nextMonthStart(viewed)
  const thisMonth = both.filter(x => x.spent_on >= startThis && x.spent_on < endThis)
  const lastMonth = both.filter(x => x.spent_on < startThis)
  const mine = categoryExpenses(thisMonth, categoryId)
  const total = sumCents(mine)
  const monthTotal = sumCents(thisMonth.filter(x => !isSeparateBill(x)))
  const before = sumCents(categoryExpenses(lastMonth, categoryId))
  const yearlyBills = sumCents(separateBillsIn(thisMonth, categoryId))
  const nameOf = (id: string) => people.find(p => p.user_id === id)?.display_name ?? '?'
  const canEdit = (x: Expense) => isParent || x.member_id === member?.user_id
  const go = (delta: number) => setParams({ category: categoryId, month: shiftMonth(key, delta) }, { replace: true })
  const isCurrent = monthOffset(key) === 0
  const diff = total - before

  return (
    <>
      {back}
      <div className="stepper">
        <button aria-label="Previous month" onClick={() => go(-1)} disabled={monthOffset(shiftMonth(key, -1)) === null /* too far back */}>‹</button>
        <strong>{monthLabel}</strong>
        <button aria-label="Next month" onClick={() => go(1)} disabled={isCurrent}>›</button>
      </div>

      <section className="card">
        <h2>{cat.emoji} {cat.name}{cat.archived ? ' (archived)' : ''}</h2>
        <div className="big">{euro(total)}</div>
        <p className="muted small">
          {mine.length} {mine.length === 1 ? 'expense' : 'expenses'}
          {monthTotal > 0 && total > 0 ? ` · ${Math.round((total / monthTotal) * 100)}% of ${isParent ? "the family's" : 'your'} spending this month` : ''}
        </p>
        {isParent && cat.budget_cents > 0 && <Bar spent={total} budget={cat.budget_cents} label={`of ${euro(cat.budget_cents)} budget`} />}
        <p className="muted small">
          {before > 0
            ? `Last month: ${euro(before)} (${diff === 0 ? 'the same' : diff > 0 ? `${euro(diff)} more` : `${euro(-diff)} less`})`
            : total > 0 ? 'Nothing in this category last month.' : ''}
        </p>
        {yearlyBills > 0 && <p className="muted small">Not counted: {euro(yearlyBills)} of yearly bills and annual fees in this category. Bills are on the Plan page; annual fees are in the list below.</p>}
      </section>

      <ExpenseList expenses={thisMonth.filter(x => x.category_id === categoryId)} cats={cats} title="Expenses" nameOf={nameOf} canEdit={canEdit}
        onEdit={setEditing} onChanged={() => void load()} />

      {editing && (
        <AddExpense expense={editing} cats={cats.filter(c => !c.archived || c.id === editing.category_id)} nameOf={nameOf}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />
      )}
    </>
  )
}

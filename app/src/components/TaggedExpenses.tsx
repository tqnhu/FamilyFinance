import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchByTags } from '../lib/expenseTags'
import { euro } from '../lib/money'
import { isBillPayment } from '../lib/expense'
import { splitChoice } from '../lib/tagfilter'
import type { Category, Expense, Member } from '../lib/types'
import AddExpense from '../pages/AddExpense'

const LIMIT = 300
const SHOWN = 5

/** The expenses behind a tag filter, newest first, tappable to correct (like Home). Yearly bill payments are left out, as on Home. */
export default function TaggedExpenses({ from, to, choice, title, cats, version, onChanged }: {
  from: string; to: string; choice: string[]; title: string; cats: Category[]; version: number; onChanged: () => void
}) {
  const [items, setItems] = useState<Expense[] | null>(null)
  const [people, setPeople] = useState<Member[]>([])
  const [all, setAll] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [error, setError] = useState('')
  const key = choice.join(',')

  const load = useCallback(async () => {
    const { ids, untagged } = splitChoice(choice)
    const [e, m] = await Promise.all([fetchByTags(from, to, ids, untagged, LIMIT), supabase.from('members').select('*')])
    if (e.error) return setError(e.error)
    setError(''); setItems((e.rows as unknown as Expense[]).filter(x => !isBillPayment(x))); setPeople((m.data ?? []) as Member[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, key])
  useEffect(() => { setAll(false); void load() }, [load, version])

  if (error) return <p className="error">Could not load the expenses: {error}</p>
  if (!items) return null
  const rows = all ? items : items.slice(0, SHOWN)
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? 'No category'
  const nameOf = (id: string) => people.find(p => p.user_id === id)?.display_name ?? '?'

  return (
    <section className="card">
      <div className="row"><h2>{title}</h2><span className="muted small">{items.length}{items.length === LIMIT ? '+' : ''} {items.length === 1 ? 'expense' : 'expenses'}</span></div>
      {items.length === 0 && <p className="muted">Nothing here for this period.</p>}
      {rows.map(x => {
        const open = x.bill_id ? undefined : () => setEditing(x) // a monthly-fee payment is changed on the Plan page
        return (
          <div key={x.id} className={`row item ${open ? 'tappable' : ''}`} role={open ? 'button' : undefined} tabIndex={open ? 0 : undefined}
            aria-label={open ? `Edit ${x.note || catName(x.category_id)}, ${euro(x.amount_cents)}` : undefined}
            onClick={open} onKeyDown={e => { if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open() } }}>
            <div className="grow">
              <div>{x.note || catName(x.category_id)}{x.annual_fee && <span className="tag">annual fee</span>}</div>
              <div className="muted small">{x.spent_on} · {catName(x.category_id)} · {nameOf(x.member_id)}</div>
            </div>
            <div className="right"><strong>{euro(x.amount_cents)}</strong>{open && <span className="muted small"> ✎</span>}</div>
          </div>
        )
      })}
      {!all && items.length > SHOWN && <button className="link" onClick={() => setAll(true)}>Show all {items.length}</button>}
      {editing && (
        <AddExpense expense={editing} cats={cats.filter(c => !c.archived || c.id === editing.category_id)} nameOf={nameOf}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged() }} />
      )}
    </section>
  )
}

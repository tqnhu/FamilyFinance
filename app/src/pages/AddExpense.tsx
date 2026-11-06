import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { euro, parseEuro, today } from '../lib/money'
import type { Category, Expense } from '../lib/types'
import { changes } from '../lib/expense'

type Props = {
  cats: Category[]
  onClose: () => void
  onSaved: () => void
  /** Pass an expense to edit it instead of adding a new one. */
  expense?: Expense
  /** Names for the "logged by / edited by" line in edit mode. */
  nameOf?: (id: string) => string
  /** Date to start a new expense on (defaults to today). */
  defaultDate?: string
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })

export default function AddExpense({ cats, onClose, onSaved, expense, nameOf, defaultDate }: Props) {
  const { member } = useAuth()
  const editing = Boolean(expense)
  const [amount, setAmount] = useState(expense ? (expense.amount_cents / 100).toFixed(2) : '')
  const [cat, setCat] = useState<string>(expense?.category_id ?? '')
  const [note, setNote] = useState(expense?.note ?? '')
  const [date, setDate] = useState(expense?.spent_on ?? defaultDate ?? today())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuro(amount)
    if (!cents) return setErr('Enter an amount greater than 0.')
    if (!cat && !(expense && expense.category_id === null)) return setErr('Pick a category.')
    setBusy(true); setErr('')
    if (expense) {
      const patch = changes(expense, { cents, cat, note: note.trim(), date })
      if (!Object.keys(patch).length) return onClose()
      // .select() lets us notice an update that matched no row (the database silently ignores edits you are not allowed to make)
      const { data, error } = await supabase.from('expenses').update(patch).eq('id', expense.id).select('id')
      setBusy(false)
      if (error) return setErr(error.message)
      if (!data?.length) return setErr('This expense could not be changed. You may not be allowed to edit it.')
    } else {
      const { error } = await supabase.from('expenses').insert({
        family_id: member!.family_id, member_id: member!.user_id,
        category_id: cat, amount_cents: cents, note: note.trim(), spent_on: date,
      })
      setBusy(false)
      if (error) return setErr(error.message)
    }
    onSaved()
  }

  async function remove() {
    if (!expense || !confirm(`Delete this ${euro(expense.amount_cents)} expense? This cannot be undone.`)) return
    setBusy(true)
    const { data, error } = await supabase.from('expenses').delete().eq('id', expense.id).select('id')
    setBusy(false)
    if (error) return setErr(error.message)
    if (!data?.length) return setErr('This expense could not be deleted. You may not be allowed to delete it.')
    onSaved()
  }

  return (
    <div className="modal" onClick={onClose}>
      <form className="sheet" onClick={e => e.stopPropagation()} onSubmit={save}>
        <h2>{editing ? 'Edit expense' : 'Add expense'}</h2>
        <label>Amount (€)<input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <div className="chips">
          {cats.map(c => (
            <button type="button" key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.emoji} {c.name}</button>
          ))}
        </div>
        <label>Note (optional)<input value={note} onChange={e => setNote(e.target.value)} /></label>
        <label>Date<input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} /></label>
        {expense && nameOf && (
          <p className="muted small">
            Logged by {nameOf(expense.member_id)}
            {expense.edited_at && ` · edited by ${expense.edited_by ? nameOf(expense.edited_by) : 'someone'} on ${fmt(expense.edited_at)}`}
          </p>
        )}
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy}>{editing ? 'Save changes' : 'Save'}</button>
        {editing && <button type="button" className="link danger" disabled={busy} onClick={remove}>Delete this expense</button>}
        <button type="button" className="link" onClick={onClose}>Cancel</button>
      </form>
    </div>
  )
}

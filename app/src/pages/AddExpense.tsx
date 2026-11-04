import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { parseEuro, today } from '../lib/money'
import type { Category } from '../lib/types'

export default function AddExpense({ cats, onClose, onSaved }: { cats: Category[]; onClose: () => void; onSaved: () => void }) {
  const { member } = useAuth()
  const [amount, setAmount] = useState('')
  const [cat, setCat] = useState<string>('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today())
  const [err, setErr] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuro(amount)
    if (!cents) return setErr('Enter an amount greater than 0.')
    if (!cat) return setErr('Pick a category.')
    const { error } = await supabase.from('expenses').insert({
      family_id: member!.family_id, member_id: member!.user_id,
      category_id: cat, amount_cents: cents, note: note.trim(), spent_on: date,
    })
    if (error) setErr(error.message); else onSaved()
  }

  return (
    <div className="modal" onClick={onClose}>
      <form className="sheet" onClick={e => e.stopPropagation()} onSubmit={save}>
        <h2>Add expense</h2>
        <label>Amount (€)<input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <div className="chips">
          {cats.map(c => (
            <button type="button" key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.emoji} {c.name}</button>
          ))}
        </div>
        <label>Note (optional)<input value={note} onChange={e => setNote(e.target.value)} /></label>
        <label>Date<input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Save</button>
        <button type="button" className="link" onClick={onClose}>Cancel</button>
      </form>
    </div>
  )
}

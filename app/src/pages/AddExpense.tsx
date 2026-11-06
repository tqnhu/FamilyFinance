import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { euro, parseEuro, today } from '../lib/money'
import type { Category, Expense } from '../lib/types'
import { changes } from '../lib/expense'
import { compressToJpeg } from '../lib/image'
import { receiptUrl, removeReceipt, uploadReceipt } from '../lib/receipts'

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

  // receipt photo: a newly chosen one (already shrunk), a flag to drop the current one, and a link to show the current one
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [dropPhoto, setDropPhoto] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const hasPhoto = Boolean(photo || (!dropPhoto && expense?.receipt_path))
  const shownUrl = photo?.url ?? (dropPhoto ? null : savedUrl)

  useEffect(() => { if (expense?.receipt_path) void receiptUrl(expense.receipt_path).then(setSavedUrl) }, [expense?.receipt_path])
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  async function choosePhoto(file: File | undefined) {
    if (!file) return
    setErr(''); setPhotoBusy(true)
    try { const blob = await compressToJpeg(file); setPhoto({ blob, url: URL.createObjectURL(blob) }); setDropPhoto(false) }
    catch (e) { setErr(e instanceof Error ? e.message : 'This photo could not be used.') }
    finally { setPhotoBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuro(amount)
    if (!cents) return setErr('Enter an amount greater than 0.')
    if (!cat && !(expense && expense.category_id === null)) return setErr('Pick a category.')
    setBusy(true); setErr('')

    if (expense) {
      const patch: Record<string, unknown> = { ...changes(expense, { cents, cat, note: note.trim(), date }) }
      let newPath: string | null = null
      try {
        if (photo) { newPath = await uploadReceipt(expense.family_id ?? member!.family_id, expense.id, photo.blob); patch.receipt_path = newPath }
        else if (dropPhoto && expense.receipt_path) patch.receipt_path = null
      } catch (e) { setBusy(false); return setErr(`The photo could not be uploaded: ${e instanceof Error ? e.message : 'unknown error'}`) }
      if (!Object.keys(patch).length) return onClose()
      // .select() lets us notice an update that matched no row (the database silently ignores edits you are not allowed to make)
      const { data, error } = await supabase.from('expenses').update(patch).eq('id', expense.id).select('id')
      setBusy(false)
      if (error || !data?.length) {
        await removeReceipt(newPath) // do not leave an unused photo behind
        return setErr(error ? error.message : 'This expense could not be changed. You may not be allowed to edit it.')
      }
      if (newPath || dropPhoto) await removeReceipt(expense.receipt_path) // the old photo is no longer used
      return onSaved()
    }

    // New expense. The id is chosen here so the photo can be stored under it once the expense exists.
    const id = crypto.randomUUID()
    const { error } = await supabase.from('expenses').insert({
      id, family_id: member!.family_id, member_id: member!.user_id,
      category_id: cat, amount_cents: cents, note: note.trim(), spent_on: date,
    })
    if (error) { setBusy(false); return setErr(error.message) }
    let photoProblem = ''
    if (photo) {
      try {
        const path = await uploadReceipt(member!.family_id, id, photo.blob)
        const { error: e2 } = await supabase.from('expenses').update({ receipt_path: path }).eq('id', id)
        if (e2) { await removeReceipt(path); throw new Error(e2.message) }
      } catch (e) { photoProblem = e instanceof Error ? e.message : 'unknown error' }
    }
    setBusy(false)
    onSaved()
    if (photoProblem) alert(`The expense was saved, but its receipt photo could not be uploaded (${photoProblem}). Open the expense to add the photo again.`)
  }

  async function remove() {
    if (!expense || !confirm(`Delete this ${euro(expense.amount_cents)} expense? This cannot be undone.`)) return
    setBusy(true)
    // The photo goes first: once the expense is gone, nobody is allowed to touch its photo any more.
    await removeReceipt(expense.receipt_path)
    const { data, error } = await supabase.from('expenses').delete().eq('id', expense.id).select('id')
    if (error || !data?.length) {
      if (expense.receipt_path) await supabase.from('expenses').update({ receipt_path: null }).eq('id', expense.id) // the photo is already gone
      setBusy(false)
      return setErr(error ? error.message : 'This expense could not be deleted. You may not be allowed to delete it.')
    }
    setBusy(false)
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

        <div className="receipt">
          {shownUrl && <a href={shownUrl} target="_blank" rel="noreferrer" title="Open the photo"><img src={shownUrl} alt="Receipt" /></a>}
          {hasPhoto && !shownUrl && <p className="muted small">Loading photo…</p>}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => void choosePhoto(e.target.files?.[0])} />
          <div className="btn-row">
            <button type="button" disabled={photoBusy || busy} onClick={() => fileInput.current?.click()}>{photoBusy ? 'Preparing…' : hasPhoto ? '📷 Replace photo' : '📷 Add receipt photo'}</button>
            {hasPhoto && <button type="button" disabled={busy} onClick={() => { setPhoto(null); setDropPhoto(true) }}>Remove photo</button>}
          </div>
        </div>

        {expense && nameOf && (
          <p className="muted small">
            Logged by {nameOf(expense.member_id)}
            {expense.edited_at && ` · edited by ${expense.edited_by ? nameOf(expense.edited_by) : 'someone'} on ${fmt(expense.edited_at)}`}
          </p>
        )}
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy || photoBusy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save'}</button>
        {editing && <button type="button" className="link danger" disabled={busy} onClick={remove}>Delete this expense</button>}
        <button type="button" className="link" onClick={onClose}>Cancel</button>
      </form>
    </div>
  )
}

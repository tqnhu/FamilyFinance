import { useState } from 'react'
import type { Tag } from '../lib/tags'
import { MAX_TAGS } from '../lib/expenseTags'

type Props = {
  tags: Tag[]
  /** The chosen tags' ids. */
  value: string[]
  onChange: (ids: string[]) => void
  /** Makes a tag (or finds the one with that name) and returns it. */
  onCreate: (name: string) => Promise<Tag>
  label?: string
}

/** Up to MAX_TAGS tags per expense: tap a tag to add it, tap it again to take it off, or make a new one. */
export default function TagsPicker({ tags, value, onChange, onCreate, label = `Tags (up to ${MAX_TAGS}, optional)` }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const full = value.length >= MAX_TAGS
  // archived tags are hidden from the choice, unless this expense already uses one
  const shown = tags.filter(t => !t.archived || value.includes(t.id))
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : full ? value : [...value, id])

  async function add() {
    setErr(''); setBusy(true)
    try { const t = await onCreate(name); if (!value.includes(t.id) && !full) onChange([...value, t.id]); setName(''); setAdding(false) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not make that tag.') }
    finally { setBusy(false) }
  }

  return (
    <div className="tagpicker">
      <div className="muted small" id="tag-label">{label}</div>
      <div className="chips" role="group" aria-labelledby="tag-label">
        {shown.map(t => {
          const on = value.includes(t.id)
          return (
            <button type="button" key={t.id} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} disabled={!on && full} onClick={() => toggle(t.id)}>
              {on ? '✓ ' : ''}#{t.name}{t.archived ? ' (archived)' : ''}
            </button>
          )
        })}
        {!adding && <button type="button" className="chip" disabled={full} onClick={() => setAdding(true)}>＋ New tag</button>}
      </div>
      {full && <p className="muted small" role="status">That is the most: {MAX_TAGS} tags. Take one off to choose another.</p>}
      {adding && (
        <div className="btn-row">
          <input autoFocus maxLength={40} placeholder="e.g. Vietnam trip" aria-label="New tag name" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} />
          <button type="button" disabled={busy || !name.trim()} onClick={() => void add()} style={{ flex: '0 0 auto' }}>Add</button>
        </div>
      )}
      {err && <p className="error small">{err}</p>}
    </div>
  )
}

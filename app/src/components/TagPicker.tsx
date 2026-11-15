import { useState } from 'react'
import type { Tag } from '../lib/tags'

type Props = {
  tags: Tag[]
  /** The chosen tag's id, or '' for none. */
  value: string
  onChange: (id: string) => void
  /** Makes a tag (or finds the one with that name) and returns it. */
  onCreate: (name: string) => Promise<Tag>
  label?: string
}

/** One tag per expense: tap a tag to choose it, tap it again to clear it, or make a new one. */
export default function TagPicker({ tags, value, onChange, onCreate, label = 'Tag (optional)' }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // archived tags are hidden from the choice, unless this expense already uses one
  const shown = tags.filter(t => !t.archived || t.id === value)

  async function add() {
    setErr(''); setBusy(true)
    try { const t = await onCreate(name); onChange(t.id); setName(''); setAdding(false) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not make that tag.') }
    finally { setBusy(false) }
  }

  return (
    <div className="tagpicker">
      <div className="muted small" id="tag-label">{label}</div>
      <div className="chips" role="group" aria-labelledby="tag-label">
        {shown.map(t => (
          <button type="button" key={t.id} className={`chip ${value === t.id ? 'on' : ''}`} aria-pressed={value === t.id}
            onClick={() => onChange(value === t.id ? '' : t.id)}>#{t.name}{t.archived ? ' (archived)' : ''}</button>
        ))}
        {!adding && <button type="button" className="chip" onClick={() => setAdding(true)}>＋ New tag</button>}
      </div>
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

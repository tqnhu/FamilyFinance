import { useMemo, useState } from 'react'
import { euro } from '../lib/money'
import { NO_TAG, bulkMessage, usedTagIds, visibleExpenses } from '../lib/expense'
import { addTagToMany, removeTagFromMany } from '../lib/expenseTags'
import { useTags } from '../lib/tags'
import type { Category, Expense } from '../lib/types'
import Sheet from './Sheet'
import TagPicker from './TagPicker'

type Props = {
  /** Every expense of the month being viewed (the list decides what to show). */
  expenses: Expense[]
  cats: Category[]
  title: string
  nameOf: (id: string) => string
  canEdit: (x: Expense) => boolean
  onEdit: (x: Expense) => void
  /** Called after a bulk change so the screen reloads. */
  onChanged: () => void
}

const PAGE = 30

export default function ExpenseList({ expenses, cats, title, nameOf, canEdit, onEdit, onChanged }: Props) {
  const { tags, create: createTag, reload: reloadTags } = useTags()
  const [filter, setFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState(false)
  const [status, setStatus] = useState('')

  const catOf = (id: string | null) => cats.find(c => c.id === id)
  const tagName = (id: string | null | undefined) => (id ? tags.find(t => t.id === id)?.name : undefined)

  const used = useMemo(() => usedTagIds(expenses), [expenses])
  const offered = tags.filter(t => used.has(t.id) || t.id === filter)
  // The filter survives stepping between months (a month with none of that tag just shows an empty list, with a "Show all" link).
  // It only resets if the tag itself is gone.
  const active = filter === '' || filter === NO_TAG || tags.some(t => t.id === filter) ? filter : ''
  const shown = useMemo(() => visibleExpenses(expenses, active), [expenses, active])
  const shownTotal = shown.reduce((s, x) => s + x.amount_cents, 0)
  const selectable = (x: Expense) => canEdit(x) && !x.bill_id // bill payments are changed on the Plan page
  const selectableShown = shown.filter(selectable)
  const rows = showAll || selecting ? shown : shown.slice(0, PAGE)

  function toggle(id: string) {
    setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function stopSelecting() { setSelecting(false); setPicked(new Set()); setSheet(false) }

  async function apply(tagId: string | null) {
    const ids = [...picked]
    // tagId null = take all their tags off; otherwise the tag is added (a tag they already have is left alone)
    const r = tagId ? await addTagToMany(ids, tagId) : await removeTagFromMany(ids)
    const updated = r.n, problem = r.error ?? ''
    setStatus(problem
      ? `Stopped after ${updated} of ${ids.length}: ${problem}`
      : bulkMessage(ids.length, updated, tagId ? tags.find(t => t.id === tagId)?.name ?? '' : null))
    stopSelecting(); void reloadTags(); onChanged()
  }

  return (
    <section className="card">
      <h2>{title}</h2>

      {(tags.length > 0 || selectableShown.length > 0) && (
        <div className="listbar">
          {tags.length > 0 && (
            <label className="listbar-filter">Tag
              <select value={active} onChange={e => { setFilter(e.target.value); setShowAll(false); setPicked(new Set()) }}>
                <option value="">All expenses</option>
                <option value={NO_TAG}>Without a tag</option>
                {offered.map(t => <option key={t.id} value={t.id}>#{t.name}{t.archived ? ' (archived)' : ''}</option>)}
              </select>
            </label>
          )}
          {selectableShown.length > 0 && (
            <button className={selecting ? 'primary' : ''} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? 'Done' : 'Select'}</button>
          )}
        </div>
      )}

      {status && <p className="status" role="status">{status} <button className="link small" onClick={() => setStatus('')}>dismiss</button></p>}

      {active !== '' && (
        <p className="muted small">
          {active === NO_TAG ? 'Without a tag' : `#${tagName(active) ?? ''}`}: <strong>{shown.length} {shown.length === 1 ? 'expense' : 'expenses'} · {euro(shownTotal)}</strong>
          {' '}<button className="link small" onClick={() => setFilter('')}>Show all</button>
        </p>
      )}

      {selecting && (
        <div className="btn-row">
          <button onClick={() => setPicked(new Set(selectableShown.map(x => x.id)))}>Select all {selectableShown.length}</button>
          <button onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Select none</button>
        </div>
      )}
      {!selecting && shown.length > 0 && <p className="muted small">Tap an expense to fix a mistake.</p>}
      {shown.length === 0 && <p className="muted">{active === '' ? 'No expenses yet.' : 'Nothing here for this month.'}</p>}

      {rows.map(x => {
        const can = selectable(x)
        const open = selecting ? (can ? () => toggle(x.id) : undefined) : (can ? () => onEdit(x) : undefined)
        const isPicked = picked.has(x.id)
        const label = `${x.note || catOf(x.category_id)?.name || 'expense'}, ${euro(x.amount_cents)}`
        return (
          <div key={x.id} className={`row item ${open ? 'tappable' : ''} ${selecting && isPicked ? 'picked' : ''}`}
            role={open ? (selecting ? 'checkbox' : 'button') : undefined} aria-checked={open && selecting ? isPicked : undefined} tabIndex={open ? 0 : undefined}
            aria-label={open ? (selecting ? `Select ${label}` : `Edit ${label}${x.receipt_path ? ', has a receipt photo' : ''}`) : undefined}
            onClick={open} onKeyDown={e => { if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open() } }}>
            {selecting && <span className="pick" aria-hidden>{!can ? '' : isPicked ? '☑' : '☐'}</span>}
            <div className="grow">
              <div>{catOf(x.category_id)?.emoji ?? '📦'} {x.note || catOf(x.category_id)?.name || 'Expense'}{x.receipt_path && <span title="Has a receipt photo" aria-hidden> 📎</span>}</div>
              <div className="muted small">{x.spent_on} · {nameOf(x.member_id)}
                {x.edited_at && <span className="tag">edited{x.edited_by ? ` by ${nameOf(x.edited_by)}` : ''}</span>}
                {x.bill_id && <span className="tag">{x.monthly_fee ? 'monthly bill' : 'bill'}</span>}
                {x.annual_fee && <span className="tag" title="Not counted as monthly spending">annual fee</span>}
                {(x.tag_ids ?? []).map(id => tagName(id) && <span key={id} className="tag tagname">#{tagName(id)}</span>)}</div>
            </div>
            <div className="right"><strong>{euro(x.amount_cents)}</strong>{open && !selecting && <span className="muted small"> ✎</span>}</div>
          </div>
        )
      })}
      {!showAll && !selecting && shown.length > PAGE && <button className="link" onClick={() => setShowAll(true)}>Show all {shown.length}</button>}

      {selecting && (
        <div className="actionbar" role="region" aria-label="Bulk actions">
          <span><strong>{picked.size}</strong> selected</span>
          <button className="primary" disabled={picked.size === 0} onClick={() => setSheet(true)}>🏷 Tag…</button>
          <button onClick={stopSelecting}>Cancel</button>
        </div>
      )}

      {sheet && <BulkTagSheet count={picked.size} tags={tags} onCreate={createTag} onClose={() => setSheet(false)} onApply={apply} />}
    </section>
  )
}

function BulkTagSheet({ count, tags, onCreate, onClose, onApply }: {
  count: number; tags: ReturnType<typeof useTags>['tags']; onCreate: ReturnType<typeof useTags>['create']; onClose: () => void; onApply: (tagId: string | null) => Promise<void>
}) {
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (id: string | null) => { setBusy(true); try { await onApply(id) } finally { setBusy(false) } }
  return (
    <Sheet title={`Tag ${count} ${count === 1 ? 'expense' : 'expenses'}`} onClose={onClose}>
      <TagPicker tags={tags} value={tag} onChange={setTag} onCreate={onCreate} label="Add a tag, or make a new one" />
      <button className="primary" disabled={!tag || busy} onClick={() => void run(tag)}>{busy ? 'Saving…' : 'Add tag'}</button>
      <button disabled={busy} onClick={() => { if (confirm(`Remove all tags from ${count} ${count === 1 ? 'expense' : 'expenses'}?`)) void run(null) }}>Remove all their tags instead</button>
    </Sheet>
  )
}

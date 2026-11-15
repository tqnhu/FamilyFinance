import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { euro, euroWhole } from '../lib/money'
import {
  canStep, monthLines, periodLabel, periodNow, periodRange, stepPeriod, tagLines, useTags,
  type MonthLine, type Period, type PeriodKind, type Tag, type TotalRow,
} from '../lib/tags'
import type { Category, Expense, Member } from '../lib/types'
import AddExpense from './AddExpense'

const LIMIT = 300
const KINDS: [PeriodKind, string][] = [['month', 'Month'], ['year', 'Year'], ['all', 'All time']]

export default function TagsView() {
  const { tags, reload: reloadTags } = useTags()
  const [period, setPeriod] = useState<Period>(periodNow('month'))
  const [totals, setTotals] = useState<TotalRow[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  const loadTotals = useCallback(async () => {
    const { from, to } = periodRange(period)
    setBusy(true)
    const { data, error } = await supabase.rpc('tag_totals', { from_d: from, to_d: to })
    if (error) setError(error.message); else { setError(''); setTotals((data ?? []) as TotalRow[]) }
    setBusy(false)
  }, [period])
  useEffect(() => { void loadTotals() }, [loadTotals])

  if (error) return <p className="error">Could not load tags: {error}. Has the latest SQL migration been run?</p>
  if (!totals) return <p className="muted center-text">Loading…</p>

  const { lines, untagged, tagged, all } = tagLines(totals, tags)
  const tag = selected ? tags.find(t => t.id === selected) : undefined

  return (
    <div style={{ opacity: busy ? 0.6 : 1, transition: 'opacity .15s' }}>
      <p className="muted small" style={{ margin: '4px 2px 0' }}>Add up expenses by</p>
      <div className="seg" role="tablist" aria-label="Period">
        {KINDS.map(([kind, label]) => (
          <button key={kind} role="tab" aria-selected={period.kind === kind} className={period.kind === kind ? 'on' : ''}
            onClick={() => setPeriod(periodNow(kind))}>{label}</button>
        ))}
      </div>
      {period.kind !== 'all' && (
        <div className="stepper">
          <button aria-label={`Previous ${period.kind}`} onClick={() => setPeriod(stepPeriod(period, -1))} disabled={!canStep(period, -1)}>‹</button>
          <strong>{periodLabel(period)}</strong>
          <button aria-label={`Next ${period.kind}`} onClick={() => setPeriod(stepPeriod(period, 1))} disabled={!canStep(period, 1)}>›</button>
        </div>
      )}

      {tag
        ? <TagDetail tag={tag} period={period} count={lines.find(l => l.id === tag.id)?.n ?? 0}
            onBack={() => setSelected(null)} onChanged={() => { void loadTotals(); void reloadTags() }} />
        : (
          <>
            <section className="card">
              <p className="muted">{periodLabel(period)} · spending with a tag</p>
              <div className="hero">{euroWhole(tagged)}</div>
              <div className="tiles">
                <div className="tile"><span className="muted small">Without a tag</span><b>{euroWhole(untagged.total)}</b></div>
                <div className="tile"><span className="muted small">All spending</span><b>{euroWhole(all)}</b></div>
              </div>
            </section>

            <section className="card">
              <h2>By tag</h2>
              {lines.length === 0
                ? <p className="muted">{tags.length ? 'No tagged spending in this period.' : 'No tags yet. Add a tag when you add or edit an expense, e.g. "Holiday" or "Kitchen". Everything with the same tag is then added up here.'}</p>
                : (
                  <div className="viz">
                    <div className="bars">
                      {lines.map(l => {
                        const max = lines[0].total
                        const open = () => setSelected(l.id)
                        return (
                          <div key={l.id} className="bar-row wide" role="button" tabIndex={0} aria-label={`${l.name}: ${euroWhole(l.total)} in ${l.n} ${l.n === 1 ? 'expense' : 'expenses'}. Open`}
                            onClick={open} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}>
                            <span className="bar-name">#{l.name}{l.archived ? ' (archived)' : ''}</span>
                            <span className="bar-track"><i className="bar-fill" style={{ width: `${(l.total / max) * 100}%` }} /></span>
                            <span className="bar-val">{euroWhole(l.total)}<span className="muted small"> · {l.n}</span></span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              {untagged.total > 0 && <p className="muted small">Not tagged: {euro(untagged.total)} in {untagged.n} {untagged.n === 1 ? 'expense' : 'expenses'}. Tag them from the expense's edit screen.</p>}
              <p className="muted small">Includes every kind of spending, bill payments too.</p>
            </section>
          </>
        )}
    </div>
  )
}

function TagDetail({ tag, period, count, onBack, onChanged }: { tag: Tag; period: Period; count: number; onBack: () => void; onChanged: () => void }) {
  const [months, setMonths] = useState<MonthLine[]>([])
  const [items, setItems] = useState<Expense[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [people, setPeople] = useState<Member[]>([])
  const [editing, setEditing] = useState<Expense | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { from, to } = periodRange(period)
    let q = supabase.from('expenses').select('*').eq('tag_id', tag.id).order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(LIMIT)
    if (from) q = q.gte('spent_on', from)
    if (to) q = q.lt('spent_on', to)
    const [m, e, c, p] = await Promise.all([
      supabase.rpc('tag_months', { tag: tag.id, from_d: from, to_d: to }),
      q, supabase.from('categories').select('*'), supabase.from('members').select('*'),
    ])
    if (m.error || e.error) return setErr((m.error ?? e.error)!.message)
    setMonths(monthLines((m.data ?? []) as { month: string; total_cents: number; n: number }[]))
    setItems((e.data ?? []) as Expense[]); setCats((c.data ?? []) as Category[]); setPeople((p.data ?? []) as Member[])
  }, [tag.id, period])
  useEffect(() => { void load() }, [load])

  const total = months.reduce((s, m) => s + m.total, 0)
  const nameOf = (id: string) => people.find(p => p.user_id === id)?.display_name ?? '?'
  const catOf = (id: string | null) => cats.find(c => c.id === id)
  const maxMonth = Math.max(...months.map(m => m.total), 1)

  async function rename() {
    const name = prompt('Rename this tag', tag.name)?.trim().replace(/\s+/g, ' ')
    if (!name || name === tag.name) return
    const { error } = await supabase.from('tags').update({ name }).eq('id', tag.id)
    if (error) return alert(error.code === '23505' ? 'You already have a tag with that name.' : error.message)
    onChanged(); onBack()
  }
  async function archive() {
    if (!confirm(`Archive "${tag.name}"? Its expenses keep the tag and stay in these totals. It just stops being offered for new expenses.`)) return
    const { error } = await supabase.from('tags').update({ archived: true }).eq('id', tag.id)
    if (error) return alert(error.message)
    onChanged(); onBack()
  }
  async function restore() { await supabase.from('tags').update({ archived: false }).eq('id', tag.id); onChanged(); onBack() }

  return (
    <>
      <button className="link" onClick={onBack}>← All tags</button>
      <section className="card">
        <h2>#{tag.name}{tag.archived ? ' (archived)' : ''}</h2>
        <p className="muted">{periodLabel(period)}</p>
        <div className="hero">{euroWhole(total)}</div>
        <p className="muted small">{count} {count === 1 ? 'expense' : 'expenses'}</p>
        <div className="btn-row">
          <button onClick={rename}>Rename</button>
          {tag.archived ? <button onClick={restore}>Restore</button> : <button onClick={archive}>Archive</button>}
        </div>
      </section>

      {err && <p className="error">{err}</p>}

      {period.kind !== 'month' && months.length > 0 && (
        <section className="card">
          <h2>By month</h2>
          <div className="viz">
            <div className="bars">
              {months.map(m => (
                <div key={m.key} className="bar-row wide" aria-label={`${m.label}: ${euroWhole(m.total)} in ${m.n} ${m.n === 1 ? 'expense' : 'expenses'}`}>
                  <span className="bar-name">{m.label}</span>
                  <span className="bar-track"><i className="bar-fill" style={{ width: `${(m.total / maxMonth) * 100}%` }} /></span>
                  <span className="bar-val">{euroWhole(m.total)}<span className="muted small"> · {m.n}</span></span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Expenses</h2>
        {items.length === 0 && <p className="muted">Nothing in this period.</p>}
        {items.map(x => {
          const open = !x.bill_id ? () => setEditing(x) : undefined
          return (
            <div key={x.id} className={`row item ${open ? 'tappable' : ''}`} role={open ? 'button' : undefined} tabIndex={open ? 0 : undefined}
              aria-label={open ? `Edit ${x.note || catOf(x.category_id)?.name || 'expense'}, ${euro(x.amount_cents)}` : undefined}
              onClick={open} onKeyDown={e => { if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open() } }}>
              <div>
                <div>{catOf(x.category_id)?.emoji ?? '📦'} {x.note || catOf(x.category_id)?.name || 'Expense'}{x.bill_id && <span className="tag">bill</span>}</div>
                <div className="muted small">{x.spent_on} · {nameOf(x.member_id)}</div>
              </div>
              <div className="right"><strong>{euro(x.amount_cents)}</strong>{open && <span className="muted small"> ✎</span>}</div>
            </div>
          )
        })}
        {count > LIMIT && <p className="muted small">Showing the latest {LIMIT} of {count}. The total above includes all of them.</p>}
      </section>

      {editing && (
        <AddExpense expense={editing} cats={cats.filter(c => !c.archived || c.id === editing.category_id)} nameOf={nameOf}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); onChanged() }} />
      )}
    </>
  )
}

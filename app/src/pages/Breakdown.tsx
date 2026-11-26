import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { euroTidy } from '../lib/money'
import { monthKey, monthOffset, parseMonthKey, shiftMonth } from '../lib/category'
import { breakdown, monthWindows, splitForComparison, yearBreakdown, type Breakdown as B, type Slice, type YearBreakdown } from '../lib/breakdown'
import type { SummaryRow } from '../lib/year'
import type { Category, Expense } from '../lib/types'
import FlowChart from '../components/FlowChart'

type Scope = 'month' | 'year'
type Row = Pick<Expense, 'category_id' | 'tag_id' | 'amount_cents' | 'bill_id' | 'monthly_fee' | 'spent_on'>

const monthName = (d: Date, style: 'long' | 'short' = 'long') => d.toLocaleDateString('en-IE', { month: style })

function useWide() {
  const q = '(min-width: 600px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches)
  useEffect(() => {
    const m = window.matchMedia?.(q); if (!m) return
    const f = () => setWide(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [])
  return wide
}

/** The bar that shows every slice at once. */
function ShareBar({ slices, label }: { slices: Slice[]; label: string }) {
  return (
    <div className="bd-bar" role="img" aria-label={label}>
      {slices.map(s => <div key={s.id} title={`${s.name} ${s.pct.toFixed(1)}%`} style={{ flex: `${s.cents} 1 0%`, background: s.color }} />)}
    </div>
  )
}

const deltaText = (d: number, vs: string) => `${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${d === 0 ? 'same' : euroTidy(Math.abs(d))} vs ${vs}`

function MonthBreakdown({ scopeBar }: { scopeBar: (extra?: React.ReactNode) => React.ReactNode }) {
  const [key, setKey] = useState(monthKey(new Date()))
  const [compare, setCompare] = useState(true)
  const [open, setOpen] = useState<string | null | undefined>(undefined) // undefined = the first row, until the user chooses
  const [view, setView] = useState<'list' | 'flow'>('list')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const [tags, setTags] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const wide = useWide()

  const viewed = parseMonthKey(key)!
  const w = monthWindows(key)

  useEffect(() => {
    let alive = true
    setRows(null)
    Promise.all([
      supabase.from('expenses').select('category_id, tag_id, amount_cents, spent_on, bill_id, monthly_fee').gte('spent_on', w.prevStart).lt('spent_on', w.end),
      supabase.from('categories').select('*'),
      supabase.from('tags').select('id, name'),
    ]).then(([e, c, t]) => {
      if (!alive) return
      if (e.error || c.error) { setError((e.error ?? c.error)!.message); return }
      setError(''); setRows((e.data ?? []) as Row[]); setCats((c.data ?? []) as Category[]); setTags((t.data ?? []) as { id: string; name: string }[])
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const model: B | null = useMemo(() => {
    if (!rows) return null
    const { cur, prev } = splitForComparison(rows, key)
    return breakdown(cur, compare ? prev : null, cats, tags)
  }, [rows, cats, tags, key, compare])

  const prevName = monthName(new Date(viewed.getFullYear(), viewed.getMonth() - 1, 1), 'short')
  const prevLong = monthName(new Date(viewed.getFullYear(), viewed.getMonth() - 1, 1))
  const monthLabel = viewed.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
  const isCurrent = monthOffset(key) === 0
  const caption = w.current ? `Everyday spending, 1 to ${w.lastDay} ${monthName(viewed)}` : `Everyday spending in ${monthName(viewed)}`

  const stepper = (
    <div className="stepper">
      <button aria-label="Previous month" onClick={() => { setKey(shiftMonth(key, -1)); setOpen(undefined) }} disabled={monthOffset(shiftMonth(key, -1)) === null}>‹</button>
      <strong>{monthLabel}</strong>
      <button aria-label="Next month" onClick={() => { setKey(shiftMonth(key, 1)); setOpen(undefined) }} disabled={isCurrent}>›</button>
    </div>
  )
  const extras = (
    <>
      {wide && model && model.total > 0 && (
        <div className="seg small-seg" role="group" aria-label="How to show it">
          <button aria-pressed={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
          <button aria-pressed={view === 'flow'} className={view === 'flow' ? 'on' : ''} onClick={() => setView('flow')}>Flow</button>
        </div>
      )}
      <label className="bd-compare">
        <span>Compare with {prevLong}</span>
        <input type="checkbox" role="switch" checked={compare} onChange={e => setCompare(e.target.checked)} />
      </label>
    </>
  )

  if (error) return <>{scopeBar()}<p className="error">Could not load the breakdown: {error}</p></>
  return (
    <>
      {stepper}
      {scopeBar(extras)}
      {!model ? <p className="muted center-text">Loading…</p> : model.total === 0 ? (
        <section className="card"><h2>Nothing to show yet</h2><p className="muted">No everyday spending is recorded for {monthLabel}. Add an expense on Home and it will appear here.</p></section>
      ) : (
        <>
          <section className="card">
            <p className="muted small">{caption}</p>
            <div className="big">{euroTidy(model.total)}</div>
            {compare && model.delta !== null && model.prevTotal! > 0 && (
              <p className={`bd-delta ${model.delta > 0 ? 'up' : 'down'}`}>
                {model.delta === 0 ? `The same as ${prevLong}` : `${model.delta > 0 ? '▲' : '▼'} ${euroTidy(Math.abs(model.delta))} ${model.delta > 0 ? 'more' : 'less'} than ${prevLong}${w.current ? ' so far' : ''}`}
              </p>
            )}
            <ShareBar slices={model.slices} label={`Share of spending: ${model.slices.map(s => `${s.name} ${s.pct.toFixed(1)}%`).join(', ')}`} />
            {view === 'flow' && wide
              ? <FlowChart slices={model.slices} total={model.total} title={caption} />
              : <p className="muted small">Tap a category below to see what is inside it.</p>}
            {model.separateBills > 0 && (
              <p className="muted small bd-apart">Yearly and other non-monthly bills paid this month ({euroTidy(model.separateBills)}) are kept apart. <Link to="/plan">See in Plan</Link></p>
            )}
          </section>

          <section className="card">
            <div className="row"><h2>By category</h2><span className="muted small">Share of {euroTidy(model.total)}</span></div>
            {model.slices.map(s => {
              const isOpen = (open === undefined ? model.slices[0]?.id : open) === s.id
              return (
                <div key={s.id} className="bd-item">
                  <button className="bd-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                    <span className="bd-dot" style={{ background: s.color }} aria-hidden="true" />
                    <span className="bd-main">
                      <span className="bd-name">{s.emoji && `${s.emoji} `}{s.name}</span>
                      {compare && s.delta !== null && model.prevTotal! > 0 && <span className={`bd-delta small ${s.delta > 0 ? 'up' : 'down'}`}>{deltaText(s.delta, prevName)}</span>}
                    </span>
                    <span className="bd-nums"><b>{euroTidy(s.cents)}</b><span className="muted small">{s.pct.toFixed(1)}%</span></span>
                    <span className="bd-chev" aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}>⌄</span>
                  </button>
                  {isOpen && (
                    <div className="bd-panel" data-testid={`panel-${s.id}`}>
                      <div className="bd-panel-title">{s.detailTitle}</div>
                      {s.details.map(d => (
                        <div key={d.name} className="bd-detail">
                          <span>{d.name}</span><b>{euroTidy(d.cents)}</b><span className="muted bd-share">{s.group ? `${d.pct.toFixed(1)}%` : `${Math.round(d.pct)}%`}</span>
                          <div className="bd-mini"><div style={{ width: `${d.width}%`, background: s.color }} /></div>
                        </div>
                      ))}
                      {s.categoryId && <Link className="bd-link" to={`/review?category=${s.categoryId}&month=${key}`}>See all expenses in {s.name} ›</Link>}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
          <p className="muted small">Monthly fees, like a subscription, count as everyday spending in the month they were charged. Shares are of everyday spending only.</p>
        </>
      )}
    </>
  )
}

function YearBreakdownView({ scopeBar }: { scopeBar: (extra?: React.ReactNode) => React.ReactNode }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [model, setModel] = useState<YearBreakdown | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setModel(null)
    Promise.all([supabase.rpc('year_summary', { y: year }), supabase.from('categories').select('*')]).then(([s, c]) => {
      if (!alive) return
      if (s.error || c.error) { setError((s.error ?? c.error)!.message); return }
      setError(''); setModel(yearBreakdown((s.data ?? []) as SummaryRow[], (c.data ?? []) as Category[]))
    })
    return () => { alive = false }
  }, [year])

  const monthsCounted = year === thisYear ? new Date().getMonth() + 1 : 12
  const stepper = (
    <div className="stepper">
      <button aria-label="Previous year" onClick={() => setYear(year - 1)} disabled={year <= thisYear - 10}>‹</button>
      <strong>{year}</strong>
      <button aria-label="Next year" onClick={() => setYear(year + 1)} disabled={year >= thisYear}>›</button>
    </div>
  )
  if (error) return <>{scopeBar()}<p className="error">Could not load the year: {error}. Has the latest SQL migration been run?</p></>
  return (
    <>
      {stepper}
      {scopeBar()}
      {!model ? <p className="muted center-text">Loading…</p> : model.total === 0 ? (
        <section className="card"><h2>Nothing to show yet</h2><p className="muted">No everyday spending is recorded for {year}.</p></section>
      ) : (
        <>
          <section className="card">
            <p className="muted small">Everyday spending in {year}</p>
            <div className="big">{euroTidy(model.total)}</div>
            <p className="muted small">About {euroTidy(Math.round(model.total / monthsCounted))} a month</p>
            <ShareBar slices={model.slices} label={`Share of the year's spending: ${model.slices.map(s => `${s.name} ${s.pct.toFixed(1)}%`).join(', ')}`} />
            {model.separateBills > 0 && <p className="muted small bd-apart">Yearly and other non-monthly bills ({euroTidy(model.separateBills)}) are kept apart. <Link to="/plan">See in Plan</Link></p>}
          </section>
          <section className="card">
            <div className="row"><h2>By category</h2><span className="muted small">Share of {euroTidy(model.total)}</span></div>
            {model.slices.map(s => (
              <div key={s.id} className="bd-item">
                <div className="bd-row static">
                  <span className="bd-dot" style={{ background: s.color }} aria-hidden="true" />
                  <span className="bd-main">
                    <span className="bd-name">{s.emoji && `${s.emoji} `}{s.name}</span>
                    <span className="muted small">{euroTidy(Math.round(s.cents / monthsCounted))} a month</span>
                  </span>
                  <span className="bd-nums"><b>{euroTidy(s.cents)}</b><span className="muted small">{s.pct.toFixed(1)}%</span></span>
                </div>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>How the mix changed</h2>
            <p className="muted small">Each column is one month, split by each category's share of that month's spending.</p>
            <div className="bd-mix" role="img" aria-label="Monthly share of spending by category">
              {model.mix.map(m => {
                const tot = m.cents.reduce((a, b) => a + b, 0)
                return (
                  <div key={m.month} className="bd-col" style={{ opacity: tot === 0 ? 0.15 : 1 }} title={tot === 0 ? undefined : `${MONTH_NAMES[m.month - 1]}: ${model.slices.map((s, i) => `${s.name} ${Math.round((m.cents[i] / tot) * 100)}%`).join(', ')}`}>
                    {tot === 0 ? <div style={{ flex: 1, background: '#9aa8a3' }} /> : [...model.slices.keys()].reverse().filter(i => m.cents[i] > 0).map(i => <div key={i} style={{ flex: `${m.cents[i]} 1 0%`, background: model.slices[i].color }} />)}
                  </div>
                )
              })}
            </div>
            <div className="bd-months" aria-hidden="true">{MONTH_NAMES.map((n, i) => <span key={i}>{n[0]}</span>)}</div>
          </section>
          <p className="muted small">Monthly fees count as everyday spending in the month charged. Shares are of everyday spending only.</p>
        </>
      )}
    </>
  )
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Review → Breakdown: where the money goes, for a month or a year. */
export default function BreakdownTab() {
  const [scope, setScope] = useState<Scope>('month')
  const scopeBar = (extra?: React.ReactNode) => (
    <div className="bd-controls">
      <div className="seg small-seg" role="group" aria-label="Period">
        <button aria-pressed={scope === 'month'} className={scope === 'month' ? 'on' : ''} onClick={() => setScope('month')}>Month</button>
        <button aria-pressed={scope === 'year'} className={scope === 'year' ? 'on' : ''} onClick={() => setScope('year')}>Year</button>
      </div>
      {extra}
    </div>
  )
  return scope === 'month' ? <MonthBreakdown scopeBar={scopeBar} /> : <YearBreakdownView scopeBar={scopeBar} />
}

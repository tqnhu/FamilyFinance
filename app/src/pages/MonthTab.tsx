import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { euroTidy } from '../lib/money'
import { monthKey, monthOffset, parseMonthKey, shiftMonth } from '../lib/category'
import { breakdown, monthWindows, splitForComparison, type Breakdown as B } from '../lib/breakdown'
import { budgetHint } from '../lib/budget'
import { useChart } from '../lib/chartChoice'
import { useWide } from '../lib/useWide'
import type { Category, Expense } from '../lib/types'
import FlowChart from '../components/FlowChart'
import PieChart from '../components/PieChart'
import ShareBar from '../components/ShareBar'
import ChartToggle from '../components/ChartToggle'

type Row = Pick<Expense, 'category_id' | 'tag_id' | 'amount_cents' | 'bill_id' | 'monthly_fee' | 'annual_fee' | 'spent_on'>

const monthName = (d: Date, style: 'long' | 'short' = 'long') => d.toLocaleDateString('en-IE', { month: style })
const deltaText = (d: number, vs: string) => `${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${d === 0 ? 'same' : euroTidy(Math.abs(d))} vs ${vs}`

/** Review → Month: where one month's money went, compared with the month before. Opens on the current month. */
export default function MonthTab() {
  const [key, setKey] = useState(monthKey(new Date()))
  const [compare, setCompare] = useState(true)
  const [open, setOpen] = useState<string | null | undefined>(undefined) // undefined = the first row, until the user chooses
  const [chart, setChart] = useChart()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const [tags, setTags] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const wide = useWide()
  const wide2 = useWide(900) // two columns, and the flow diagram with its tags level

  const viewed = parseMonthKey(key)!
  const w = monthWindows(key)
  const shown = chart === 'flow' && !wide ? 'pie' : chart // the flow diagram needs a wide screen
  const flowing = shown === 'flow' && wide2 // on a wide screen the list picks which category's tags the diagram opens up

  useEffect(() => {
    let alive = true
    setRows(null)
    Promise.all([
      supabase.from('expenses').select('*').gte('spent_on', w.prevStart).lt('spent_on', w.end),
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

  const prevDate = new Date(viewed.getFullYear(), viewed.getMonth() - 1, 1)
  const prevName = monthName(prevDate, 'short'), prevLong = monthName(prevDate)
  const monthLabel = viewed.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
  const isCurrent = monthOffset(key) === 0
  const caption = w.current ? `Everyday spending, 1 to ${w.lastDay} ${monthName(viewed)}` : `Everyday spending in ${monthName(viewed)}`
  const pickedId = model ? (model.slices.find(s => s.id === open)?.id ?? model.slices[0]?.id) : undefined
  const pickedSlice = model?.slices.find(s => s.id === pickedId)
  const shares = (m: B) => m.slices.map(s => `${s.name} ${s.pct.toFixed(1)}%`).join(', ')

  return (
    <>
      <div className="stepper">
        <button aria-label="Previous month" onClick={() => { setKey(shiftMonth(key, -1)); setOpen(undefined) }} disabled={monthOffset(shiftMonth(key, -1)) === null}>‹</button>
        <strong>{monthLabel}</strong>
        <button aria-label="Next month" onClick={() => { setKey(shiftMonth(key, 1)); setOpen(undefined) }} disabled={isCurrent}>›</button>
      </div>
      <div className="bd-controls end">
        <label className="bd-compare">
          <span>Compare with {prevLong}</span>
          <input type="checkbox" role="switch" checked={compare} onChange={e => setCompare(e.target.checked)} />
        </label>
      </div>

      {error ? <p className="error">Could not load the month: {error}</p> : !model ? <p className="muted center-text">Loading…</p> : model.total === 0 ? (
        <section className="card"><h2>Nothing to show yet</h2><p className="muted">No everyday spending is recorded for {monthLabel}. Add an expense on Home and it will appear here.</p></section>
      ) : (
        <>
        <div className={`rv-grid ${shown}`}>
          <section className="card rv-main">
            <p className="muted small">{caption}</p>
            <div className="big">{euroTidy(model.total)}</div>
            {compare && model.delta !== null && model.prevTotal! > 0 && (
              <p className={`bd-delta ${model.delta > 0 ? 'up' : 'down'}`}>
                {model.delta === 0 ? `The same as ${prevLong}` : `${model.delta > 0 ? '▲' : '▼'} ${euroTidy(Math.abs(model.delta))} ${model.delta > 0 ? 'more' : 'less'} than ${prevLong}${w.current ? ' so far' : ''}`}
              </p>
            )}
            <ChartToggle value={shown} onChange={setChart} flow={wide} />
            {shown === 'pie' && <PieChart slices={model.slices} label={`Pie chart of ${caption.toLowerCase()}: ${shares(model)}`} />}
            {shown === 'bars' && <ShareBar slices={model.slices} label={`Share of spending: ${shares(model)}`} />}
            {shown === 'flow' && <FlowChart slices={model.slices} total={model.total} title={caption} pickedId={flowing ? pickedId : undefined} />}
            {model.separateBills > 0 && (
              <p className="muted small bd-apart">Yearly bills and annual fees {w.current ? 'this month' : 'that month'} ({euroTidy(model.separateBills)}) are kept apart. <Link to="/plan">See in Plan</Link></p>
            )}
          </section>

          <section className="card rv-side">
            <div className="row"><h2>By category</h2><span className="muted small">Share of {euroTidy(model.total)}</span></div>
            {model.slices.map(s => {
              const isOpen = !flowing && (open === undefined ? model.slices[0]?.id : open) === s.id
              const budget = s.categoryId ? cats.find(c => c.id === s.categoryId)?.budget_cents ?? 0 : 0
              const hint = budgetHint(s.cents, budget, !w.current)
              return (
                <div key={s.id} className="bd-item">
                  <button className={`bd-row ${flowing && pickedId === s.id ? 'picked' : ''}`} {...(flowing ? { 'aria-pressed': pickedId === s.id } : { 'aria-expanded': isOpen })} onClick={() => setOpen(flowing ? s.id : isOpen ? null : s.id)}>
                    <span className="bd-dot" style={{ background: s.color }} aria-hidden="true" />
                    <span className="bd-main">
                      <span className="bd-name">{s.emoji && `${s.emoji} `}{s.name}</span>
                      {compare && s.delta !== null && model.prevTotal! > 0 && <span className={`bd-delta small ${s.delta > 0 ? 'up' : 'down'}`}>{deltaText(s.delta, prevName)}</span>}
                      {hint && (
                        <span className="bd-budget" data-state={hint.state}>
                          <span className="bd-budget-bar" aria-hidden="true"><i className={hint.state} style={{ width: `${hint.pct}%` }} /></span>
                          <span className={`bd-budget-text small ${hint.state}`}>{hint.text}</span>
                        </span>
                      )}
                    </span>
                    <span className="bd-nums"><b>{euroTidy(s.cents)}</b><span className="muted small">{s.pct.toFixed(1)}%</span></span>
                    {!flowing && <span className="bd-chev" aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}>⌄</span>}
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
            {flowing && pickedSlice?.categoryId && <Link className="bd-link" to={`/review?category=${pickedSlice.categoryId}&month=${key}`}>See all expenses in {pickedSlice.name} ›</Link>}
          </section>
        </div>
          <p className="muted small">{compare ? `The comparison uses ${w.current ? `the same days of ${prevLong}` : `all of ${prevLong}`}. ` : ''}Monthly fees count as everyday spending in the month charged. Budgets are today's budgets.</p>
        </>
      )}
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { euroTidy, euroWhole } from '../lib/money'
import { MONTHS } from '../lib/bills'
import { yearModel, type SummaryRow, type YearModel } from '../lib/year'
import { yearBreakdown, type YearBreakdown } from '../lib/breakdown'
import { useChart } from '../lib/chartChoice'
import { useGoals } from '../lib/goals'
import { useWide } from '../lib/useWide'
import type { Category } from '../lib/types'
import type { Tag } from '../lib/tags'
import { describeChoice, splitChoice } from '../lib/tagfilter'
import TagFilter from '../components/TagFilter'
import TaggedExpenses from '../components/TaggedExpenses'
import { CategoryBars, MonthlyChart } from '../components/charts'
import PieChart from '../components/PieChart'
import ShareBar from '../components/ShareBar'
import ChartToggle from '../components/ChartToggle'

/** Review → Year: a whole year by month and by category, and the family's goals. */
export default function YearTab({ tags, choice, setChoice }: { tags: Tag[]; choice: string[]; setChoice: (c: string[]) => void }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [data, setData] = useState<{ model: YearModel; split: YearBreakdown } | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [cats, setCats] = useState<Category[]>([])
  const [allTime, setAllTime] = useState<{ total: number; n: number } | null>(null)
  const [chart, setChart] = useChart()
  const { goals, contribs } = useGoals()
  const wide2 = useWide(900)

  const filtered = choice.length > 0
  const choiceKey = choice.join(',')

  useEffect(() => {
    let alive = true
    setBusy(true)
    const { ids, untagged } = splitChoice(choice)
    // with a tag chosen the database adds up only those expenses; the budgets are left out (a budget covers all spending)
    const summary = filtered ? supabase.rpc('year_summary_by_tag', { y: year, tag_ids: ids, include_untagged: untagged }) : supabase.rpc('year_summary', { y: year })
    Promise.all([summary, supabase.from('categories').select('*')]).then(([s, c]) => {
      if (!alive) return
      if (s.error || c.error) setError((s.error ?? c.error)!.message)
      else {
        setError('')
        const rows = (s.data ?? []) as SummaryRow[], all = (c.data ?? []) as Category[]
        const used = filtered ? all.map(x => ({ ...x, budget_cents: 0 })) : all
        setCats(all)
        setData({ model: yearModel(rows, used), split: yearBreakdown(rows, used) })
      }
      setBusy(false)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, choiceKey, version])

  useEffect(() => { // what carries the chosen tags over all time
    if (!filtered) return setAllTime(null)
    let alive = true
    const { ids, untagged } = splitChoice(choice)
    void supabase.rpc('tags_total', { tag_ids: ids, include_untagged: untagged }).then(r => { const x = (r.data as { total_cents: number; n: number }[] | null)?.[0]; if (alive && !r.error && x) setAllTime({ total: Number(x.total_cents), n: Number(x.n) }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceKey, version])

  const monthsCounted = year === thisYear ? new Date().getMonth() + 1 : 12
  const active = goals.filter(g => g.status === 'active')
  const shown = chart === 'flow' ? 'pie' : chart // the flow diagram is for one month
  const about = filtered ? ` tagged ${describeChoice(choice, tags)}` : ''
  const mixTotals = useMemo(() => data?.split.mix.map(m => m.cents.reduce((a, b) => a + b, 0)) ?? [], [data])

  if (error) return <p className="error">Could not load the year: {error}. Has the latest SQL migration been run?</p>
  if (!data) return <p className="muted center-text">Loading…</p>
  const { model, split } = data
  const shares = split.slices.map(s => `${s.name} ${s.pct.toFixed(1)}%`).join(', ')

  return (
    <div style={{ opacity: busy ? 0.6 : 1, transition: 'opacity .15s' }}>
      <div className="stepper">
        <button aria-label="Previous year" onClick={() => setYear(year - 1)} disabled={year <= thisYear - 10}>‹</button>
        <strong>{year}</strong>
        <button aria-label="Next year" onClick={() => setYear(year + 1)} disabled={year >= thisYear}>›</button>
      </div>

      <TagFilter tags={tags} choice={choice} onChange={setChoice} />
      <section className="card rv-hero-row">
        <div><p className="muted">Spent in {year}{about}</p>
        <div className="hero">{euroWhole(model.total)}</div></div>
        <div className="tiles">
          <div className="tile"><span className="muted small">Everyday</span><b>{euroWhole(model.everyday)}</b></div>
          <div className="tile"><span className="muted small">{filtered ? 'Yearly bills and annual fees with these tags' : 'Yearly bills'}</span><b>{euroWhole(model.bills)}</b></div>
          <div className="tile"><span className="muted small">Everyday per month</span><b>{euroWhole(Math.round(model.everyday / monthsCounted))}</b></div>
          <div className="tile"><span className="muted small">Busiest month</span><b>{model.topMonth ? `${MONTHS[model.topMonth.month - 1]} · ${euroWhole(model.topMonth.total)}` : '–'}</b></div>
        </div>
      </section>
      <p className="muted small">Monthly fees (like a subscription) are counted as Everyday, in the month they were charged. Yearly, half-yearly and quarterly bills and annual fees are shown separately.{filtered ? ' While a tag is chosen, budgets, How the mix changed and Goals are hidden.' : ''}</p>

      {filtered && allTime && <p className="bd-alltime">All time: <b>{euroTidy(allTime.total)}</b> in {allTime.n} {allTime.n === 1 ? 'expense' : 'expenses'}, yearly bills included</p>}
      <section className="card">
        <h2>Where the money went</h2>
        {split.total === 0 ? <p className="muted">{filtered ? `No everyday spending${about} recorded in ${year}.` : `No everyday spending recorded in ${year} yet.`}</p> : (
          <>
            <ChartToggle value={shown} onChange={setChart} />
            <div className="rv-where">
            {shown === 'pie'
              ? <PieChart slices={split.slices} label={`Pie chart of everyday spending in ${year}: ${shares}`} />
              : <div className="rv-bars"><ShareBar slices={split.slices} label={`Share of the year's spending: ${shares}`} /><CategoryBars categories={model.categories} /></div>}
            <div className="rv-list">
            {split.slices.map(s => (
              <div key={s.id} className="bd-item">
                <div className="bd-row static">
                  <span className="bd-dot" style={{ background: s.color }} aria-hidden="true" />
                  <span className="bd-main"><span className="bd-name">{s.emoji && `${s.emoji} `}{s.name}</span><span className="muted small">{euroTidy(Math.round(s.cents / monthsCounted))} a month</span></span>
                  <span className="bd-nums"><b>{euroTidy(s.cents)}</b><span className="muted small">{s.pct.toFixed(1)}%</span></span>
                </div>
              </div>
            ))}
            </div>
            </div>
            {split.separateBills > 0 ? <p className="muted small bd-apart">Yearly bills and annual fees{about} ({euroTidy(split.separateBills)}) are kept apart. <Link to="/plan">See in Plan</Link></p> : filtered && <p className="muted small bd-apart">No yearly bills or annual fees{about} in {year}.</p>}
          </>
        )}
      </section>

      <section className="card"><h2>Spending by month</h2><MonthlyChart model={model} year={year} wide={wide2} /></section>

      {filtered && <TaggedExpenses from={`${year}-01-01`} to={`${year + 1}-01-01`} choice={choice} title={`Expenses${about}`} cats={cats} version={version} onChanged={() => setVersion(v => v + 1)} />}
      <div className="rv-pair">
      {!filtered && split.total > 0 && (
        <section className="card">
          <h2>How the mix changed</h2>
          <p className="muted small">Each column is one month, split by each category's share of that month's spending.</p>
          <div className="bd-mix" role="img" aria-label="Monthly share of spending by category">
            {split.mix.map((m, mi) => {
              const tot = mixTotals[mi]
              return (
                <div key={m.month} className="bd-col" style={{ opacity: tot === 0 ? 0.15 : 1 }} title={tot === 0 ? undefined : `${MONTHS[m.month - 1]}: ${split.slices.map((s, i) => `${s.name} ${Math.round((m.cents[i] / tot) * 100)}%`).join(', ')}`}>
                  {tot === 0 ? <div style={{ flex: 1, background: '#9aa8a3' }} /> : [...split.slices.keys()].reverse().filter(i => m.cents[i] > 0).map(i => <div key={i} style={{ flex: `${m.cents[i]} 1 0%`, background: split.slices[i].color }} />)}
                </div>
              )
            })}
          </div>
          <div className="bd-months" aria-hidden="true">{MONTHS.map((n, i) => <span key={i}>{n[0]}</span>)}</div>
        </section>
      )}

      {!filtered && active.length > 0 && (
        <section className="card">
          <h2>Goals</h2>
          <p className="muted small">Progress today, whichever year is open.</p>
          {active.map(g => {
            const raised = contribs.filter(c => c.goal_id === g.id).reduce((s, c) => s + c.amount_cents, 0)
            const pct = Math.round((raised / g.target_cents) * 100)
            return (
              <div key={g.id}>
                <div className="goal-line"><span>{g.emoji} {g.name}</span><span><b>{euroTidy(raised)}</b> of {euroTidy(g.target_cents)} ({pct}%)</span></div>
                <div className="bar" role="img" aria-label={`${g.name}: ${pct}% of the goal`}><div className="fill ok" style={{ width: `${Math.min(100, pct)}%` }} /></div>
              </div>
            )
          })}
          <Link className="bd-link" to="/goals">Open Goals ›</Link>
        </section>
      )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { euroWhole } from '../lib/money'
import { MONTHS } from '../lib/bills'
import { yearModel, type SummaryRow, type YearModel } from '../lib/year'
import { CategoryBars, MonthlyChart } from '../components/charts'
import { supabase } from '../lib/supabase'
import { euro } from '../lib/money'
import { review, type Review as R } from '../lib/review'
import { useGoals } from '../lib/goals'
import type { Category, Expense } from '../lib/types'

const PROMPTS = [
  'What is one thing we are proud of this month?',
  'Which purchase was worth it, and which was not?',
  'What could each of us do to reach our goal sooner?',
  'Is there a subscription or habit we could pause?',
  'What would we like to spend less time worrying about next month?',
]

function MonthReview() {
  const [r, setR] = useState<R | null>(null)
  const [error, setError] = useState('')
  const { goals, contribs } = useGoals()

  useEffect(() => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('sv')
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('sv')
    Promise.all([
      supabase.from('categories').select('*'),
      supabase.from('expenses').select('*').gte('spent_on', from).lt('spent_on', to),
    ]).then(([c, e]) => {
      if (c.error || e.error) return setError((c.error ?? e.error)!.message)
      setR(review(((e.data ?? []) as Expense[]).filter(x => !x.bill_id), (c.data ?? []) as Category[]))
    })
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!r) return <p className="muted center-text">Loading…</p>
  const month = new Date().toLocaleDateString('en-IE', { month: 'long' })
  const active = goals.filter(g => g.status === 'active')
  const nothing = !r.less.length && !r.more.length && !r.underBudget.length

  return (
    <>
      <section className="card">
        <p className="muted">{month} so far, compared with the same days last month · everyday spending (yearly bills are in the Year view)</p>
        <div className="big">{euro(r.totalNow)}</div>
        {r.totalPct === null
          ? <p className="muted">No spending last month to compare with yet.</p>
          : r.totalPct <= 0
            ? <p className="good">{r.totalPct === 0 ? 'The same as last month.' : `${Math.abs(r.totalPct)}% less than last month 🎉`} ({euro(r.totalBefore)})</p>
            : <p>{r.totalPct}% more than last month ({euro(r.totalBefore)})</p>}
      </section>

      {r.less.length > 0 && (
        <section className="card">
          <h2>🎉 Wins</h2>
          {r.less.map(c => <p key={c.name}>{c.emoji} We spent {c.pct === null ? 'less' : `${Math.abs(c.pct)}% less`} on <strong>{c.name}</strong> ({euro(c.before - c.now)} saved)</p>)}
        </section>
      )}
      {r.underBudget.length > 0 && (
        <section className="card">
          <h2>👍 Comfortably within budget</h2>
          {r.underBudget.map(c => <p key={c.name}>{c.emoji} {c.name}: {euro(c.left)} still to spend</p>)}
        </section>
      )}
      {r.more.length > 0 && (
        <section className="card">
          <h2>👀 Worth a look</h2>
          {r.more.map(c => <p key={c.name}>{c.emoji} <strong>{c.name}</strong> is up {c.pct === null ? 'from nothing' : `${c.pct}%`} ({euro(c.now - c.before)} more). Planned, or a surprise?</p>)}
        </section>
      )}
      {nothing && <section className="card"><p className="muted">Not enough spending yet to highlight anything. Check back later in the month.</p></section>}

      {active.length > 0 && (
        <section className="card">
          <h2>🎯 Goals</h2>
          {active.map(g => {
            const raised = contribs.filter(c => c.goal_id === g.id).reduce((s, c) => s + c.amount_cents, 0)
            return <p key={g.id}>{g.emoji} {g.name}: {euro(raised)} of {euro(g.target_cents)} ({Math.round((raised / g.target_cents) * 100)}%)</p>
          })}
        </section>
      )}

      <section className="card">
        <h2>💬 For your family meeting</h2>
        <p>{PROMPTS[new Date().getMonth() % PROMPTS.length]}</p>
        <p className="muted small">Celebrate what went well first. Money talks work best when nobody feels blamed.</p>
      </section>
    </>
  )
}

export default function Review() {
  const [tab, setTab] = useState<'month' | 'year'>('month')
  return (
    <>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'month'} className={tab === 'month' ? 'on' : ''} onClick={() => setTab('month')}>This month</button>
        <button role="tab" aria-selected={tab === 'year'} className={tab === 'year' ? 'on' : ''} onClick={() => setTab('year')}>Year</button>
      </div>
      {tab === 'month' ? <MonthReview /> : <YearView />}
    </>
  )
}

function YearView() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [model, setModel] = useState<YearModel | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setBusy(true)
    Promise.all([supabase.rpc('year_summary', { y: year }), supabase.from('categories').select('*')]).then(([s, c]) => {
      if (!alive) return
      if (s.error || c.error) setError((s.error ?? c.error)!.message)
      else { setError(''); setModel(yearModel((s.data ?? []) as SummaryRow[], (c.data ?? []) as Category[])) }
      setBusy(false)
    })
    return () => { alive = false }
  }, [year])

  if (error) return <p className="error">Could not load the year: {error}. Has the latest SQL migration been run?</p>
  if (!model) return <p className="muted center-text">Loading…</p>
  const monthsCounted = year === thisYear ? new Date().getMonth() + 1 : 12

  return (
    <div style={{ opacity: busy ? 0.6 : 1, transition: 'opacity .15s' }}>
      <div className="stepper">
        <button aria-label="Previous year" onClick={() => setYear(year - 1)} disabled={year <= thisYear - 10}>‹</button>
        <strong>{year}</strong>
        <button aria-label="Next year" onClick={() => setYear(year + 1)} disabled={year >= thisYear}>›</button>
      </div>

      <section className="card">
        <p className="muted">Spent in {year}</p>
        <div className="hero">{euroWhole(model.total)}</div>
        <div className="tiles">
          <div className="tile"><span className="muted small">Everyday</span><b>{euroWhole(model.everyday)}</b></div>
          <div className="tile"><span className="muted small">Yearly bills</span><b>{euroWhole(model.bills)}</b></div>
          <div className="tile"><span className="muted small">Everyday per month</span><b>{euroWhole(Math.round(model.everyday / monthsCounted))}</b></div>
          <div className="tile"><span className="muted small">Busiest month</span><b>{model.topMonth ? `${MONTHS[model.topMonth.month - 1]} · ${euroWhole(model.topMonth.total)}` : '–'}</b></div>
        </div>
      </section>

      <section className="card"><h2>Spending by month</h2><MonthlyChart model={model} year={year} /></section>
      <section className="card"><h2>Everyday spending by category</h2><CategoryBars categories={model.categories} /></section>
    </div>
  )
}

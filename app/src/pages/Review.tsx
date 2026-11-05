import { useEffect, useState } from 'react'
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

export default function Review() {
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
      setR(review((e.data ?? []) as Expense[], (c.data ?? []) as Category[]))
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
        <p className="muted">{month} so far, compared with the same days last month</p>
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

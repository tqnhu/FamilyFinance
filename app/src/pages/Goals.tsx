import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { euro, parseEuro } from '../lib/money'
import { estimate, neededPerWeek, useGoals, type Contribution, type Goal } from '../lib/goals'
import Sheet from '../components/Sheet'

const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Goals() {
  const { member } = useAuth()
  const { goals, contribs, names, loading, error, reload } = useGoals()
  const [saveBal, setSaveBal] = useState(0)
  const [sheet, setSheet] = useState<{ kind: 'new' } | { kind: 'add'; goal: Goal } | null>(null)
  const isParent = member?.role === 'parent'

  useEffect(() => {
    if (isParent) return
    supabase.from('jar_balances').select('balance_cents').eq('jar', 'save').maybeSingle().then(r => setSaveBal(r.data?.balance_cents ?? 0))
  }, [isParent, goals, contribs])

  if (loading) return <p className="muted center-text">Loading…</p>
  if (error) return <p className="error">Could not load goals: {error}. Has the latest SQL migration been run?</p>
  const active = goals.filter(g => g.status === 'active')
  const reached = goals.filter(g => g.status === 'reached')

  async function cancel(g: Goal) {
    if (!confirm(`Cancel "${g.name}"? Money kids put in from their Save jar goes back to them.`)) return
    const { error } = await supabase.rpc('cancel_goal', { goal: g.id })
    if (error) alert(error.message)
    void reload()
  }

  return (
    <>
      {isParent && <button className="primary" onClick={() => setSheet({ kind: 'new' })}>＋ New family goal</button>}
      {!active.length && <section className="card"><h2>No goals yet</h2><p className="muted">{isParent ? 'Create a goal everyone can save towards: a holiday, a game console, an emergency fund.' : 'Ask a parent to start a family goal, then you can add money from your Save jar.'}</p></section>}
      {active.map(g => (
        <GoalCard key={g.id} goal={g} contribs={contribs.filter(c => c.goal_id === g.id)} names={names}
          onAdd={() => setSheet({ kind: 'add', goal: g })} onCancel={isParent ? () => cancel(g) : undefined} isParent={isParent} />
      ))}
      {reached.length > 0 && (
        <section className="card">
          <h2>🏆 Reached together</h2>
          {reached.map(g => <div key={g.id} className="row item"><span>{g.emoji} {g.name}</span><span className="muted">{euro(g.target_cents)} · {g.reached_on && fmtDate(g.reached_on)}</span></div>)}
        </section>
      )}
      {sheet?.kind === 'new' && <NewGoal onClose={() => setSheet(null)} onDone={() => { setSheet(null); void reload() }} />}
      {sheet?.kind === 'add' && (
        <AddToGoal goal={sheet.goal} raised={sum(contribs.filter(c => c.goal_id === sheet.goal.id))} isParent={isParent} saveBal={saveBal}
          onClose={() => setSheet(null)} onDone={() => { setSheet(null); void reload() }} />
      )}
    </>
  )
}

const sum = (cs: Contribution[]) => cs.reduce((s, c) => s + c.amount_cents, 0)

function GoalCard({ goal, contribs, names, onAdd, onCancel, isParent }:
  { goal: Goal; contribs: Contribution[]; names: Record<string, string>; onAdd: () => void; onCancel?: () => void; isParent: boolean }) {
  const [extra, setExtra] = useState(0) // what-if: extra euros per week
  const raised = sum(contribs)
  const remaining = goal.target_cents - raised
  const pct = Math.min(100, Math.round((raised / goal.target_cents) * 100))
  const est = estimate(contribs, remaining)
  const what = estimate(contribs, remaining, new Date(), extra * 100)
  const need = neededPerWeek(remaining, goal.deadline)
  const byPerson = Object.entries(contribs.reduce<Record<string, number>>((m, c) => ({ ...m, [c.member_id]: (m[c.member_id] ?? 0) + c.amount_cents }), {}))
    .sort((a, b) => b[1] - a[1])

  return (
    <section className="card">
      <div className="row"><h2>{goal.emoji} {goal.name}</h2><strong>{pct}%</strong></div>
      <div className="bar big"><div className="fill ok" style={{ width: `${pct}%` }} /></div>
      <div className="row"><span>{euro(raised)} saved</span><span className="muted">goal {euro(goal.target_cents)}</span></div>
      {byPerson.length > 0 && <p className="small muted">Team: {byPerson.map(([id, c]) => `${names[id] ?? '?'} ${euro(c)}`).join(' · ')}</p>}

      <div className="estimate">
        {est ? <p>📅 At our current pace: about <strong>{Math.ceil(est.weeksLeft)} {Math.ceil(est.weeksLeft) === 1 ? 'week' : 'weeks'}</strong> ({fmtDate(est.date)})</p>
             : <p className="muted">Add some money to see when we'll get there.</p>}
        {goal.deadline && need !== null && (
          <p className="small">Target date {fmtDate(goal.deadline)}: needs <strong>{euro(Math.ceil(need))}</strong> a week
            {est && (est.perWeek >= need ? <span className="good"> · on track ✓</span> : <span className="muted"> · a little behind, you can catch up!</span>)}</p>
        )}
        <label className="small">What if we add {extra > 0 ? <strong>{euro(extra * 100)}</strong> : 'a bit'} more each week?
          <input type="range" min={0} max={50} step={1} value={extra} onChange={e => setExtra(Number(e.target.value))} />
        </label>
        {extra > 0 && what && <p className="good">→ We'd get there around <strong>{fmtDate(what.date)}</strong>{est && what.date < est.date ? ` (${Math.round((est.date.getTime() - what.date.getTime()) / 86_400_000)} days sooner!)` : ''}</p>}
      </div>

      <div className="btn-row">
        <button className="primary" onClick={onAdd}>{isParent ? '＋ Add money' : '🐷 Add from my Save jar'}</button>
        {onCancel && <button onClick={onCancel}>Cancel goal</button>}
      </div>
    </section>
  )
}

function NewGoal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎯')
  const [target, setTarget] = useState('')
  const [deadline, setDeadline] = useState('')
  const [err, setErr] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuro(target)
    if (!name.trim()) return setErr('Give the goal a name.')
    if (!cents || cents < 100) return setErr('The target must be at least €1.')
    const { error } = await supabase.rpc('create_goal', { in_name: name, in_emoji: emoji, target: cents, in_deadline: deadline || null })
    if (error) setErr(error.message); else onDone()
  }
  return (
    <Sheet title="New family goal" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="chips">{['🏖️', '🎮', '💻', '🚲', '🎁', '🏠', '🎯'].map(x => <button type="button" key={x} className={`chip ${emoji === x ? 'on' : ''}`} onClick={() => setEmoji(x)}>{x}</button>)}</div>
        <label>Name<input autoFocus maxLength={60} placeholder="Summer holiday" value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Target (€)<input inputMode="decimal" placeholder="1500" value={target} onChange={e => setTarget(e.target.value)} /></label>
        <label>Target date (optional)<input type="date" min={new Date(Date.now() + 86_400_000).toLocaleDateString('sv')} value={deadline} onChange={e => setDeadline(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Create goal</button>
      </form>
    </Sheet>
  )
}

function AddToGoal({ goal, raised, isParent, saveBal, onClose, onDone }:
  { goal: Goal; raised: number; isParent: boolean; saveBal: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const left = goal.target_cents - raised
  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuro(amount)
    if (!cents) return setErr('Type how much.')
    const { error } = isParent
      ? await supabase.rpc('contribute_cash', { goal: goal.id, cents })
      : await supabase.rpc('contribute_from_save', { goal: goal.id, cents })
    if (error) setErr(error.message); else onDone()
  }
  return (
    <Sheet title={`${goal.emoji} ${goal.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">Still needed: {euro(left)}{!isParent && ` · your Save jar: ${euro(saveBal)}`}</p>
        <label>Amount (€)<input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        {!isParent && <p className="muted small">This moves the money out of your Save jar for good, unless the goal is cancelled.</p>}
        {err && <p className="error">{err}</p>}
        <button className="primary">Add to goal</button>
      </form>
    </Sheet>
  )
}

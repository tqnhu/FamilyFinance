import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { getLocal, removeLocal, setLocal } from '../lib/local'
import { useInstall } from '../lib/install'
import { budgetsChanged, budgetsConfirmedKey, checklistSteps, jarsVisitedKey, progress, startHiddenKey, type Facts, type Step } from '../lib/checklist'
import Bar from './Bar'

/**
 * "Get started" card for the top of Home. It works out what is already done from the family's own data, links each step to the
 * screen where it happens, and goes away once the essentials are done (or when dismissed).
 */
export default function GettingStarted({ onAddExpense, version }: { onAddExpense: () => void; version: number }) {
  const { member } = useAuth()
  const install = useInstall()
  const [hidden, setHidden] = useState(() => (member ? getLocal(startHiddenKey(member.user_id)) === '1' : true))
  const [facts, setFacts] = useState<Facts | null>(null)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [confirmed, setConfirmed] = useState(() => (member ? getLocal(budgetsConfirmedKey(member.user_id)) === '1' : false))

  const load = useCallback(async () => {
    if (!member) return
    const count = (q: PromiseLike<{ count: number | null }>) => q.then(r => r.count ?? 0)
    const isParent = member.role === 'parent'
    const [expenses, people, allowances, bills, cats] = await Promise.all([
      count(supabase.from('expenses').select('id', { count: 'exact', head: true })),
      supabase.from('members').select('role'),
      isParent ? count(supabase.from('allowances').select('child_id', { count: 'exact', head: true }).gt('weekly_cents', 0)) : Promise.resolve(0),
      isParent ? count(supabase.from('bills').select('id', { count: 'exact', head: true })) : Promise.resolve(0),
      isParent ? supabase.from('categories').select('name, budget_cents, archived') : Promise.resolve({ data: [] as { name: string; budget_cents: number; archived: boolean }[] }),
    ])
    const list = people.data ?? []
    setFacts({
      role: member.role, expenses, members: list.length, children: list.filter(p => p.role === 'child').length, allowances, bills,
      budgetsChanged: budgetsChanged(cats.data ?? []), budgetsConfirmed: confirmed, standalone: install.standalone,
      jarsVisited: getLocal(jarsVisitedKey(member.user_id)) === '1',
    })
  }, [member, confirmed, install.standalone])

  useEffect(() => { if (!hidden) void load() }, [hidden, load, version])

  if (!member || hidden || !facts) return null
  const steps = checklistSteps(facts)
  const { done, total, complete } = progress(steps)
  if (complete) return null

  function hide() { setLocal(startHiddenKey(member!.user_id), '1'); setHidden(true) }
  function confirmBudgets() { setLocal(budgetsConfirmedKey(member!.user_id), '1'); setConfirmed(true) }

  function act(s: Step) {
    if (s.action === 'add-expense') return <button onClick={onAddExpense}>Add expense</button>
    if (s.action === 'install') {
      return install.canPrompt
        ? <button onClick={() => void install.prompt()}>Install</button>
        : <button onClick={() => setShowInstallHelp(!showInstallHelp)}>{showInstallHelp ? 'Hide steps' : 'How?'}</button>
    }
    return null
  }

  return (
    <section className="card start" aria-labelledby="start-title">
      <div className="row">
        <h2 id="start-title">Get started</h2>
        <button className="link small" onClick={hide}>Hide</button>
      </div>
      <Bar spent={done} budget={total} label={`${done} of ${total} done`} />
      <ul className="start-list">
        {steps.map(s => (
          <li key={s.id} className={`start-item ${s.done ? 'done' : ''}`}>
            <span className="start-mark" aria-hidden>{s.done ? '✓' : '○'}</span>
            <div className="grow">
              <div className="start-title"><span className="sr-only">{s.done ? 'Done: ' : 'To do: '}</span>{s.title}{s.optional && <span className="tag">optional</span>}</div>
              {!s.done && <div className="muted small">{s.help}</div>}
              {s.id === 'install' && !s.done && showInstallHelp && !install.canPrompt && (
                <div className="small">On iPhone: tap the Share button, then "Add to Home Screen". On Android or a computer: open the browser menu and choose "Install app" or "Add to Home screen".</div>
              )}
            </div>
            {!s.done && (
              <div className="start-actions">
                {act(s)}
                {s.to && <Link className="btn-link" to={s.to}>{s.id === 'budgets' ? 'Open budgets' : 'Go'}</Link>}
                {s.action === 'confirm-budgets' && <button className="link small" onClick={confirmBudgets}>They look right</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** For Settings: bring the checklist back after it was hidden. */
export function showChecklistAgain(userId: string) { removeLocal(startHiddenKey(userId)) }

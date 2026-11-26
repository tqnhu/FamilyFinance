import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { euro } from '../lib/money'
import { chunk } from '../lib/expense'
import { applyBatches, tidyCandidates, undoBatches, type Batch, type Candidate } from '../lib/tidy'
import { useHistory } from '../lib/useHistory'
import { useRules } from '../lib/rules'
import type { Category, Expense } from '../lib/types'

const REQUEST_SIZE = 100 // ids per request: each one is written into the URL
const LIMIT = 500

type Source = Pick<Expense, 'id' | 'note' | 'amount_cents' | 'spent_on' | 'category_id' | 'tag_id' | 'annual_fee'>
const chipOf = (s: Candidate['source']) => (s === 'history' ? ['learned', 'Learned'] : ['rule', 'Rule'])

/** Plan → Rules → Tidy up Other: move past expenses out of Other with a preview, and undo it straight afterwards. */
export default function TidyUp({ onBack }: { onBack: () => void }) {
  const [cats, setCats] = useState<Category[] | null>(null)
  const [expenses, setExpenses] = useState<Source[] | null>(null)
  const [error, setError] = useState('')
  const [choice, setChoice] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ moved: Candidate[]; undone: boolean } | null>(null)
  const { history } = useHistory()
  const { rules } = useRules()

  const other = cats?.find(c => c.name.trim().toLowerCase() === 'other') ?? null

  const load = useCallback(async (c: Category[]) => {
    const o = c.find(x => x.name.trim().toLowerCase() === 'other')
    if (!o) return setExpenses([])
    const { data, error: e } = await supabase.from('expenses').select('id, note, amount_cents, spent_on, category_id, tag_id, annual_fee')
      .eq('category_id', o.id).is('bill_id', null).order('spent_on', { ascending: false }).limit(LIMIT)
    if (e) return setError(e.message)
    setExpenses((data ?? []) as Source[])
  }, [])
  useEffect(() => {
    void supabase.from('categories').select('*').order('name').then(r => {
      if (r.error) return setError(r.error.message)
      const c = (r.data ?? []) as Category[]; setCats(c); void load(c)
    })
  }, [load])

  const found = useMemo(() => (cats && expenses && other ? tidyCandidates(expenses, cats.filter(c => !c.archived), other.id, history, rules) : null), [cats, expenses, other, history, rules])
  const rows = found?.rows ?? []
  const isOn = (r: Candidate) => choice[r.id] ?? r.confidence === 'high' // the sure ones are ticked to start with, the others only offered
  const picked = rows.filter(isOn)
  const catName = (id: string) => cats?.find(c => c.id === id)?.name ?? '?'

  async function run(batches: Batch[], expected: number): Promise<{ changed: Set<string>; problem: string }> {
    const changed = new Set<string>()
    for (const b of batches) for (const part of chunk(b.ids, REQUEST_SIZE)) {
      const { data, error: e } = await supabase.from('expenses').update(b.patch).in('id', part).select('id')
      if (e) return { changed, problem: `Changed ${changed.size} of ${expected} before an error: ${e.message}` }
      for (const r of data ?? []) changed.add(r.id as string)
    }
    return { changed, problem: '' }
  }

  async function move() {
    if (!picked.length || !cats) return
    setBusy(true); setError('')
    const { changed, problem } = await run(applyBatches(picked), picked.length)
    const moved = picked.filter(r => changed.has(r.id))
    setDone(moved.length ? { moved, undone: false } : null)
    if (problem) setError(problem)
    else if (moved.length < picked.length) setError(`${picked.length - moved.length} could not be changed (they may have been changed or removed meanwhile).`)
    setChoice({}); await load(cats); setBusy(false)
  }
  async function undo() {
    if (!done || !cats) return
    setBusy(true); setError('')
    const { changed, problem } = await run(undoBatches(done.moved), done.moved.length)
    if (problem) setError(problem)
    else if (changed.size < done.moved.length) setError(`${done.moved.length - changed.size} could not be put back.`)
    setDone({ moved: done.moved, undone: true }); await load(cats); setBusy(false)
  }

  return (
    <>
      <div className="row"><button className="link" onClick={onBack}>← Back to Rules</button></div>
      <h2 className="tidy-title">Tidy up Other</h2>

      {done && (
        <section className="card attention" role="status">
          {done.undone
            ? <><h2>Put back</h2><p className="muted small">The {done.moved.length} expenses are in Other again.</p></>
            : <><h2>Moved {done.moved.length} {done.moved.length === 1 ? 'expense' : 'expenses'} out of Other</h2>
              <p className="muted small">Changed your mind? You can undo this right now. Once you leave this screen, change them one by one on Home. They will show as edited by you.</p>
              <button onClick={() => void undo()} disabled={busy}>Undo this move</button></>}
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {!cats || !expenses || !found ? (error ? null : <p className="muted center-text">Loading…</p>) : !other ? (
        <section className="card"><p className="muted">You have no category called Other, so there is nothing to tidy.</p></section>
      ) : expenses.length === 0 ? (
        <section className="card"><h2>Nothing in Other</h2><p className="muted">No expenses are filed under Other. Nice and tidy.</p></section>
      ) : (
        <>
          <section className="card">
            <div className="big">{expenses.length}{expenses.length === LIMIT ? '+' : ''}</div>
            <p>{expenses.length === 1 ? 'expense is' : 'expenses are'} in Other. We have a suggestion for <strong>{rows.length}</strong>.</p>
            <p className="muted small">The sure ones are ticked. Untick any you disagree with, then press the button. Nothing changes until you do.</p>
            {found.none > 0 && <p className="muted small">{found.none} {found.none === 1 ? 'has' : 'have'} no suggestion. Make a rule for them in Plan, Rules and they will appear here.</p>}
          </section>

          {rows.length > 0 && (
            <section className="card">
              <div className="btn-row">
                <button onClick={() => setChoice(Object.fromEntries(rows.map(r => [r.id, true])))}>Select all</button>
                <button onClick={() => setChoice(Object.fromEntries(rows.map(r => [r.id, false])))}>Select none</button>
              </div>
              {rows.map(r => {
                const [cls, label] = chipOf(r.source)
                return (
                  <label key={r.id} className={`tidy-row ${isOn(r) ? '' : 'off'}`}>
                    <input type="checkbox" checked={isOn(r)} aria-label={`Move ${r.note} (${euro(r.amount_cents)}) to ${catName(r.categoryId)}`} onChange={e => setChoice(c => ({ ...c, [r.id]: e.target.checked }))} />
                    <span className="tidy-main"><strong className="imp-note">{r.note}</strong><span className="muted small">{r.spent_on} · {euro(r.amount_cents)}</span>
                      <span className="muted small">{r.why}</span></span>
                    <span className="tidy-to"><strong>{catName(r.categoryId)}</strong><span className={`chip-label ${cls}`}>{label}{r.confidence === 'medium' ? ', maybe' : ''}</span></span>
                  </label>
                )
              })}
              <button className="primary" disabled={busy || picked.length === 0} onClick={() => void move()}>{busy ? 'Working…' : `Move ${picked.length} ${picked.length === 1 ? 'expense' : 'expenses'}`}</button>
            </section>
          )}
        </>
      )}
    </>
  )
}

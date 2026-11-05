import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { euro, parseEuro } from '../lib/money'
import { JARS, zero, type JarData } from '../lib/jars'
import type { Jar } from '../lib/types'
import Sheet from './Sheet'
import Badges from './Badges'

const STATUS = { pending: '⏳ Waiting', approved: '✅ Yes!', declined: '❌ Not now', cancelled: '↩️ Cancelled' }

export default function ChildView({ childId, data, onChange, asParent = false }:
  { childId: string; data: JarData; onChange: () => void; asParent?: boolean }) {
  const [sheet, setSheet] = useState<'move' | 'ask' | null>(null)
  const bal = data.balances[childId] ?? zero
  const al = data.allowances[childId]
  const reqs = data.requests.filter(r => r.child_id === childId)
  const entries = data.entries.filter(e => e.child_id === childId).slice(0, 12)

  async function cancel(id: string) {
    await supabase.rpc('cancel_request', { req: id })
    onChange()
  }

  return (
    <>
      <div className="jars">
        {JARS.map(j => (
          <div key={j.id} className={`jar ${j.id}`}>
            <div className="jar-emoji">{j.emoji}</div>
            <div className="jar-amt">{euro(bal[j.id])}</div>
            <div className="jar-name">{j.label}</div>
          </div>
        ))}
      </div>
      {al && al.weekly_cents > 0 && (
        <p className="muted small center-text">Weekly allowance {euro(al.weekly_cents)} · next payday {al.next_pay_on}</p>
      )}
      {!asParent && (
        <div className="actions">
          <button className="primary big-btn" onClick={() => setSheet('ask')}>🛒 Ask to buy something</button>
          <button className="big-btn" onClick={() => setSheet('move')}>➡️ Move money to Save or Give</button>
        </div>
      )}

      <Badges childId={asParent ? childId : undefined} />

      {reqs.length > 0 && (
        <section className="card">
          <h2>{asParent ? 'Requests' : 'My requests'}</h2>
          {reqs.slice(0, 8).map(r => (
            <div key={r.id} className="row item">
              <div>
                <div>{r.item} · {euro(r.amount_cents)}</div>
                <div className="muted small">{STATUS[r.status]}{r.decision_note && ` · “${r.decision_note}”`}</div>
              </div>
              {!asParent && r.status === 'pending' && <button className="link small" onClick={() => cancel(r.id)}>cancel</button>}
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Recent</h2>
        {entries.length === 0 && <p className="muted">Nothing yet.</p>}
        {entries.map(e => (
          <div key={e.id} className="row item">
            <div>
              <div>{JARS.find(j => j.id === e.jar)?.emoji} {label(e.kind, e.note)}</div>
              <div className="muted small">{new Date(e.created_at).toLocaleDateString('en-IE')}</div>
            </div>
            <strong className={e.amount_cents < 0 ? 'neg' : 'pos'}>{e.amount_cents > 0 ? '+' : ''}{euro(e.amount_cents)}</strong>
          </div>
        ))}
      </section>

      {sheet === 'move' && <MoveSheet bal={bal} matchPct={al?.match_pct ?? 0} onClose={() => setSheet(null)} onDone={() => { setSheet(null); onChange() }} />}
      {sheet === 'ask' && <AskSheet bal={bal} onClose={() => setSheet(null)} onDone={() => { setSheet(null); onChange() }} />}
    </>
  )
}

function label(kind: string, note: string) {
  switch (kind) {
    case 'allowance': return 'Allowance'
    case 'deposit': return note ? `Added: ${note}` : 'Money added'
    case 'adjustment': return note ? `Taken out: ${note}` : 'Money taken out'
    case 'match': return 'Parent bonus 🎉'
    case 'purchase': return `Bought: ${note}`
    default: return `Moved ${note}`
  }
}

function MoveSheet({ bal, matchPct, onClose, onDone }: { bal: Record<Jar, number>; matchPct: number; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState<'save' | 'give'>('save')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const cents = parseEuro(amount)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!cents) return setErr('Type how much.')
    const { error } = await supabase.rpc('move_money', { child: null, from_jar: 'spend', to_jar: to, cents })
    if (error) setErr(error.message); else onDone()
  }
  return (
    <Sheet title="Move money" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">From 🛍️ Spend ({euro(bal.spend)}) to:</p>
        <div className="chips">
          <button type="button" className={`chip ${to === 'save' ? 'on' : ''}`} onClick={() => setTo('save')}>🐷 Save</button>
          <button type="button" className={`chip ${to === 'give' ? 'on' : ''}`} onClick={() => setTo('give')}>🎁 Give</button>
        </div>
        <label>How much (€)<input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        {to === 'save' && matchPct > 0 && cents && <p className="good">Your parents add {matchPct}% extra: +{euro(Math.floor(cents * matchPct / 100))} 🎉</p>}
        {to === 'save' && matchPct === 0 && <p className="muted small">Money in Save stays there until a parent helps you spend it.</p>}
        {err && <p className="error">{err}</p>}
        <button className="primary">Move it</button>
      </form>
    </Sheet>
  )
}

function AskSheet({ bal, onClose, onDone }: { bal: Record<Jar, number>; onClose: () => void; onDone: () => void }) {
  const [jar, setJar] = useState<'spend' | 'give'>('spend')
  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuro(amount)
    if (!item.trim()) return setErr('What do you want to buy?')
    if (!cents) return setErr('Type how much it costs.')
    const { error } = await supabase.rpc('request_purchase', { in_jar: jar, in_item: item, cents })
    if (error) setErr(error.message); else onDone()
  }
  return (
    <Sheet title="Ask to buy" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="chips">
          <button type="button" className={`chip ${jar === 'spend' ? 'on' : ''}`} onClick={() => setJar('spend')}>🛍️ Spend ({euro(bal.spend)})</button>
          <button type="button" className={`chip ${jar === 'give' ? 'on' : ''}`} onClick={() => setJar('give')}>🎁 Give ({euro(bal.give)})</button>
        </div>
        <label>What is it?<input autoFocus maxLength={80} value={item} onChange={e => setItem(e.target.value)} /></label>
        <label>Price (€)<input inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Send to my parents</button>
      </form>
    </Sheet>
  )
}

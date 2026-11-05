import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { euro, parseEuro } from '../lib/money'
import { JARS, zero, type JarData } from '../lib/jars'
import type { Jar, Member } from '../lib/types'
import Sheet from './Sheet'
import ChildView from './ChildView'

export default function ParentView({ data, onChange }: { data: JarData; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(data.kids[0]?.user_id ?? null)
  const [sheet, setSheet] = useState<{ kind: 'money' | 'allowance'; kid: Member } | null>(null)
  const pending = data.requests.filter(r => r.status === 'pending')
  const nameOf = (id: string) => data.kids.find(k => k.user_id === id)?.display_name ?? '?'

  if (!data.kids.length) {
    return <section className="card"><h2>No kids yet</h2><p className="muted">Share the kid code from the Budgets page. When a child joins, their jars appear here.</p></section>
  }

  async function decide(id: string, approve: boolean) {
    const note = approve ? '' : (prompt('Reason (optional):') ?? '')
    const { error } = await supabase.rpc('decide_purchase', { req: id, approve, in_note: note })
    if (error) alert(error.message)
    onChange()
  }

  return (
    <>
      {pending.length > 0 && (
        <section className="card attention">
          <h2>⏳ Waiting for you ({pending.length})</h2>
          {pending.map(r => (
            <div key={r.id} className="item">
              <div><strong>{nameOf(r.child_id)}</strong> wants <strong>{r.item}</strong> · {euro(r.amount_cents)}</div>
              <div className="muted small">from {r.jar === 'give' ? '🎁 Give' : '🛍️ Spend'} jar · has {euro((data.balances[r.child_id] ?? zero)[r.jar])}</div>
              <div className="btn-row">
                <button className="primary" onClick={() => decide(r.id, true)}>Approve</button>
                <button onClick={() => decide(r.id, false)}>Decline</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.kids.map(k => {
        const b = data.balances[k.user_id] ?? zero
        const isOpen = open === k.user_id
        return (
          <section key={k.user_id} className="card">
            <button className="kid-head" onClick={() => setOpen(isOpen ? null : k.user_id)}>
              <strong>{k.display_name}</strong>
              <span className="muted">{euro(b.spend + b.save + b.give)} {isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <>
                <div className="btn-row">
                  <button onClick={() => setSheet({ kind: 'money', kid: k })}>＋ Add / remove money</button>
                  <button onClick={() => setSheet({ kind: 'allowance', kid: k })}>⚙️ Allowance</button>
                </div>
                <ChildView childId={k.user_id} data={data} onChange={onChange} asParent />
              </>
            )}
          </section>
        )
      })}

      {sheet?.kind === 'money' && <MoneySheet kid={sheet.kid} onClose={() => setSheet(null)} onDone={() => { setSheet(null); onChange() }} />}
      {sheet?.kind === 'allowance' && <AllowanceSheet kid={sheet.kid} data={data} onClose={() => setSheet(null)} onDone={() => { setSheet(null); onChange() }} />}
    </>
  )
}

function MoneySheet({ kid, onClose, onDone }: { kid: Member; onClose: () => void; onDone: () => void }) {
  const [jar, setJar] = useState<Jar>('spend')
  const [sign, setSign] = useState<1 | -1>(1)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuro(amount)
    if (!cents) return setErr('Enter an amount greater than 0.')
    const { error } = await supabase.rpc('add_money', { child: kid.user_id, in_jar: jar, cents: cents * sign, in_note: note })
    if (error) setErr(error.message); else onDone()
  }
  return (
    <Sheet title={`${kid.display_name}: add or remove money`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="chips">
          <button type="button" className={`chip ${sign === 1 ? 'on' : ''}`} onClick={() => setSign(1)}>＋ Add</button>
          <button type="button" className={`chip ${sign === -1 ? 'on' : ''}`} onClick={() => setSign(-1)}>－ Remove</button>
        </div>
        <div className="chips">
          {JARS.map(j => <button type="button" key={j.id} className={`chip ${jar === j.id ? 'on' : ''}`} onClick={() => setJar(j.id)}>{j.emoji} {j.label}</button>)}
        </div>
        <label>Amount (€)<input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Note (optional)<input maxLength={80} placeholder="e.g. birthday money" value={note} onChange={e => setNote(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Save</button>
      </form>
    </Sheet>
  )
}

function AllowanceSheet({ kid, data, onClose, onDone }: { kid: Member; data: JarData; onClose: () => void; onDone: () => void }) {
  const a = data.allowances[kid.user_id]
  const [weekly, setWeekly] = useState(a ? (a.weekly_cents / 100).toString() : '0')
  const [sp, setSp] = useState(String(a?.spend_pct ?? 50))
  const [sv, setSv] = useState(String(a?.save_pct ?? 40))
  const [gv, setGv] = useState(String(a?.give_pct ?? 10))
  const [match, setMatch] = useState(String(a?.match_pct ?? 0))
  const [err, setErr] = useState('')
  const total = Number(sp) + Number(sv) + Number(gv)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const w = Number(weekly.replace(',', '.'))
    if (!Number.isFinite(w) || w < 0 || w > 1000) return setErr('Weekly amount must be between €0 and €1000.')
    if (total !== 100) return setErr('The three percentages must add up to 100.')
    const { error } = await supabase.rpc('set_allowance', {
      child: kid.user_id, weekly_cents: Math.round(w * 100),
      spend_pct: Number(sp), save_pct: Number(sv), give_pct: Number(gv), match_pct: Number(match),
    })
    if (error) setErr(error.message); else onDone()
  }
  const pct = (v: string, set: (s: string) => void) => <input className="amt" inputMode="numeric" value={v} onChange={e => set(e.target.value.replace(/\D/g, ''))} />
  return (
    <Sheet title={`${kid.display_name}: allowance`} onClose={onClose}>
      <form onSubmit={submit}>
        <label>Weekly allowance (€)<input inputMode="decimal" value={weekly} onChange={e => setWeekly(e.target.value)} /></label>
        <p className="muted small">Split each payment (must total 100%):</p>
        <label className="row">🛍️ Spend % {pct(sp, setSp)}</label>
        <label className="row">🐷 Save % {pct(sv, setSv)}</label>
        <label className="row">🎁 Give % {pct(gv, setGv)}</label>
        <p className={total === 100 ? 'muted small' : 'error small'}>Total: {total}%</p>
        <label className="row">Match savings % {pct(match, setMatch)}</label>
        <p className="muted small">When {kid.display_name} moves money into Save, you add this % extra (0 = no match).{a ? ` Next payday: ${a.next_pay_on}.` : ' First payday: in 7 days.'}</p>
        {err && <p className="error">{err}</p>}
        <button className="primary">Save</button>
      </form>
    </Sheet>
  )
}

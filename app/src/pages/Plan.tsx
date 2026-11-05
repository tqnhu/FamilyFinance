import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { euro, euroWhole, parseEuro, today } from '../lib/money'
import { FREQ, MONTHS, dueList, monthlySetAside, useBills, yearlyCost, type Bill, type Due } from '../lib/bills'
import type { Category } from '../lib/types'
import Sheet from '../components/Sheet'

type Tab = 'budgets' | 'bills' | 'family'

export default function Plan() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'budgets'
  const go = (t: Tab) => setParams(t === 'budgets' ? {} : { tab: t })
  return (
    <>
      <div className="seg" role="tablist">
        {([['budgets', 'Budgets'], ['bills', 'Yearly bills'], ['family', 'Family']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>{label}</button>
        ))}
      </div>
      {tab === 'budgets' && <BudgetsTab />}
      {tab === 'bills' && <BillsTab />}
      {tab === 'family' && <FamilyTab />}
    </>
  )
}

const EMOJIS = ['🛒', '🍕', '🚌', '🏠', '💊', '🎮', '🧸', '📦', '👕', '📚', '🐶', '✈️', '🎁', '💡', '📱', '⚽']
const dupMsg = (code?: string, fallback = '') => (code === '23505' ? 'You already have a category with that name.' : fallback)

/* ---------------- Budgets ---------------- */

function BudgetsTab() {
  const { member } = useAuth()
  const { bills } = useBills()
  const [cats, setCats] = useState<Category[]>([])
  const [sheet, setSheet] = useState<Category | 'new' | null>(null)
  const [showOld, setShowOld] = useState(false)

  const load = () => supabase.from('categories').select('*').order('name').then(r => setCats((r.data ?? []) as Category[]))
  useEffect(() => { void load() }, [])

  const active = cats.filter(c => !c.archived), old = cats.filter(c => c.archived)
  const monthly = active.reduce((s, c) => s + c.budget_cents, 0)
  const setAside = bills.filter(b => !b.archived).reduce((s, b) => s + monthlySetAside(b), 0)

  async function setBudget(c: Category, value: string) {
    const n = Number(value.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 100000) return
    const cents = Math.round(n * 100)
    if (cents === c.budget_cents) return
    const { error } = await supabase.from('categories').update({ budget_cents: cents }).eq('id', c.id)
    if (!error) setCats(cs => cs.map(x => (x.id === c.id ? { ...x, budget_cents: cents } : x)))
  }

  return (
    <>
      <section className="card">
        <h2>Your plan</h2>
        <div className="row"><span>Everyday budgets</span><strong>{euro(monthly)} / month</strong></div>
        <div className="row"><span>Yearly bills to put aside</span><strong>{euro(setAside)} / month</strong></div>
        <div className="row item"><span>Total to plan for</span><strong>{euro(monthly + setAside)} / month</strong></div>
        <p className="muted small">That is {euroWhole((monthly + setAside) * 12)} a year. Yearly bills are not counted against the everyday budgets below.</p>
      </section>

      <section className="card">
        <h2>Monthly budget per category</h2>
        {active.map(c => (
          <div key={c.id} className="row item">
            <button className="link cat-btn" onClick={() => setSheet(c)} aria-label={`Edit ${c.name}`}>{c.emoji} {c.name} ✎</button>
            <input className="amt" inputMode="decimal" aria-label={`${c.name} monthly budget in euros`} defaultValue={(c.budget_cents / 100).toString()} onBlur={e => setBudget(c, e.target.value)} />
          </div>
        ))}
        <button className="primary" onClick={() => setSheet('new')}>＋ Add category</button>
        <p className="muted small">0 means no budget. Kids always log into the same categories.</p>
      </section>

      {old.length > 0 && (
        <section className="card">
          <button className="link" onClick={() => setShowOld(!showOld)}>{showOld ? '▲' : '▼'} Archived categories ({old.length})</button>
          {showOld && old.map(c => (
            <div key={c.id} className="row item">
              <span className="muted">{c.emoji} {c.name}</span>
              <button className="link small" onClick={async () => { await supabase.from('categories').update({ archived: false }).eq('id', c.id); void load() }}>Restore</button>
            </div>
          ))}
        </section>
      )}

      {sheet && <CategorySheet cat={sheet === 'new' ? null : sheet} familyId={member!.family_id} onClose={() => setSheet(null)} onDone={() => { setSheet(null); void load() }} />}
    </>
  )
}

function CategorySheet({ cat, familyId, onClose, onDone }: { cat: Category | null; familyId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(cat?.name ?? '')
  const [emoji, setEmoji] = useState(cat?.emoji ?? '📦')
  const [budget, setBudget] = useState(cat ? (cat.budget_cents / 100).toString() : '0')
  const [err, setErr] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = Number(budget.replace(',', '.'))
    if (!name.trim()) return setErr('Give the category a name.')
    if (!Number.isFinite(n) || n < 0 || n > 100000) return setErr('Budget must be between €0 and €100,000.')
    const row = { name: name.trim(), emoji: emoji.trim() || '📦', budget_cents: Math.round(n * 100) }
    const { error } = cat ? await supabase.from('categories').update(row).eq('id', cat.id) : await supabase.from('categories').insert({ ...row, family_id: familyId })
    if (error) setErr(dupMsg(error.code, error.message)); else onDone()
  }
  async function archive() {
    if (!cat || !confirm(`Archive "${cat.name}"? Past spending stays in your history, but it disappears from the list when adding expenses.`)) return
    const { error } = await supabase.from('categories').update({ archived: true }).eq('id', cat.id)
    if (error) setErr(error.message); else onDone()
  }
  return (
    <Sheet title={cat ? 'Edit category' : 'New category'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="chips">{EMOJIS.map(x => <button type="button" key={x} className={`chip ${emoji === x ? 'on' : ''}`} onClick={() => setEmoji(x)}>{x}</button>)}</div>
        <label>Name<input autoFocus maxLength={40} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Monthly budget (€)<input inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Save</button>
        {cat && <button type="button" className="link" onClick={archive}>Archive this category</button>}
      </form>
    </Sheet>
  )
}

/* ---------------- Yearly bills ---------------- */

function BillsTab() {
  const { member } = useAuth()
  const { bills, payments, loading, error, reload } = useBills()
  const [cats, setCats] = useState<Category[]>([])
  const [edit, setEdit] = useState<Bill | 'new' | null>(null)
  const [pay, setPay] = useState<Due | null>(null)
  const [showEnded, setShowEnded] = useState(false)
  const year = new Date().getFullYear()

  useEffect(() => { supabase.from('categories').select('*').order('name').then(r => setCats((r.data ?? []) as Category[])) }, [])
  if (loading) return <p className="muted center-text">Loading…</p>
  if (error) return <p className="error">Could not load bills: {error}. Has the latest SQL migration been run?</p>

  const active = bills.filter(b => !b.archived), ended = bills.filter(b => b.archived)
  const dues = dueList(bills, payments, year)
  const paidTotal = dues.reduce((s, d) => s + (d.paid?.expenses?.amount_cents ?? 0), 0)
  const todo = dues.filter(d => !d.paid)
  const todoTotal = todo.reduce((s, d) => s + d.bill.amount_cents, 0)
  const catOf = (id: string | null) => cats.find(c => c.id === id)

  async function undo(d: Due) {
    if (!d.paid || !confirm(`Undo the payment for "${d.bill.name}"? The expense is removed too.`)) return
    const { error } = await supabase.rpc('unmark_bill_paid', { payment: d.paid.id })
    if (error) alert(error.message)
    void reload()
  }
  async function setEnded(b: Bill, archived: boolean) {
    if (archived && !confirm(`End "${b.name}"? Payment history is kept. It stops appearing in reminders and plans.`)) return
    await supabase.from('bills').update({ archived }).eq('id', b.id)
    void reload()
  }

  return (
    <>
      <section className="card">
        <h2>{year} at a glance</h2>
        <div className="tiles">
          <div className="tile"><span className="muted small">Paid so far</span><b>{euroWhole(paidTotal)}</b></div>
          <div className="tile"><span className="muted small">Still to pay</span><b>{euroWhole(todoTotal)}</b></div>
          <div className="tile"><span className="muted small">All bills, per year</span><b>{euroWhole(active.reduce((s, b) => s + yearlyCost(b), 0))}</b></div>
          <div className="tile"><span className="muted small">Put aside monthly</span><b>{euroWhole(active.reduce((s, b) => s + monthlySetAside(b), 0))}</b></div>
        </div>
      </section>

      <button className="primary" onClick={() => setEdit('new')}>＋ Add a yearly bill</button>
      {!active.length && <section className="card"><p className="muted">Add things like car insurance, home insurance, road tax or a yearly subscription. You will see when each is due, mark it paid, and the money counts in the yearly overview.</p></section>}

      {active.map(b => (
        <section key={b.id} className="card">
          <div className="row"><h2>{b.name}</h2><strong>{euro(b.amount_cents)}</strong></div>
          <p className="muted small">{FREQ[b.times_per_year]} · {catOf(b.category_id) ? `${catOf(b.category_id)!.emoji} ${catOf(b.category_id)!.name}` : 'No category'} · {euro(monthlySetAside(b))} a month to put aside</p>
          {dues.filter(d => d.bill.id === b.id).map(d => (
            <div key={d.due} className="row item">
              <div>
                <div>{new Date(d.due + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}</div>
                {d.paid
                  ? <span className="tag ok">✓ Paid {euro(d.paid.expenses?.amount_cents ?? 0)}{d.paid.expenses && ` on ${new Date(d.paid.expenses.spent_on + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}`}</span>
                  : d.overdue ? <span className="tag warn">⚠️ Overdue</span> : <span className="tag">{d.days === 0 ? 'Due today' : `In ${d.days} days`}</span>}
              </div>
              {d.paid ? <button className="link small" onClick={() => undo(d)}>Undo</button> : <button onClick={() => setPay(d)}>Mark paid</button>}
            </div>
          ))}
          <div className="btn-row"><button onClick={() => setEdit(b)}>Edit</button><button onClick={() => setEnded(b, true)}>End bill</button></div>
        </section>
      ))}

      {ended.length > 0 && (
        <section className="card">
          <button className="link" onClick={() => setShowEnded(!showEnded)}>{showEnded ? '▲' : '▼'} Ended bills ({ended.length})</button>
          {showEnded && ended.map(b => <div key={b.id} className="row item"><span className="muted">{b.name}</span><button className="link small" onClick={() => setEnded(b, false)}>Restart</button></div>)}
        </section>
      )}

      {edit && <BillSheet bill={edit === 'new' ? null : edit} cats={cats.filter(c => !c.archived)} familyId={member!.family_id} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void reload() }} />}
      {pay && <PaySheet due={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); void reload() }} />}
    </>
  )
}

function BillSheet({ bill, cats, familyId, onClose, onDone }: { bill: Bill | null; cats: Category[]; familyId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(bill?.name ?? '')
  const [cat, setCat] = useState(bill?.category_id ?? '')
  const [amount, setAmount] = useState(bill ? (bill.amount_cents / 100).toString() : '')
  const [times, setTimes] = useState<number>(bill?.times_per_year ?? 1)
  const [month, setMonth] = useState(bill?.due_month ?? new Date().getMonth() + 1)
  const [day, setDay] = useState(String(bill?.due_day ?? 1))
  const [err, setErr] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuro(amount), d = Number(day)
    if (!name.trim()) return setErr('Give the bill a name.')
    if (!cents) return setErr('Enter the amount of one payment.')
    if (!Number.isInteger(d) || d < 1 || d > 31) return setErr('Day must be between 1 and 31.')
    const row = { name: name.trim(), category_id: cat || null, amount_cents: cents, times_per_year: times, due_month: month, due_day: d }
    const { error } = bill ? await supabase.from('bills').update(row).eq('id', bill.id) : await supabase.from('bills').insert({ ...row, family_id: familyId })
    if (error) setErr(error.message); else onDone()
  }
  return (
    <Sheet title={bill ? 'Edit bill' : 'New yearly bill'} onClose={onClose}>
      <form onSubmit={save}>
        <label>Name<input autoFocus maxLength={60} placeholder="Car insurance" value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Amount of one payment (€)<input inputMode="decimal" placeholder="620" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>How often<select value={times} onChange={e => setTimes(Number(e.target.value))}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <div className="btn-row">
          <label style={{ flex: 2 }}>{times === 1 ? 'Due in' : 'First due in'}<select value={month} onChange={e => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
          <label style={{ flex: 1 }}>Day<input inputMode="numeric" value={day} onChange={e => setDay(e.target.value.replace(/\D/g, ''))} /></label>
        </div>
        <label>Category<select value={cat} onChange={e => setCat(e.target.value)}><option value="">None</option>{cats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</select></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Save</button>
      </form>
    </Sheet>
  )
}

function PaySheet({ due, onClose, onDone }: { due: Due; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState((due.bill.amount_cents / 100).toString())
  const [paidOn, setPaidOn] = useState(today())
  const [err, setErr] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    const cents = parseEuro(amount)
    if (!cents) return setErr('Enter the amount you paid.')
    const { error } = await supabase.rpc('mark_bill_paid', { bill: due.bill.id, due: due.due, cents, paid: paidOn })
    if (error) setErr(error.message); else onDone()
  }
  return (
    <Sheet title={`${due.bill.name}: mark paid`} onClose={onClose}>
      <form onSubmit={save}>
        <p className="muted">Due {due.due}. This adds an expense, so it shows in your yearly overview.</p>
        <label>Amount paid (€)<input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Paid on<input type="date" max={today()} value={paidOn} onChange={e => setPaidOn(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Mark as paid</button>
      </form>
    </Sheet>
  )
}

/* ---------------- Family ---------------- */

function FamilyTab() {
  const [codes, setCodes] = useState<{ parent_code: string; kid_code: string } | null>(null)
  useEffect(() => { supabase.rpc('family_codes').then(r => setCodes(r.data?.[0] ?? null)) }, [])
  return (
    <section className="card">
      <h2>Invite family</h2>
      {codes ? (
        <>
          <p>Parent code: <code>{codes.parent_code}</code></p>
          <p>Kid code: <code>{codes.kid_code}</code></p>
          <p className="muted small">Kids with the kid code can log their own spending only. Share codes privately.</p>
        </>
      ) : <p className="muted">Loading…</p>}
      <p className="muted small">Need to review a budget? <Link to="/plan">Go to Budgets</Link></p>
    </section>
  )
}

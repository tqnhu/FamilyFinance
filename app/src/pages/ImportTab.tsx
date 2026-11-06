import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { euro } from '../lib/money'
import {
  buildHistory, decodeCsv, detectDateOrder, detectMapping, detectSign, markDuplicates, parseCsv, readExpenses, suggestCategory,
  type DateOrder, type Mapping, type Table,
} from '../lib/csv'
import type { Category } from '../lib/types'

type Edit = { selected?: boolean; cat?: string | null }
type Past = { batch: string; count: number; total: number; first: string; last: string; created: string }
const CHUNK = 200

export default function ImportTab() {
  const { member } = useAuth()
  const [cats, setCats] = useState<Category[]>([])
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState<Table | null>(null)
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy')
  const [expensesAre, setExpensesAre] = useState<'negative' | 'positive'>('negative')
  const [history, setHistory] = useState<Map<string, Map<string, number>>>(new Map())
  const [existing, setExisting] = useState<{ spent_on: string; amount_cents: number }[]>([])
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ count: number; batch: string } | null>(null)
  const [past, setPast] = useState<Past[]>([])
  const input = useRef<HTMLInputElement>(null)

  const activeCats = useMemo(() => cats.filter(c => !c.archived), [cats])
  const otherCat = activeCats.find(c => c.name.trim().toLowerCase() === 'other')?.id ?? null

  async function loadPast() {
    const { data } = await supabase.from('expenses').select('import_batch, amount_cents, spent_on, created_at').not('import_batch', 'is', null).order('created_at', { ascending: false }).limit(1000)
    const by = new Map<string, Past>()
    for (const r of data ?? []) {
      const p = by.get(r.import_batch) ?? { batch: r.import_batch, count: 0, total: 0, first: r.spent_on, last: r.spent_on, created: r.created_at }
      p.count++; p.total += r.amount_cents
      if (r.spent_on < p.first) p.first = r.spent_on
      if (r.spent_on > p.last) p.last = r.spent_on
      by.set(r.import_batch, p)
    }
    setPast([...by.values()].sort((a, b) => b.created.localeCompare(a.created)))
  }

  useEffect(() => {
    void supabase.from('categories').select('*').order('name').then(r => setCats((r.data ?? []) as Category[]))
    // what the family has already categorised teaches the suggestions
    void supabase.from('expenses').select('note, category_id').not('category_id', 'is', null).order('spent_on', { ascending: false }).limit(1000)
      .then(r => setHistory(buildHistory(r.data ?? [])))
    void loadPast()
  }, [])

  async function chooseFile(file: File | undefined) {
    if (!file) return
    setMsg(''); setDone(null); setEdits({})
    if (file.size > 5 * 1024 * 1024) return setMsg('That file is over 5 MB. Export a shorter period from your bank.')
    const t = parseCsv(decodeCsv(await file.arrayBuffer()))
    if (!t.headers.length || !t.rows.length) { setTable(null); return setMsg('No rows were found in that file. Is it a CSV export from your bank?') }
    const m = detectMapping(t)
    setFileName(file.name); setTable(t); setMapping(m)
    setDateOrder(detectDateOrder(t.rows.map(r => r[m.date] ?? '')))
    setExpensesAre(detectSign(t, m))
  }

  const read = useMemo(() => (table && mapping && mapping.date >= 0 && mapping.amount >= 0 && mapping.description >= 0
    ? readExpenses(table, mapping, { dateOrder, expensesAre }) : null), [table, mapping, dateOrder, expensesAre])

  // only look for already-entered duplicates inside the file's date range
  const range = useMemo(() => (read?.rows.length ? [read.rows.reduce((a, r) => (r.date < a ? r.date : a), read.rows[0].date), read.rows.reduce((a, r) => (r.date > a ? r.date : a), read.rows[0].date)] : null), [read])
  useEffect(() => {
    if (!range) return setExisting([])
    void supabase.from('expenses').select('spent_on, amount_cents').gte('spent_on', range[0]).lte('spent_on', range[1]).limit(1000).then(r => setExisting(r.data ?? []))
  }, [range])

  const rows = useMemo(() => {
    if (!read) return []
    const dups = markDuplicates(read.rows, existing)
    return read.rows.map((r, i) => {
      const sug = suggestCategory(r.note, history, cats)
      const e = edits[r.line] ?? {}
      return { ...r, dup: dups[i], suggested: sug, cat: e.cat !== undefined ? e.cat : (sug?.categoryId ?? otherCat), selected: e.selected ?? !dups[i] }
    })
  }, [read, existing, history, cats, edits, otherCat])

  const chosen = rows.filter(r => r.selected)
  const missing = chosen.filter(r => !r.cat).length
  const total = chosen.reduce((s, r) => s + r.cents, 0)
  const setEdit = (line: number, e: Edit) => setEdits(prev => ({ ...prev, [line]: { ...prev[line], ...e } }))

  async function doImport() {
    if (!member || !chosen.length || missing) return
    setBusy(true); setMsg('')
    const batch = crypto.randomUUID()
    let n = 0
    for (let i = 0; i < chosen.length; i += CHUNK) {
      const part = chosen.slice(i, i + CHUNK).map(r => ({
        family_id: member.family_id, member_id: member.user_id, category_id: r.cat, amount_cents: r.cents,
        note: r.note, spent_on: r.date, import_batch: batch,
      }))
      const { error } = await supabase.from('expenses').insert(part)
      if (error) {
        setBusy(false); void loadPast()
        return setMsg(`Imported ${n} of ${chosen.length} before an error: ${error.message}. Use "Undo" on the import below to remove those, then try again.`)
      }
      n += part.length
    }
    setBusy(false); setDone({ count: n, batch }); setTable(null); setMapping(null); setEdits({}); void loadPast()
    if (input.current) input.current.value = ''
  }

  async function undo(p: { batch: string; count: number }) {
    if (!confirm(`Remove all ${p.count} expenses from this import? Any you edited since will be removed too.`)) return
    const { error } = await supabase.from('expenses').delete().eq('import_batch', p.batch)
    if (error) return setMsg(error.message)
    if (done?.batch === p.batch) setDone(null)
    void loadPast()
  }

  const colName = (i: number) => (table?.headers[i] || `Column ${i + 1}`)
  const select = (label: string, value: number | null, set: (v: number | null) => void, optional = false) => (
    <label>{label}
      <select value={value ?? -1} onChange={e => set(Number(e.target.value) < 0 ? null : Number(e.target.value))}>
        {optional ? <option value={-1}>None</option> : value === null || value < 0 ? <option value={-1}>Choose…</option> : null}
        {table!.headers.map((_, i) => <option key={i} value={i}>{colName(i)}</option>)}
      </select>
    </label>
  )

  return (
    <>
      <section className="card">
        <h2>Import from your bank</h2>
        <p className="muted small">Download a CSV export from your online banking, then choose it here. You review everything before anything is added. The file is read on your phone and never uploaded anywhere.</p>
        <input ref={input} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={e => void chooseFile(e.target.files?.[0])} />
        <button className="primary" onClick={() => input.current?.click()}>📄 Choose a CSV file</button>
        {msg && <p className="error">{msg}</p>}
      </section>

      {done && (
        <section className="card attention">
          <h2>✅ Imported {done.count} expenses</h2>
          <p className="muted small">They are on your Home screen under their dates.</p>
          <button onClick={() => undo({ batch: done.batch, count: done.count })}>Undo this import</button>
        </section>
      )}

      {table && mapping && (
        <section className="card">
          <h2>{fileName}</h2>
          <p className="muted small">{table.rows.length} rows. Check that we found the right columns:</p>
          {select('Date', mapping.date < 0 ? null : mapping.date, v => setMapping({ ...mapping, date: v ?? -1 }))}
          {select('Amount', mapping.amount < 0 ? null : mapping.amount, v => setMapping({ ...mapping, amount: v ?? -1 }))}
          {select('Description', mapping.description < 0 ? null : mapping.description, v => setMapping({ ...mapping, description: v ?? -1 }))}
          {select('Debit/credit column (only if your bank has one, like Af/Bij)', mapping.direction, v => setMapping({ ...mapping, direction: v }), true)}
          <div className="btn-row">
            <label style={{ flex: 1 }}>Dates are
              <select value={dateOrder} onChange={e => setDateOrder(e.target.value as DateOrder)}><option value="dmy">day first (31/12/2026)</option><option value="mdy">month first (12/31/2026)</option></select>
            </label>
            {mapping.direction === null && (
              <label style={{ flex: 1 }}>Money out is
                <select value={expensesAre} onChange={e => setExpensesAre(e.target.value as 'negative' | 'positive')}><option value="negative">negative (−12.50)</option><option value="positive">positive (12.50)</option></select>
              </label>
            )}
          </div>
          {!read && <p className="error">Choose the date, amount and description columns to continue.</p>}
          {read && (
            <p className="muted small">
              {read.rows.length} expenses found{read.skipped.income ? ` · ${read.skipped.income} incoming payments skipped` : ''}
              {read.skipped.unreadable ? ` · ${read.skipped.unreadable} rows could not be read` : ''}{read.truncated ? ' · only the first 2,000 are shown' : ''}
            </p>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section className="card">
          <h2>Review</h2>
          <div className="btn-row">
            <button onClick={() => setEdits(Object.fromEntries(rows.map(r => [r.line, { ...edits[r.line], selected: true }])))}>Select all</button>
            <button onClick={() => setEdits(Object.fromEntries(rows.map(r => [r.line, { ...edits[r.line], selected: false }])))}>Select none</button>
          </div>
          <div className="imp-list">
            {rows.map(r => (
              <div key={r.line} className={`imp-row ${r.selected ? '' : 'off'}`}>
                <input type="checkbox" checked={r.selected} aria-label={`Import ${r.note || 'row'} on ${r.date}`} onChange={e => setEdit(r.line, { selected: e.target.checked })} />
                <div className="imp-main">
                  <div className="imp-note">{r.note || '(no description)'}</div>
                  <div className="muted small">{r.date}{r.dup && <span className="tag warn">possible duplicate</span>}</div>
                </div>
                <div className="imp-side">
                  <strong>{euro(r.cents)}</strong>
                  <select aria-label={`Category for ${r.note || 'row'}`} value={r.cat ?? ''} onChange={e => setEdit(r.line, { cat: e.target.value || null })}>
                    <option value="">Choose…</option>
                    {activeCats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                  {r.suggested && r.cat === r.suggested.categoryId && <span className="muted small">✨ {r.suggested.source === 'history' ? 'from your history' : 'suggested'}</span>}
                </div>
              </div>
            ))}
          </div>
          {missing > 0 && <p className="error">{missing} selected {missing === 1 ? 'expense needs' : 'expenses need'} a category.</p>}
          <button className="primary" disabled={busy || !chosen.length || missing > 0} onClick={doImport}>
            {busy ? 'Importing…' : `Import ${chosen.length} ${chosen.length === 1 ? 'expense' : 'expenses'} (${euro(total)})`}
          </button>
          <p className="muted small">The next import gets smarter: categories you choose now are remembered for similar descriptions.</p>
        </section>
      )}

      {past.length > 0 && (
        <section className="card">
          <h2>Past imports</h2>
          {past.map(p => (
            <div key={p.batch} className="row item">
              <div>
                <div>{new Date(p.created).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })} · {p.count} expenses</div>
                <div className="muted small">{p.first} to {p.last} · {euro(p.total)}</div>
              </div>
              <button className="link small" onClick={() => undo(p)}>Undo</button>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

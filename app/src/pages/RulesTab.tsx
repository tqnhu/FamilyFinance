import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { euro, parseEuro } from '../lib/money'
import { STARTER_RULES, learnedSuggestions, normalizeText, ruleMatches, type Learned } from '../lib/classify'
import { checkRule, useRuleActions, useRules, type Rule } from '../lib/rules'
import { useHistory } from '../lib/useHistory'
import { useTags } from '../lib/tags'
import type { Category } from '../lib/types'
import Sheet from '../components/Sheet'
import TagPicker from '../components/TagPicker'

const KIND_LABEL: Record<string, string> = { groceries: 'Groceries', 'eating out': 'Eating out', transport: 'Transport', health: 'Health', fun: 'Fun and leisure', 'home & bills': 'Home and bills', kids: 'Kids' }

const cents = (c: number) => (c % 100 === 0 ? `€${c / 100}` : euro(c))
const amountText = (r: Pick<Rule, 'min_cents' | 'max_cents'>) =>
  r.min_cents !== null && r.max_cents !== null ? ` and the amount is ${cents(r.min_cents)} to ${cents(r.max_cents)}`
    : r.min_cents !== null ? ` and the amount is ${cents(r.min_cents)} or more`
      : r.max_cents !== null ? ` and the amount is ${cents(r.max_cents)} or less` : ''

/** Plan → Rules: what the family has taught the app, and the rules it follows. */
export default function RulesTab() {
  const { rules, reload } = useRules()
  const actions = useRuleActions(reload)
  const { notes } = useHistory()
  const [cats, setCats] = useState<Category[]>([])
  const [recent, setRecent] = useState<{ category_id: string | null }[] | null>(null)
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void supabase.from('categories').select('*').order('name').then(r => setCats((r.data ?? []) as Category[]))
    const since = new Date(Date.now() - 30 * 86400000).toLocaleDateString('sv')
    void supabase.from('expenses').select('category_id, bill_id, monthly_fee, annual_fee').gte('spent_on', since).then(r => {
      const rows = (r.data ?? []) as { category_id: string | null; bill_id?: string | null; monthly_fee?: boolean; annual_fee?: boolean }[]
      setRecent(rows.filter(x => !(x.bill_id && !x.monthly_fee) && !x.annual_fee)) // the same expenses Home counts
    })
  }, [])

  const catName = (id: string) => cats.find(c => c.id === id)?.name ?? 'a removed category'
  const mine = rules.filter(r => r.status !== 'dismissed')
  const learned = useMemo(() => learnedSuggestions(notes, cats, rules), [notes, cats, rules])
  const other = cats.find(c => c.name.trim().toLowerCase() === 'other')
  const inOther = recent && other ? recent.filter(x => x.category_id === other.id).length : null

  async function make(l: Learned) { setMsg(await actions.add({ pattern: l.pattern, min_cents: null, max_cents: null, category_id: l.categoryId, tag_id: null, annual_fee: false }) ?? '') }
  async function dismiss(l: Learned) { setMsg(await actions.add({ pattern: l.pattern, min_cents: null, max_cents: null, category_id: l.categoryId, tag_id: null, annual_fee: false }, 'dismissed') ?? '') }
  async function toggle(r: Rule) { setMsg(await actions.change(r.id, { status: r.status === 'on' ? 'off' : 'on' }) ?? '') }

  return (
    <>
      <section className="card">
        <h2>Automatic categories</h2>
        <p className="muted small">When you add an expense or import a bank file, the app suggests a category. It follows your rules first, then what you have chosen before, then a list of common shops.</p>
        {recent !== null && other && (
          <p>{recent.length === 0 ? 'No expenses in the last 30 days.' : <><strong>{inOther} of {recent.length}</strong> expenses in the last 30 days are in Other{recent.length ? ` (${Math.round(((inOther ?? 0) / recent.length) * 100)}%)` : ''}. The fewer, the clearer the Breakdown.</>}</p>
        )}
        {msg && <p className="error" role="alert">{msg}</p>}
      </section>

      {learned.length > 0 && (
        <section className="card">
          <div className="row"><h2>Learned from you</h2><span className="muted small">{learned.length} to confirm</span></div>
          <p className="muted small">Patterns in your own choices. Nothing applies until you confirm.</p>
          {learned.map(l => (
            <div key={l.pattern + l.categoryId} className="item rule-row">
              <div><strong>"{l.pattern}"</strong> <span className="muted">goes to</span> <strong>{catName(l.categoryId)}</strong>
                <div className="muted small">Chosen {l.count} times, almost never anything else.</div></div>
              <div className="btn-row">
                <button className="primary" onClick={() => void make(l)}>Make a rule</button>
                <button onClick={() => void dismiss(l)}>Not this one</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="row"><h2>Your rules</h2><span className="muted small">Checked first</span></div>
        {mine.length === 0 && <p className="muted">No rules yet. Make one below, or change a suggested category when you add an expense and choose Remember.</p>}
        {mine.map(r => (
          <div key={r.id} className={`item rule-row ${r.status === 'off' ? 'off' : ''}`}>
            <button className="rule-main" onClick={() => setEditing(r)} aria-label={`Edit rule: ${r.pattern}`}>
              <span><strong>Description contains "{r.pattern}"</strong>{amountText(r)}</span>
              <span className="small">then <b>{catName(r.category_id)}</b>{r.tag_id ? ', with a tag' : ''}{r.annual_fee ? ', as an annual fee' : ''}</span>
            </button>
            <label className="rule-switch"><span className="muted small">{r.status === 'on' ? 'On' : 'Off'}</span>
              <input type="checkbox" role="switch" checked={r.status === 'on'} aria-label={`Rule on: ${r.pattern}`} onChange={() => void toggle(r)} /></label>
          </div>
        ))}
        <button className="primary" onClick={() => setEditing('new')}>New rule</button>
      </section>

      <section className="card">
        <details>
          <summary><strong>Starter rules</strong><span className="muted small"> {Object.values(STARTER_RULES).reduce((s, w) => s + w.length, 0)} common shops and services across Europe. Used last.</span></summary>
          {Object.entries(STARTER_RULES).map(([kind, words]) => (
            <p key={kind} className="small"><strong>{KIND_LABEL[kind] ?? kind}.</strong> <span className="muted">{words.map(w => w.trim()).join(', ')}</span></p>
          ))}
          <p className="muted small">They apply to a category with a matching name (Groceries, Eating out, Transport, Health, Fun, Home &amp; bills, Kids), and a few other names such as Food or Leisure. Your own rules always win.</p>
        </details>
      </section>

      {editing && <RuleSheet rule={editing === 'new' ? null : editing} cats={cats.filter(c => !c.archived || (editing !== 'new' && c.id === editing.category_id))} notes={notes} actions={actions} onClose={() => setEditing(null)} />}
    </>
  )
}

function RuleSheet({ rule, cats, notes, actions, onClose }: {
  rule: Rule | null; cats: Category[]; notes: { note: string; category_id: string | null }[]
  actions: ReturnType<typeof useRuleActions>; onClose: () => void
}) {
  const { tags, create: createTag } = useTags()
  const [pattern, setPattern] = useState(rule?.pattern ?? '')
  const [min, setMin] = useState(rule?.min_cents != null ? String(rule.min_cents / 100) : '')
  const [max, setMax] = useState(rule?.max_cents != null ? String(rule.max_cents / 100) : '')
  const [cat, setCat] = useState(rule?.category_id ?? '')
  const [tag, setTag] = useState(rule?.tag_id ?? '')
  const [annual, setAnnual] = useState(rule?.annual_fee ?? false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // which of the family's earlier expenses this text would match (amounts are not known here, so only the text is checked)
  const p = normalizeText(pattern)
  const hits = useMemo(() => (p.length >= 2 ? notes.filter(n => ruleMatches({ pattern: p, min_cents: null, max_cents: null }, n.note)) : []), [notes, p])
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? 'no category'

  async function save(e: FormEvent) {
    e.preventDefault(); setErr('')
    const r = checkRule({ pattern, min, max, category: cat, tag, annual }, parseEuro)
    if (typeof r === 'string') return setErr(r)
    setBusy(true)
    const problem = rule ? await actions.change(rule.id, { ...r, status: rule.status }) : await actions.add(r)
    setBusy(false)
    if (problem) return setErr(problem)
    onClose()
  }
  async function del() {
    if (!rule || !confirm(`Delete the rule for "${rule.pattern}"? Expenses already saved are not changed.`)) return
    setBusy(true); const problem = await actions.remove(rule.id); setBusy(false)
    if (problem) return setErr(problem)
    onClose()
  }

  return (
    <Sheet title={rule ? 'Edit rule' : 'New rule'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="muted small rule-legend">When</div>
        <label>The description contains<input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="e.g. sportclub" autoFocus /></label>
        <div className="btn-row">
          <label style={{ flex: 1 }}>Amount from (€, optional)<input inputMode="decimal" value={min} onChange={e => setMin(e.target.value)} placeholder="any" /></label>
          <label style={{ flex: 1 }}>to (€, optional)<input inputMode="decimal" value={max} onChange={e => setMax(e.target.value)} placeholder="any" /></label>
        </div>
        <p className="muted small">Capital letters, accents and extra spaces do not matter.</p>
        <div className="muted small rule-legend">Then put it in</div>
        <div className="chips">
          {cats.map(c => <button type="button" key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.emoji} {c.name}</button>)}
        </div>
        <TagPicker tags={tags} value={tag} onChange={setTag} onCreate={createTag} />
        <label className="annual-opt">
          <input type="checkbox" checked={annual} onChange={e => setAnnual(e.target.checked)} />
          <span>Annual fee<small className="muted"> Not counted as monthly spending.</small></span>
        </label>

        <div className="suggest" aria-label="Preview">
          <strong className="small">{p.length < 2 ? 'Type some text to see which earlier expenses it matches.' : `Matches ${hits.length} of your recent expenses${hits.length > 3 ? ', 3 shown' : ''}`}</strong>
          {hits.slice(0, 3).map((h, i) => <span key={i} className="small">{h.note} <span className="muted">· now in {catName(h.category_id)}</span></span>)}
        </div>

        {err && <p className="error" role="alert">{err}</p>}
        <button className="primary" disabled={busy}>{rule ? 'Save changes' : 'Save rule'}</button>
        {rule && <button type="button" className="link danger" onClick={() => void del()} disabled={busy}>Delete this rule</button>}
      </form>
    </Sheet>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { euro } from '../lib/money'
import type { Category } from '../lib/types'

export default function Budgets() {
  const [cats, setCats] = useState<Category[]>([])
  const [codes, setCodes] = useState<{ parent_code: string; kid_code: string } | null>(null)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then(r => setCats(r.data ?? []))
    supabase.rpc('family_codes').then(r => setCodes(r.data?.[0] ?? null))
  }, [])

  async function setBudget(c: Category, value: string) {
    const n = Number(value.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return
    const cents = Math.round(n * 100)
    const { error } = await supabase.from('categories').update({ budget_cents: cents }).eq('id', c.id)
    if (!error) { setCats(cs => cs.map(x => x.id === c.id ? { ...x, budget_cents: cents } : x)); setSaved(c.name) }
  }

  return (
    <>
      <section className="card">
        <h2>Monthly budgets</h2>
        {cats.map(c => (
          <label key={c.id} className="row">
            <span>{c.emoji} {c.name}</span>
            <input className="amt" inputMode="decimal" defaultValue={(c.budget_cents / 100).toString()}
              onBlur={e => setBudget(c, e.target.value)} />
          </label>
        ))}
        <p className="muted small">Total: {euro(cats.reduce((s, c) => s + c.budget_cents, 0))}{saved && ` · saved ${saved}`}</p>
      </section>
      {codes && (
        <section className="card">
          <h2>Invite family</h2>
          <p>Parent code: <code>{codes.parent_code}</code></p>
          <p>Kid code: <code>{codes.kid_code}</code></p>
          <p className="muted small">Kids with the kid code can log their own spending only. Share codes privately.</p>
        </section>
      )}
    </>
  )
}

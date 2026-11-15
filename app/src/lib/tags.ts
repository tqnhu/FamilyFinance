import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../auth'

export type Tag = { id: string; name: string; archived: boolean }

/** The family's tags, and a way to make a new one. Tags are family-wide: everyone can see and use them. */
export function useTags() {
  const { member } = useAuth()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('tags').select('id, name, archived').order('name')
    setTags((data ?? []) as Tag[]); setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])

  /** Creates a tag, or returns the existing one with the same name (ignoring case and spaces). */
  const create = useCallback(async (raw: string): Promise<Tag> => {
    const name = raw.trim().replace(/\s+/g, ' ')
    if (!name) throw new Error('Type a name for the tag.')
    if (name.length > 40) throw new Error('A tag name can have at most 40 characters.')
    const same = (t: Tag) => t.name.trim().toLowerCase() === name.toLowerCase()
    const known = tags.find(same)
    if (known) { if (known.archived) await supabase.from('tags').update({ archived: false }).eq('id', known.id); void reload(); return { ...known, archived: false } }
    const { data, error } = await supabase.from('tags').insert({ family_id: member!.family_id, name, created_by: member!.user_id }).select('id, name, archived').single()
    if (error) {
      if (error.code === '23505') { // someone else just made it
        const { data: again } = await supabase.from('tags').select('id, name, archived').order('name')
        const hit = (again ?? []).find(same); if (hit) { setTags(again as Tag[]); return hit as Tag }
      }
      throw new Error(error.message)
    }
    void reload()
    return data as Tag
  }, [tags, member, reload])

  return { tags, loading, reload, create }
}

/* ---------- periods ---------- */

export type PeriodKind = 'month' | 'year' | 'all'
export type Period = { kind: PeriodKind; year: number; month: number } // month is 0-11

const pad = (n: number) => String(n).padStart(2, '0')
export const periodNow = (kind: PeriodKind, now = new Date()): Period => ({ kind, year: now.getFullYear(), month: now.getMonth() })

/** The period as [from, to) in YYYY-MM-DD; null means unbounded (all time). */
export function periodRange(p: Period): { from: string | null; to: string | null } {
  if (p.kind === 'all') return { from: null, to: null }
  if (p.kind === 'year') return { from: `${p.year}-01-01`, to: `${p.year + 1}-01-01` }
  const ny = p.month === 11 ? p.year + 1 : p.year, nm = p.month === 11 ? 0 : p.month + 1
  return { from: `${p.year}-${pad(p.month + 1)}-01`, to: `${ny}-${pad(nm + 1)}-01` }
}

export function periodLabel(p: Period): string {
  if (p.kind === 'all') return 'All time'
  if (p.kind === 'year') return String(p.year)
  return new Date(p.year, p.month, 1).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
}

export function stepPeriod(p: Period, dir: -1 | 1): Period {
  if (p.kind === 'all') return p
  if (p.kind === 'year') return { ...p, year: p.year + dir }
  const m = p.month + dir
  return m < 0 ? { ...p, year: p.year - 1, month: 11 } : m > 11 ? { ...p, year: p.year + 1, month: 0 } : { ...p, month: m }
}

/** Never into the future, and not more than ten years back. */
export function canStep(p: Period, dir: -1 | 1, now = new Date()): boolean {
  if (p.kind === 'all') return false
  const next = stepPeriod(p, dir)
  const key = (q: Period) => (q.kind === 'year' ? q.year * 12 : q.year * 12 + q.month)
  const cur = periodNow(p.kind, now)
  return key(next) <= key(cur) && key(next) >= key(cur) - (p.kind === 'year' ? 10 * 12 : 10 * 12)
}

/* ---------- totals ---------- */

export type TotalRow = { tag_id: string | null; total_cents: number; n: number }
export type TagLine = { id: string; name: string; archived: boolean; total: number; n: number }

/** Joins the database's totals with the tag names. Tags with nothing in the period are left out; "no tag" is kept apart. */
export function tagLines(totals: TotalRow[], tags: Tag[]): { lines: TagLine[]; untagged: { total: number; n: number }; tagged: number; all: number } {
  const byId = new Map(tags.map(t => [t.id, t]))
  const lines: TagLine[] = []
  let untagged = { total: 0, n: 0 }
  for (const r of totals) {
    if (r.tag_id === null) { untagged = { total: r.total_cents, n: r.n }; continue }
    const t = byId.get(r.tag_id)
    if (t && r.total_cents > 0) lines.push({ id: t.id, name: t.name, archived: t.archived, total: r.total_cents, n: r.n })
  }
  lines.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const tagged = lines.reduce((s, l) => s + l.total, 0)
  return { lines, untagged, tagged, all: tagged + untagged.total }
}

export type MonthLine = { key: string; label: string; total: number; n: number }
/** Month rows for one tag, oldest first, labelled "Mar 2026". */
export function monthLines(rows: { month: string; total_cents: number; n: number }[]): MonthLine[] {
  return [...rows].sort((a, b) => a.month.localeCompare(b.month)).map(r => ({
    key: r.month, total: r.total_cents, n: r.n,
    label: new Date(r.month + 'T12:00:00').toLocaleDateString('en-IE', { month: 'short', year: 'numeric' }),
  }))
}

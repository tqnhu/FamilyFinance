import { isSeparateBill } from './expense'
import { monthOffset, parseMonthKey } from './category'
import type { SummaryRow } from './year'
import type { Category, Expense } from './types'

/** Where the money goes: spending split into categories, each with its share of the total. */

/** Colours for the biggest slices, then grey for "more categories". They differ in lightness as well as hue. */
export const SLICE_COLORS = ['#0f766e', '#3b6fd4', '#a65f00', '#c2417a', '#7a5cc7']
export const REST_COLOR = '#5b6d67'
export const MAX_SLICES = 5

type Row = Pick<Expense, 'category_id' | 'tag_id' | 'amount_cents' | 'bill_id' | 'monthly_fee' | 'spent_on'>
type TagName = { id: string; name: string }

export type Detail = { name: string; cents: number; pct: number; width: number }
export type Slice = {
  id: string; name: string; emoji: string; color: string
  cents: number; pct: number               // pct is a share of the whole, one decimal; all slices add up to exactly 100
  prev: number | null; delta: number | null // the comparison period, when there is one
  group: boolean                           // true for the "N more categories" slice
  categoryId: string | null                // set for a real category: the detail page can be opened
  keys: string[]                           // category keys inside the slice
  detailTitle: string; details: Detail[]
}
export type Breakdown = { total: number; prevTotal: number | null; delta: number | null; separateBills: number; slices: Slice[] }

/** Shares as tenths of a percent that add up to exactly 1000: the largest remainders get the leftover tenths. */
export function tenths(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0) return values.map(() => 0)
  const raw = values.map(v => (v / total) * 1000)
  const out = raw.map(Math.floor)
  let left = 1000 - out.reduce((s, v) => s + v, 0)
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i)
  for (const o of order) { if (left <= 0) break; out[o.i] += 1; left -= 1 }
  return out
}

type Item = { key: string; name: string; emoji: string; cents: number; prev: number; categoryId: string | null }

const NONE = 'none'
const keyOf = (id: string | null) => id ?? NONE

function ranked(items: Item[]): Item[] {
  return items.filter(i => i.cents > 0).sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
}

/** The biggest `max` categories as their own slices, and everything else as one group (only when it holds two or more). */
function makeSlices(all: Item[], hasPrev: boolean, detailsOf: (it: Item) => Detail[], max = MAX_SLICES): Slice[] {
  const items = ranked(all)
  const pcts = tenths(items.map(i => i.cents))
  const withPct = items.map((it, i) => ({ it, t: pcts[i] }))
  const solo = items.length > max + 1 ? withPct.slice(0, max) : withPct // a group of one would just hide a name
  const rest = items.length > max + 1 ? withPct.slice(max) : []
  const slices: Slice[] = solo.map(({ it, t }, i) => ({
    id: it.key, name: it.name, emoji: it.emoji, color: i < max ? SLICE_COLORS[i] : REST_COLOR, cents: it.cents, pct: t / 10,
    prev: hasPrev ? it.prev : null, delta: hasPrev ? it.cents - it.prev : null, group: false, categoryId: it.categoryId, keys: [it.key],
    detailTitle: `Tags in ${it.name}, share of the category`, details: detailsOf(it),
  }))
  if (rest.length) {
    const cents = rest.reduce((s, r) => s + r.it.cents, 0), prev = rest.reduce((s, r) => s + r.it.prev, 0)
    slices.push({
      id: 'more', name: `${rest.length} more categories`, emoji: '', color: REST_COLOR, cents, pct: rest.reduce((s, r) => s + r.t, 0) / 10,
      prev: hasPrev ? prev : null, delta: hasPrev ? cents - prev : null, group: true, categoryId: null, keys: rest.map(r => r.it.key),
      detailTitle: 'Inside this group, share of all spending',
      details: rest.map(r => ({ name: r.it.name, cents: r.it.cents, pct: r.t / 10, width: Math.round((r.it.cents / cents) * 100) })),
    })
  }
  return slices
}

const sum = (xs: { amount_cents: number }[]) => xs.reduce((s, x) => s + x.amount_cents, 0)

/**
 * One month, split by category. `cur` and `prev` hold the expenses of the month and of the period to compare with (or null).
 * Same rule as Home: monthly fees count as everyday spending, yearly and other non-monthly bill payments are left out and reported apart.
 */
export function breakdown(cur: Row[], prev: Row[] | null, cats: Category[], tags: TagName[]): Breakdown {
  const everyday = (xs: Row[]) => xs.filter(x => !isSeparateBill(x))
  const c = everyday(cur), p = prev ? everyday(prev) : []
  const byCat = new Map<string, Row[]>()
  for (const x of c) byCat.set(keyOf(x.category_id), [...(byCat.get(keyOf(x.category_id)) ?? []), x])
  const prevBy = new Map<string, number>()
  for (const x of p) prevBy.set(keyOf(x.category_id), (prevBy.get(keyOf(x.category_id)) ?? 0) + x.amount_cents)

  const keys = new Set<string>([...byCat.keys(), ...prevBy.keys()])
  const items: Item[] = [...keys].map(k => {
    const cat = cats.find(x => x.id === k)
    return { key: k, name: cat?.name ?? 'Uncategorised', emoji: cat?.emoji ?? '📦', cents: sum(byCat.get(k) ?? []), prev: prevBy.get(k) ?? 0, categoryId: cat ? cat.id : null }
  })

  const tagName = (id: string | null) => (id === null ? 'No tag' : tags.find(t => t.id === id)?.name ?? 'Tag')
  const detailsOf = (it: Item): Detail[] => {
    const rows = byCat.get(it.key) ?? []
    const byTag = new Map<string | null, number>()
    for (const x of rows) byTag.set(x.tag_id ?? null, (byTag.get(x.tag_id ?? null) ?? 0) + x.amount_cents)
    const list = [...byTag.entries()].map(([id, cents]) => ({ id, cents })).sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || b.cents - a.cents)
    const t = tenths(list.map(l => l.cents))
    return list.map((l, i) => ({ name: tagName(l.id), cents: l.cents, pct: t[i] / 10, width: Math.round(t[i] / 10) }))
  }

  const total = sum(c), prevTotal = prev ? sum(p) : null
  return {
    total, prevTotal, delta: prevTotal === null ? null : total - prevTotal,
    separateBills: sum(cur.filter(isSeparateBill)),
    slices: makeSlices(items, prev !== null, detailsOf),
  }
}

export type YearBreakdown = {
  total: number; separateBills: number; slices: Slice[]
  mix: { month: number; cents: number[] }[]   // per month, the spending of each slice (same order as `slices`)
}

/** A whole year from the database's (month x category x kind) rows. */
export function yearBreakdown(rows: SummaryRow[], cats: Category[]): YearBreakdown {
  const everyday = rows.filter(r => !r.is_bill)
  const byCat = new Map<string, number>()
  for (const r of everyday) byCat.set(keyOf(r.category_id), (byCat.get(keyOf(r.category_id)) ?? 0) + r.total_cents)
  const items: Item[] = [...byCat.entries()].map(([k, cents]) => {
    const cat = cats.find(x => x.id === k)
    return { key: k, name: cat?.name ?? 'Uncategorised', emoji: cat?.emoji ?? '📦', cents, prev: 0, categoryId: cat ? cat.id : null }
  })
  const slices = makeSlices(items, false, () => []).map(s => ({ ...s, detailTitle: '', details: [] }))
  const mix = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    cents: slices.map(s => everyday.filter(r => r.month === i + 1 && s.keys.includes(keyOf(r.category_id))).reduce((a, r) => a + r.total_cents, 0)),
  }))
  return {
    total: everyday.reduce((s, r) => s + r.total_cents, 0),
    separateBills: rows.filter(r => r.is_bill).reduce((s, r) => s + r.total_cents, 0),
    slices, mix,
  }
}

const iso = (d: Date) => d.toLocaleDateString('sv')

/**
 * The dates to read for a month and for the period it is compared with.
 * The month being lived in is compared with the same days of last month; a finished month with the whole of the one before.
 * `end` values are exclusive.
 */
export function monthWindows(key: string, now = new Date()) {
  const v = parseMonthKey(key) ?? new Date(now.getFullYear(), now.getMonth(), 1)
  const current = monthOffset(key, now) === 0
  const prevStart = new Date(v.getFullYear(), v.getMonth() - 1, 1)
  const prevDays = new Date(v.getFullYear(), v.getMonth(), 0).getDate()
  const cutDay = current ? Math.min(now.getDate(), prevDays) : prevDays
  return {
    current, lastDay: current ? now.getDate() : new Date(v.getFullYear(), v.getMonth() + 1, 0).getDate(),
    start: iso(v), end: iso(new Date(v.getFullYear(), v.getMonth() + 1, 1)),
    prevStart: iso(prevStart), prevEnd: iso(new Date(prevStart.getFullYear(), prevStart.getMonth(), cutDay + 1)),
  }
}

/** Splits the rows read for the month and the one before into the two periods. */
export function splitForComparison<T extends { spent_on: string }>(rows: T[], key: string, now = new Date()): { cur: T[]; prev: T[] } {
  const w = monthWindows(key, now)
  return {
    cur: rows.filter(x => x.spent_on >= w.start && x.spent_on < w.end),
    prev: rows.filter(x => x.spent_on >= w.prevStart && x.spent_on < w.prevEnd),
  }
}

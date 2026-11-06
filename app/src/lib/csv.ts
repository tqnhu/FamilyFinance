import Papa from 'papaparse'
import type { Category } from './types'

/* ---------- reading the file ---------- */

/** UTF-8 if the bytes are valid UTF-8, otherwise Windows-1252 (what many European bank exports use). */
export function decodeCsv(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1252').decode(buf) }
}

export type Table = { headers: string[]; rows: string[][] }

/**
 * Parses CSV text (any of , ; tab | as separator, quoted fields, BOM). Some banks print summary lines above the
 * real header, so the header is the first row that has the usual number of columns.
 */
export function parseCsv(text: string): Table {
  const clean = text.replace(/^﻿/, '')
  const { data } = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t', '|'] })
  const all = (data as string[][]).map(r => r.map(c => (c ?? '').trim()))
  if (!all.length) return { headers: [], rows: [] }
  const counts = new Map<number, number>()
  for (const r of all) counts.set(r.length, (counts.get(r.length) ?? 0) + 1)
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
  const at = all.findIndex(r => r.length === usual)
  return { headers: all[at], rows: all.slice(at + 1).filter(r => r.length === usual) }
}

/* ---------- amounts ---------- */

/** "1.234,56", "-12,50", "12.50-", "(7.00)", "€ 3,10", "1,234.56" -> signed cents. Null when it is not an amount. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[\s €$£]|EUR|USD|GBP/gi, '').replace(/−/g, '-').replace(/^\+/, '')
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1) }
  if (s.startsWith('-')) { negative = true; s = s.slice(1) }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null

  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  let decimalAt = -1
  if (lastComma >= 0 && lastDot >= 0) decimalAt = Math.max(lastComma, lastDot) // the later one is the decimal mark
  else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.'
    const at = Math.max(lastComma, lastDot), after = s.length - at - 1
    const many = s.split(sep).length > 2
    const thousands = many || (after === 3 && at >= 1 && at <= 3 && s.slice(0, at) !== '0')
    if (!thousands) decimalAt = at
  }
  const intPart = (decimalAt >= 0 ? s.slice(0, decimalAt) : s).replace(/[.,]/g, '')
  const frac = decimalAt >= 0 ? s.slice(decimalAt + 1) : ''
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || frac.length > 4) return null
  const cents = Number(intPart || '0') * 100 + Math.round(Number((frac + '00').slice(0, 2) + '.' + (frac + '00').slice(2)))
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

/* ---------- dates ---------- */

export type DateOrder = 'dmy' | 'mdy'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null
  if (d > new Date(y, m, 0).getDate()) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
const fullYear = (y: number, digits: number) => (digits === 4 ? y : y < 70 ? 2000 + y : 1900 + y)

/** Understands 2026-03-15, 20260315, 15-03-2026, 15/3/26, 15.03.2026, 03/15/2026 (order given), "15 Mar 2026", with or without a time. */
export function parseDate(raw: string, order: DateOrder = 'dmy'): string | null {
  const s = raw.trim().replace(/[T\s]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, '')
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/)
  if (m) {
    const [a, b, y] = [+m[1], +m[2], fullYear(+m[3], m[3].length)]
    return order === 'dmy' ? iso(y, b, a) : iso(y, a, b)
  }
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})\.?,?[ -](\d{4})$/)
  if (m) { const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); return mi >= 0 ? iso(+m[3], mi + 1, +m[1]) : null }
  m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/)
  if (m) { const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); return mi >= 0 ? iso(+m[3], mi + 1, +m[2]) : null }
  return null
}

/** Day-first unless the samples prove month-first (a "second part" above 12). */
export function detectDateOrder(samples: string[]): DateOrder {
  let sawFirstOver12 = false, sawSecondOver12 = false
  for (const raw of samples) {
    const m = raw.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})/)
    if (!m) continue
    if (+m[1] > 12) sawFirstOver12 = true
    if (+m[2] > 12) sawSecondOver12 = true
  }
  return sawSecondOver12 && !sawFirstOver12 ? 'mdy' : 'dmy'
}

/* ---------- column detection ---------- */

export type Mapping = { date: number; amount: number; description: number; direction: number | null }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim()
const DEBIT = /^(af|debit|d|db|dr|out|uitgaand|soll|belastung)$/i
const CREDIT = /^(bij|credit|c|cr|in|inkomend|haben|gutschrift)$/i

/** Picks the first header matching `patterns` in order of preference. */
function byHeader(headers: string[], patterns: RegExp[], skip: RegExp | null = null): number {
  const h = headers.map(norm)
  for (const p of patterns) { const i = h.findIndex(x => p.test(x) && !(skip && skip.test(x))); if (i >= 0) return i }
  return -1
}

export function detectMapping(t: Table): Mapping {
  const col = (i: number) => t.rows.slice(0, 40).map(r => r[i] ?? '').filter(Boolean)
  const share = (i: number, ok: (v: string) => boolean) => { const v = col(i); return v.length ? v.filter(ok).length / v.length : 0 }
  const n = t.headers.length

  let date = byHeader(t.headers, [/^(transaction |booking |posting |completed |started )?date$/, /^(boekdatum|datum|buchungstag|valutadatum|fecha|data)/, /date|datum/])
  if (date < 0 || share(date, v => parseDate(v) !== null) < 0.6) {
    const guess = [...Array(n).keys()].find(i => share(i, v => parseDate(v) !== null) >= 0.8)
    if (guess !== undefined) date = guess
  }
  const skipAmount = /balance|saldo|currency|valuta|fee|kosten|rate/
  let amount = byHeader(t.headers, [/^(amount|bedrag|betrag|importe|montant)/, /amount|bedrag|betrag|value|sum/], skipAmount)
  if (amount < 0 || share(amount, v => parseAmount(v) !== null) < 0.6) {
    const guess = [...Array(n).keys()].find(i => i !== date && !skipAmount.test(norm(t.headers[i])) && share(i, v => parseAmount(v) !== null) >= 0.8 && col(i).some(v => /[.,]\d{2}$/.test(v)))
    if (guess !== undefined) amount = guess
  }
  let description = byHeader(t.headers, [/^naam \/ omschrijving$/, /^(description|omschrijving|payee|merchant|beneficiary|counterparty)/, /^(name|naam|details|memo|reference|verwendungszweck|mededelingen|concept)/, /description|omschrijving|name|naam|memo|details/])
  if (description < 0) {
    let best = -1, bestLen = 0
    for (let i = 0; i < n; i++) {
      if (i === date || i === amount) continue
      const v = col(i); const len = v.length ? v.reduce((s, x) => s + x.length, 0) / v.length : 0
      if (len > bestLen) { best = i; bestLen = len }
    }
    description = best
  }
  // A direction column only counts if every value is a known debit/credit word (Af/Bij, Debit/Credit, D/C).
  let direction: number | null = null
  for (let i = 0; i < n; i++) {
    if (i === date || i === amount || i === description) continue
    const v = col(i)
    if (v.length && v.every(x => DEBIT.test(x) || CREDIT.test(x))) { direction = i; break }
  }
  return { date, amount, description, direction }
}

/* ---------- turning rows into expenses ---------- */

export type Options = { dateOrder: DateOrder; expensesAre: 'negative' | 'positive' }

/** Which sign the bank uses for money going out: the more common sign among amounts (ties: negative). */
export function detectSign(t: Table, m: Mapping): 'negative' | 'positive' {
  if (m.direction !== null) return 'negative'
  let neg = 0, pos = 0
  for (const r of t.rows) { const c = parseAmount(r[m.amount] ?? ''); if (c === null || c === 0) continue; c < 0 ? neg++ : pos++ }
  return pos > neg ? 'positive' : 'negative'
}

export type ParsedRow = { line: number; date: string; cents: number; note: string }
export type Skipped = { income: number; unreadable: number; zero: number }

/** Keeps the expenses (money out) as positive cents. Anything else is counted, not imported. */
export function readExpenses(t: Table, m: Mapping, o: Options, cap = 2000): { rows: ParsedRow[]; skipped: Skipped; truncated: boolean } {
  const rows: ParsedRow[] = []
  const skipped: Skipped = { income: 0, unreadable: 0, zero: 0 }
  let truncated = false
  t.rows.forEach((r, i) => {
    const date = parseDate(r[m.date] ?? '', o.dateOrder)
    let cents = parseAmount(r[m.amount] ?? '')
    if (date === null || cents === null) { skipped.unreadable++; return }
    if (cents === 0) { skipped.zero++; return }
    if (m.direction !== null) {
      const d = (r[m.direction] ?? '').trim()
      if (DEBIT.test(d)) cents = -Math.abs(cents)
      else if (CREDIT.test(d)) cents = Math.abs(cents)
    }
    const out = o.expensesAre === 'negative' ? cents < 0 : cents > 0
    if (!out) { skipped.income++; return }
    if (rows.length >= cap) { truncated = true; return }
    rows.push({ line: i + 2, date, cents: Math.abs(cents), note: (r[m.description] ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) })
  })
  return { rows, skipped, truncated }
}

/* ---------- suggesting categories ---------- */

const NOISE = new Set(['betaalautomaat', 'pinbetaling', 'pas', 'sepa', 'incasso', 'ideal', 'card', 'payment', 'pos', 'nr', 'ref', 'kaart', 'google', 'apple', 'pay',
  'transactie', 'overboeking', 'term', 'contactloos', 'debit', 'credit', 'purchase', 'visa', 'mastercard', 'bea', 'gea', 'the', 'and', 'van', 'het', 'een', 'tot',
  'betaling', 'omschrijving', 'naam', 'iban', 'bic', 'kenmerk', 'machtiging', 'doorlopende', 'europese', 'periode', 'bv', 'nv', 'ltd', 'gmbh', 'www', 'com', 'nl'])

/** Words that identify a merchant: lowercase, no digits or accents, no bank boilerplate, at least 3 letters. */
export function tokens(desc: string): string[] {
  return [...new Set(desc.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !NOISE.has(w)))]
}

/** What the family's own categorised expenses say about each word. */
export function buildHistory(expenses: { note: string; category_id: string | null }[]): Map<string, Map<string, number>> {
  const idx = new Map<string, Map<string, number>>()
  for (const e of expenses) {
    if (!e.category_id || !e.note) continue
    for (const w of tokens(e.note)) {
      const m = idx.get(w) ?? new Map<string, number>()
      m.set(e.category_id, (m.get(e.category_id) ?? 0) + 1)
      idx.set(w, m)
    }
  }
  return idx
}

/** Starter keywords per category name, used only until the family's own history knows better. */
const KEYWORDS: Record<string, string[]> = {
  groceries: ['albert heijn', 'jumbo', 'lidl', 'aldi', 'dirk', 'spar', 'carrefour', 'tesco', 'edeka', 'rewe', 'kaufland', 'delhaize', 'supermarkt', 'supermarket', 'plus supermarkt', 'coop', 'hofer', 'mercadona', 'picnic', 'ah to go', 'ekoplaza', 'marqt'],
  'eating out': ['mcdonald', 'burger king', 'kfc', 'restaurant', 'cafe', 'pizza', 'starbucks', 'subway', 'thuisbezorgd', 'uber eats', 'deliveroo', 'just eat', 'bakkerij', 'snackbar', 'lunchroom', 'domino', 'wolt', 'bistro', 'brasserie', 'sushi'],
  transport: ['shell', 'bp ', 'esso', 'texaco', 'tankstation', 'ov chipkaart', 'ov-chipkaart', 'uber', 'bolt', 'parking', 'parkeer', 'gvb', 'htm', 'arriva', 'deutsche bahn', 'flixbus', 'q-park', 'tamoil', 'ns groep', 'ns reizigers', 'treinkaartje'],
  health: ['apotheek', 'pharmacy', 'huisarts', 'tandarts', 'dokter', 'fysio', 'ziekenhuis', 'opticien', 'drogist'],
  fun: ['netflix', 'spotify', 'cinema', 'bioscoop', 'pathe', 'steam', 'playstation', 'nintendo', 'disney', 'youtube', 'xbox', 'museum', 'pretpark', 'efteling', 'theater', 'concert', 'ticketmaster'],
  'home & bills': ['vattenfall', 'eneco', 'energie', 'ziggo', 'kpn', 'vodafone', 't-mobile', 'odido', 'verzekering', 'insurance', 'huur', 'hypotheek', 'waterbedrijf', 'gemeente', 'belasting', 'ikea', 'hornbach', 'gamma', 'praxis', 'karwei'],
  kids: ['speelgoed', 'toys', 'lego', 'school', 'kinderopvang', 'bso', 'kinderdagverblijf', 'bol.com kids', 'jumbo kids'],
}

/** Long or multi-word keywords match anywhere; short ones (coop, spar, uber) only as whole words, so "cooperative" is not a supermarket. */
function hasKeyword(text: string, k: string): boolean {
  const key = k.trim()
  return key.length > 4 || key.includes(' ') ? text.includes(key) : text.includes(' ' + key + ' ')
}

export type Suggestion = { categoryId: string; source: 'history' | 'keyword' } | null

export function suggestCategory(desc: string, history: Map<string, Map<string, number>>, cats: Category[]): Suggestion {
  const valid = new Set(cats.filter(c => !c.archived).map(c => c.id))
  // 1. what this family did before: each known word votes for its categories, weighted by how consistent it was
  const score = new Map<string, number>()
  for (const w of tokens(desc)) {
    const m = history.get(w); if (!m) continue
    const total = [...m.values()].reduce((s, v) => s + v, 0)
    for (const [cat, n] of m) {
      const purity = n / total // how consistently this word pointed at this category
      // A word spread over many categories (a city, "shop") proves nothing. One sighting is only half the evidence,
      // so a lone matching word is not enough: it takes a word seen twice, or two matching words, to suggest.
      if (valid.has(cat) && purity >= 0.6) score.set(cat, (score.get(cat) ?? 0) + (purity * Math.min(total, 2)) / 2)
    }
  }
  const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0]
  if (best && best[1] >= 0.9) return { categoryId: best[0], source: 'history' }
  // 2. starter keywords, matched against the family's category names
  const text = ' ' + desc.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ') + ' '
  for (const c of cats) {
    if (c.archived) continue
    const words = KEYWORDS[c.name.trim().toLowerCase()]
    if (words?.some(k => hasKeyword(text, k))) return { categoryId: c.id, source: 'keyword' }
  }
  return null
}

/* ---------- duplicates ---------- */

/**
 * Marks rows that look already entered: an existing expense on the same day for the same amount.
 * Counted, so two identical coffees in the file only match as many as already exist.
 */
export function markDuplicates(rows: { date: string; cents: number }[], existing: { spent_on: string; amount_cents: number }[]): boolean[] {
  const left = new Map<string, number>()
  for (const e of existing) { const k = `${e.spent_on}|${e.amount_cents}`; left.set(k, (left.get(k) ?? 0) + 1) }
  return rows.map(r => {
    const k = `${r.date}|${r.cents}`, n = left.get(k) ?? 0
    if (n > 0) { left.set(k, n - 1); return true }
    return false
  })
}

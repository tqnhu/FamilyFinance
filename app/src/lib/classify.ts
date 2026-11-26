import type { Category } from './types'

/**
 * Suggesting a category from a description. Three sources, in order:
 *  1. what the family did before (their own categorised expenses),
 *  2. starter rules for common European shops and services,
 *  3. nothing: the person is asked.
 * Every suggestion carries a short reason, and a confidence: "high" ones may be pre-selected, "medium" ones are only offered.
 */

const NOISE = new Set(['betaalautomaat', 'pinbetaling', 'pas', 'sepa', 'incasso', 'ideal', 'card', 'payment', 'pos', 'nr', 'ref', 'kaart', 'google', 'apple', 'pay',
  'transactie', 'overboeking', 'term', 'contactloos', 'debit', 'credit', 'purchase', 'visa', 'mastercard', 'bea', 'gea', 'the', 'and', 'van', 'het', 'een', 'tot',
  'betaling', 'omschrijving', 'naam', 'iban', 'bic', 'kenmerk', 'machtiging', 'doorlopende', 'europese', 'periode', 'bv', 'nv', 'ltd', 'gmbh', 'www', 'com', 'nl'])

/** Words that identify a merchant: lowercase, no digits or accents, no bank boilerplate, at least 3 letters. */
export function tokens(desc: string): string[] {
  return [...new Set(desc.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !NOISE.has(w)))]
}

export type History = Map<string, Map<string, number>>

/** What the family's own categorised expenses say about each word. */
export function buildHistory(expenses: { note: string; category_id: string | null }[]): History {
  const idx: History = new Map()
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

/**
 * Starter rules: shops and services across Europe (NL, BE, DE, FR, ES, IT, UK/IE, Nordics, PL, AT, CH), typed without accents.
 * They belong to a kind of spending, not to one family's category: `CATEGORY_NAMES` says which of the family's categories each kind
 * is, by name, so a family that calls it "Food" or "Supermarket" is still understood.
 */
export const STARTER_RULES: Record<string, string[]> = {
  groceries: ['albert heijn', 'jumbo', 'lidl', 'aldi', 'dirk', 'spar', 'coop', 'picnic', 'ekoplaza', 'marqt', 'plus supermarkt', 'ah to go', 'supermarkt', 'supermarket', 'delhaize', 'colruyt', 'carrefour', 'auchan', 'leclerc', 'intermarche', 'monoprix', 'franprix', 'mercadona', 'eroski', 'esselunga', 'conad', 'edeka', 'rewe', 'kaufland', 'penny', 'netto', 'billa', 'hofer', 'migros', 'denner', 'tesco', 'sainsbury', 'asda', 'morrisons', 'waitrose', 'dunnes', 'supervalu', 'willys', 'rema 1000', 'biedronka', 'zabka', 'lebensmittel', 'epicerie', 'supermercado'],
  'eating out': ['mcdonald', 'burger king', 'kfc', 'subway', 'starbucks', 'pizza', 'domino', 'nando', 'pret a manger', 'wolt', 'glovo', 'just eat', 'uber eats', 'deliveroo', 'thuisbezorgd', 'lieferando', 'restaurant', 'ristorante', 'restaurante', 'trattoria', 'brasserie', 'bistro', 'cafe', 'bakkerij', 'boulangerie', 'backerei', 'panaderia', 'snackbar', 'lunchroom', 'sushi', 'kebab', 'takeaway'],
  transport: ['shell', 'bp ', 'esso', 'texaco', 'tamoil', 'totalenergies', 'aral', 'circle k', 'q8', 'repsol', 'tankstation', 'tankstelle', 'ov chipkaart', 'ov-chipkaart', 'ovpay', 'ns groep', 'ns reizigers', 'gvb', 'htm', 'arriva', 'nmbs', 'sncb', 'sncf', 'deutsche bahn', 'renfe', 'trenitalia', 'italo', 'flixbus', 'uber', 'bolt', 'free now', 'cabify', 'parking', 'parkeer', 'q-park', 'autostrada', 'vignette', 'tfl', 'oyster', 'ryanair', 'easyjet', 'klm', 'lufthansa', 'treinkaartje'],
  health: ['apotheek', 'pharmacy', 'pharmacie', 'apotheke', 'farmacia', 'huisarts', 'tandarts', 'zahnarzt', 'dentist', 'dokter', 'arzt', 'medecin', 'fysio', 'physio', 'ziekenhuis', 'krankenhaus', 'hospital', 'opticien', 'specsavers', 'kruidvat', 'etos', 'rossmann', 'drogist'],
  fun: ['netflix', 'spotify', 'disney', 'hbo', 'prime video', 'youtube', 'steam', 'playstation', 'xbox', 'nintendo', 'cinema', 'bioscoop', 'kino', 'pathe', 'kinepolis', 'ticketmaster', 'museum', 'theater', 'theatre', 'concert', 'efteling', 'europa-park', 'disneyland', 'pretpark', 'basic-fit', 'fitness', 'decathlon'],
  'home & bills': ['vattenfall', 'eneco', 'essent', 'engie', 'edf', 'e.on', 'iberdrola', 'enel', 'energie', 'ziggo', 'kpn', 'odido', 'vodafone', 't-mobile', 'telekom', 'movistar', 'telia', 'proximus', 'orange', 'verzekering', 'insurance', 'versicherung', 'assurance', 'seguros', 'huur', 'hypotheek', 'mortgage', 'waterbedrijf', 'gemeente', 'belasting', 'ikea', 'hornbach', 'gamma', 'praxis', 'karwei', 'leroy merlin', 'bauhaus', 'obi', 'castorama', 'brico', 'screwfix'],
  kids: ['speelgoed', 'toys', 'lego', 'intertoys', 'smyths', 'school', 'kinderopvang', 'bso', 'kinderdagverblijf', 'creche', 'kita', 'daycare'],
}

/** The names a family may give each kind of spending. */
export const CATEGORY_NAMES: Record<string, string[]> = {
  groceries: ['groceries', 'grocery', 'food', 'supermarket', 'supermarkets'],
  'eating out': ['eating out', 'restaurants', 'restaurant', 'dining', 'takeaway'],
  transport: ['transport', 'transportation', 'travel', 'car', 'commuting'],
  health: ['health', 'healthcare', 'medical', 'pharmacy'],
  fun: ['fun', 'leisure', 'entertainment', 'hobbies', 'recreation'],
  'home & bills': ['home & bills', 'home', 'bills', 'household', 'utilities', 'housing'],
  kids: ['kids', 'children', 'child'],
}

const kindOf = (name: string): string | null => {
  const n = name.trim().toLowerCase()
  return Object.keys(CATEGORY_NAMES).find(k => CATEGORY_NAMES[k].includes(n)) ?? null
}

/** Long or multi-word keywords match anywhere; short ones (coop, spar, uber) only as whole words, so "cooperative" is not a supermarket. */
function hasKeyword(text: string, k: string): boolean {
  const key = k.trim()
  return key.length > 4 || key.includes(' ') ? text.includes(key) : text.includes(' ' + key + ' ')
}

export type Confidence = 'high' | 'medium'
export type Suggestion = {
  categoryId: string; source: 'rule' | 'history' | 'keyword'; confidence: Confidence; why: string
  tagId?: string | null; annualFee?: boolean // only a family rule can also set these
  matched?: string // the starter keyword that matched, a good text for a rule of the family's own
} | null

/** A family rule (a row of classification_rules). */
export type Rule = {
  id: string; pattern: string; min_cents: number | null; max_cents: number | null
  category_id: string; tag_id: string | null; annual_fee: boolean; status: 'on' | 'off' | 'dismissed'
}

/** How patterns and descriptions are compared: lower case, no accents, single spaces. */
export const normalizeText = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/** Does this family rule apply to a description (and amount, when known)? Same word-boundary behaviour as the starter rules. */
export function ruleMatches(rule: Pick<Rule, 'pattern' | 'min_cents' | 'max_cents'>, desc: string, cents?: number): boolean {
  if (!hasKeyword(' ' + normalizeText(desc) + ' ', rule.pattern)) return false
  if (rule.min_cents === null && rule.max_cents === null) return true
  if (cents === undefined) return false // an amount rule waits until there is an amount
  return (rule.min_cents === null || cents >= rule.min_cents) && (rule.max_cents === null || cents <= rule.max_cents)
}

const plural = (n: number) => (n === 1 ? 'expense' : 'expenses')

/**
 * `desc` is the bank description or the note typed by hand.
 * High confidence: the strongest word was seen 3 or more times and nearly always in this category, or a starter rule matched.
 * Medium: the family's history points here but on thinner evidence (a word seen twice, or two words once each).
 */
export function classify(desc: string, history: History, cats: Category[], opts: { rules?: Rule[]; cents?: number } = {}): Suggestion {
  const valid = new Map(cats.filter(c => !c.archived).map(c => [c.id, c]))
  // 0. the family's own rules come first. The most specific one wins: an amount range, then the longer pattern.
  const mine = (opts.rules ?? []).filter(r => r.status === 'on' && valid.has(r.category_id) && ruleMatches(r, desc, opts.cents))
    .sort((a, b) => Number(b.min_cents !== null || b.max_cents !== null) - Number(a.min_cents !== null || a.max_cents !== null) || b.pattern.length - a.pattern.length)
  if (mine.length) {
    const r = mine[0], name = valid.get(r.category_id)!.name
    return { categoryId: r.category_id, source: 'rule', confidence: 'high', tagId: r.tag_id, annualFee: r.annual_fee,
      why: `Your rule: "${r.pattern}" goes to ${name}${r.annual_fee ? ', as an annual fee' : ''}.` }
  }
  // 1. what this family did before: each known word votes for its categories, weighted by how consistent it was
  const score = new Map<string, number>()
  const top = new Map<string, { word: string; n: number; purity: number }>() // the word that argues most strongly for a category
  for (const w of tokens(desc)) {
    const m = history.get(w); if (!m) continue
    const total = [...m.values()].reduce((s, v) => s + v, 0)
    for (const [cat, n] of m) {
      const purity = n / total // how consistently this word pointed at this category
      // A word spread over many categories (a city, "shop") proves nothing. One sighting is only half the evidence,
      // so a lone matching word is not enough: it takes a word seen twice, or two matching words, to suggest.
      if (valid.has(cat) && purity >= 0.6) {
        score.set(cat, (score.get(cat) ?? 0) + (purity * Math.min(total, 2)) / 2)
        const t = top.get(cat)
        if (!t || n > t.n) top.set(cat, { word: w, n, purity })
      }
    }
  }
  const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0]
  if (best && best[1] >= 0.9) {
    const t = top.get(best[0])!
    const name = valid.get(best[0])!.name
    return {
      categoryId: best[0], source: 'history',
      confidence: t.n >= 3 && t.purity >= 0.8 ? 'high' : 'medium',
      why: `${t.n} earlier ${plural(t.n)} mentioning "${t.word}" went to ${name}.`,
    }
  }
  // 2. starter rules, matched against the family's category names
  const text = ' ' + desc.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ') + ' '
  for (const c of cats) {
    if (c.archived) continue
    const kind = kindOf(c.name); if (!kind) continue
    const hit = STARTER_RULES[kind].find(k => hasKeyword(text, k))
    if (hit) return { categoryId: c.id, source: 'keyword', confidence: 'high', matched: hit.trim(), why: `Starter rule: "${hit.trim()}" is usually ${c.name}.` }
  }
  return null
}

/** The part of a note that names the shop: its first two meaningful words, as long as they appear together in the note. */
export function patternFromNote(note: string): string | null {
  const text = ' ' + normalizeText(note) + ' '
  const t = tokens(note)
  const two = t.slice(0, 2).join(' ')
  if (t.length >= 2 && text.includes(' ' + two + ' ')) return two
  return t[0] && t[0].length >= 4 ? t[0] : null
}

export type Learned = { pattern: string; categoryId: string; count: number }

/**
 * Patterns the family keeps filing the same way and has not turned into a rule yet:
 * seen at least 3 times, and at least 80% of the time in one category. Dismissed or existing rules, and shops the
 * starter rules already place in that category, are left out.
 */
export function learnedSuggestions(expenses: { note: string; category_id: string | null }[], cats: Category[], rules: Rule[], max = 5): Learned[] {
  const valid = new Map(cats.filter(c => !c.archived).map(c => [c.id, c]))
  const groups = new Map<string, Map<string, number>>()
  for (const e of expenses) {
    if (!e.note || !e.category_id || !valid.has(e.category_id)) continue
    const p = patternFromNote(e.note); if (!p) continue
    const m = groups.get(p) ?? new Map<string, number>()
    m.set(e.category_id, (m.get(e.category_id) ?? 0) + 1); groups.set(p, m)
  }
  const out: Learned[] = []
  for (const [pattern, m] of groups) {
    const total = [...m.values()].reduce((a, b) => a + b, 0)
    const [cat, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
    if (total < 3 || n / total < 0.8) continue
    if (rules.some(r => r.pattern === pattern && r.min_cents === null && r.max_cents === null)) continue // already a rule, or turned down
    const starter = classify(pattern, new Map(), [valid.get(cat)!])
    if (starter && starter.categoryId === cat) continue // the starter rules already know this one
    out.push({ pattern, categoryId: cat, count: n })
  }
  return out.sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern)).slice(0, max)
}

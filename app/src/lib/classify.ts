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
export type Suggestion = { categoryId: string; source: 'history' | 'keyword'; confidence: Confidence; why: string } | null

const plural = (n: number) => (n === 1 ? 'expense' : 'expenses')

/**
 * `desc` is the bank description or the note typed by hand.
 * High confidence: the strongest word was seen 3 or more times and nearly always in this category, or a starter rule matched.
 * Medium: the family's history points here but on thinner evidence (a word seen twice, or two words once each).
 */
export function classify(desc: string, history: History, cats: Category[]): Suggestion {
  const valid = new Map(cats.filter(c => !c.archived).map(c => [c.id, c]))
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
    if (hit) return { categoryId: c.id, source: 'keyword', confidence: 'high', why: `Starter rule: "${hit.trim()}" is usually ${c.name}.` }
  }
  return null
}

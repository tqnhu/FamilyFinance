import { describe, expect, it } from 'vitest'
import { buildHistory, decodeCsv, detectDateOrder, detectMapping, detectSign, markDuplicates, parseAmount, parseCsv, parseDate, readExpenses, suggestCategory, tokens } from './csv'
import type { Category } from './types'

describe('parseAmount', () => {
  const cases: [string, number | null][] = [
    ['12.50', 1250], ['12,50', 1250], ['-12,50', -1250], ['1.234,56', 123456], ['1,234.56', 123456], ['1234,5', 123450],
    ['€ 3,10', 310], ['EUR 7', 700], ['12.50-', -1250], ['(7.00)', -700], ['−12,50', -1250], ['+5,00', 500], ['0,05', 5], ['0.07', 7],
    ['1.234', 123400], ['1,234', 123400], ['12.345', 1234500], ['1234.567', 123457], ['1.234.567,89', 123456789], ['19,99', 1999],
    ['', null], ['abc', null], ['12,5x', null], ['--', null], ['.', null], ['1,2,3x', null],
  ]
  for (const [raw, want] of cases) it(`${JSON.stringify(raw)} -> ${want}`, () => expect(parseAmount(raw)).toBe(want))
  it('avoids floating point errors', () => { expect(parseAmount('0.29')).toBe(29); expect(parseAmount('1.15')).toBe(115); expect(parseAmount('4.35')).toBe(435) })
})

describe('parseDate', () => {
  const cases: [string, 'dmy' | 'mdy', string | null][] = [
    ['2026-03-15', 'dmy', '2026-03-15'], ['20260315', 'dmy', '2026-03-15'], ['15-03-2026', 'dmy', '2026-03-15'], ['15/3/26', 'dmy', '2026-03-15'],
    ['15.03.2026', 'dmy', '2026-03-15'], ['03/15/2026', 'mdy', '2026-03-15'], ['03/04/2026', 'dmy', '2026-04-03'], ['03/04/2026', 'mdy', '2026-03-04'],
    ['2026-03-15 12:30:45', 'dmy', '2026-03-15'], ['2026-03-15T08:00:00Z', 'dmy', '2026-03-15'], ['15 Mar 2026', 'dmy', '2026-03-15'], ['March 15, 2026', 'dmy', '2026-03-15'],
    ['31/04/2026', 'dmy', null], ['2026-02-29', 'dmy', null], ['2028-02-29', 'dmy', '2028-02-29'], ['13/13/2026', 'dmy', null], ['', 'dmy', null], ['hello', 'dmy', null],
    ['15/03/99', 'dmy', '1999-03-15'],
  ]
  for (const [raw, order, want] of cases) it(`${raw} (${order}) -> ${want}`, () => expect(parseDate(raw, order)).toBe(want))
  it('detects month-first only when the data proves it', () => {
    expect(detectDateOrder(['03/15/2026', '04/01/2026'])).toBe('mdy')
    expect(detectDateOrder(['15/03/2026', '04/01/2026'])).toBe('dmy')
    expect(detectDateOrder(['03/04/2026', '05/06/2026'])).toBe('dmy') // ambiguous: day-first is the European default
    expect(detectDateOrder(['2026-03-15'])).toBe('dmy')
  })
})

describe('parseCsv', () => {
  it('handles quotes, embedded separators and newlines', () => {
    const t = parseCsv('a,b,c\n"x, y",2,"line1\nline2"\n')
    expect(t.headers).toEqual(['a', 'b', 'c']); expect(t.rows).toEqual([['x, y', '2', 'line1\nline2']])
  })
  it('guesses semicolon and tab', () => {
    expect(parseCsv('a;b\n1;2').rows).toEqual([['1', '2']]); expect(parseCsv('a\tb\n1\t2').rows).toEqual([['1', '2']])
  })
  it('drops a BOM and blank lines', () => { const t = parseCsv('﻿d;e\n\n1;2\n\n'); expect(t.headers).toEqual(['d', 'e']); expect(t.rows).toHaveLength(1) })
  it('skips summary lines above the real header', () => {
    const t = parseCsv('Account: NL01\nPeriod: March\nDate;Amount;Text\n01-03-2026;-5,00;Coffee\n02-03-2026;-6,00;Tea\n')
    expect(t.headers).toEqual(['Date', 'Amount', 'Text']); expect(t.rows).toHaveLength(2)
  })
  it('is safe on empty input', () => expect(parseCsv('')).toEqual({ headers: [], rows: [] }))
  it('decodes Windows-1252 when the bytes are not valid UTF-8', () => {
    expect(decodeCsv(new Uint8Array([0x43, 0x61, 0x66, 0xe9]).buffer)).toBe('Café')
    expect(decodeCsv(new TextEncoder().encode('Café €').buffer as ArrayBuffer)).toBe('Café €')
  })
})

/* realistic exports */
const ING = `"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"
"20260315";"Albert Heijn 1234 Amsterdam";"NL01INGB0001234567";"";"BA";"Af";"23,45";"Betaalautomaat";"Pasvolgnr: 012 15-03-2026 14:22"
"20260316";"Salaris Werkgever BV";"NL01INGB0001234567";"NL02ABNA0123456789";"OV";"Bij";"2.500,00";"Overschrijving";"Salaris maart"
"20260317";"NS Groep IZ NS Reizigers";"NL01INGB0001234567";"";"BA";"Af";"7,60";"Betaalautomaat";""
"20260318";"Thuisbezorgd.nl";"NL01INGB0001234567";"";"ID";"Af";"1.024,00";"iDEAL";""
"20260319";"Kapot rij";"NL01INGB0001234567";"";"ID";"Af";"abc";"iDEAL";""`
const REVOLUT = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-03-15 12:30:45,2026-03-15 12:31:02,Starbucks Rotterdam,-4.50,0.00,EUR,COMPLETED,995.50
TOPUP,Current,2026-03-16 09:00:00,2026-03-16 09:00:05,Top-Up by *1234,200.00,0.00,EUR,COMPLETED,1195.50
CARD_PAYMENT,Current,2026-03-17 18:10:00,2026-03-17 18:10:03,Spotify,-9.99,0.00,EUR,COMPLETED,1185.51`
const GERMAN = `Konto: DE12 3456 7890
Zeitraum: 01.03.2026 - 31.03.2026

Buchungstag;Wertstellung;Verwendungszweck;Betrag;Währung
05.03.2026;05.03.2026;REWE SAGT DANKE 1234;-45,67;EUR
06.03.2026;06.03.2026;Gehalt;2.800,00;EUR
07.03.2026;07.03.2026;Netflix;-12,99;EUR`
const CARD = `Date,Description,Amount
03/15/2026,AMAZON MKTPLACE,12.50
03/16/2026,PAYMENT THANK YOU,-200.00
03/17/2026,UBER TRIP,8.20
03/20/2026,SHELL OIL,41.00`

describe('detecting a bank export', () => {
  it('ING (semicolons, decimal comma, YYYYMMDD, Af/Bij)', () => {
    const t = parseCsv(ING), m = detectMapping(t)
    expect(m).toEqual({ date: 0, amount: 6, description: 1, direction: 5 })
    const r = readExpenses(t, m, { dateOrder: 'dmy', expensesAre: detectSign(t, m) })
    expect(r.rows.map(x => [x.date, x.cents, x.note])).toEqual([
      ['2026-03-15', 2345, 'Albert Heijn 1234 Amsterdam'], ['2026-03-17', 760, 'NS Groep IZ NS Reizigers'], ['2026-03-18', 102400, 'Thuisbezorgd.nl'],
    ])
    expect(r.skipped).toEqual({ income: 1, unreadable: 1, zero: 0 }) // the salary is not an expense; the junk row is reported, not guessed
  })
  it('Revolut (ISO timestamps, negative amounts; ignores Fee and Balance)', () => {
    const t = parseCsv(REVOLUT), m = detectMapping(t)
    expect(t.headers[m.date]).toBe('Started Date'); expect(t.headers[m.amount]).toBe('Amount'); expect(t.headers[m.description]).toBe('Description'); expect(m.direction).toBeNull()
    const r = readExpenses(t, m, { dateOrder: 'dmy', expensesAre: detectSign(t, m) })
    expect(r.rows.map(x => x.cents)).toEqual([450, 999]); expect(r.skipped.income).toBe(1)
  })
  it('German bank with a preamble and dd.mm.yyyy', () => {
    const t = parseCsv(GERMAN), m = detectMapping(t)
    expect(t.headers[m.date]).toBe('Buchungstag'); expect(t.headers[m.amount]).toBe('Betrag'); expect(t.headers[m.description]).toBe('Verwendungszweck')
    const r = readExpenses(t, m, { dateOrder: detectDateOrder(t.rows.map(x => x[m.date])), expensesAre: detectSign(t, m) })
    expect(r.rows.map(x => [x.date, x.cents])).toEqual([['2026-03-05', 4567], ['2026-03-07', 1299]])
  })
  it('credit card statement: purchases are positive, month-first dates', () => {
    const t = parseCsv(CARD), m = detectMapping(t)
    const order = detectDateOrder(t.rows.map(x => x[m.date]))
    expect(order).toBe('mdy'); expect(detectSign(t, m)).toBe('positive')
    const r = readExpenses(t, m, { dateOrder: order, expensesAre: 'positive' })
    expect(r.rows.map(x => [x.date, x.cents])).toEqual([['2026-03-15', 1250], ['2026-03-17', 820], ['2026-03-20', 4100]]); expect(r.skipped.income).toBe(1)
  })
  it('falls back to looking at the data when headers are unfamiliar', () => {
    const t = parseCsv('Foo,Bar,Baz\n2026-03-01,Coffee shop on the corner,-3.20\n2026-03-02,Bus ticket,-2.80\n2026-03-03,Groceries,-40.00')
    expect(detectMapping(t)).toMatchObject({ date: 0, amount: 2, description: 1 })
  })
  it('caps very large files and says so', () => {
    const body = Array.from({ length: 2100 }, (_, i) => `2026-03-01,Item ${i},-1.00`).join('\n')
    const t = parseCsv('Date,Description,Amount\n' + body), m = detectMapping(t)
    const r = readExpenses(t, m, { dateOrder: 'dmy', expensesAre: 'negative' })
    expect(r.rows).toHaveLength(2000); expect(r.truncated).toBe(true)
  })
})

describe('suggesting categories', () => {
  const cats: Category[] = [
    { id: 'g', name: 'Groceries', emoji: '🛒', budget_cents: 0 }, { id: 'e', name: 'Eating out', emoji: '🍕', budget_cents: 0 },
    { id: 't', name: 'Transport', emoji: '🚌', budget_cents: 0 }, { id: 'x', name: 'Old', emoji: '📦', budget_cents: 0, archived: true },
  ]
  it('ignores bank boilerplate, digits and accents when picking words', () => {
    expect(tokens('BEA NR:XY12 15.03.26 Café Müller 1234 Pas 012')).toEqual(['cafe', 'muller'])
    expect(tokens('Albert Heijn 1234 Amsterdam')).toEqual(['albert', 'heijn', 'amsterdam'])
    expect(tokens('Betaalautomaat SEPA iDEAL')).toEqual([])
  })
  it('the family’s own history comes first', () => {
    const hist = buildHistory([{ note: 'Bakkerij Kramer Utrecht', category_id: 'e' }, { note: 'Bakkerij Kramer', category_id: 'e' }])
    expect(suggestCategory('BEA Bakkerij Kramer 55', hist, cats)).toEqual({ categoryId: 'e', source: 'history' })
  })
  it('a shop seen once is recognised by its words, but a lone city word is not enough', () => {
    const hist = buildHistory([{ note: 'Bakkerij Kramer Utrecht', category_id: 'e' }])
    expect(suggestCategory('Bakkerij Kramer 99', hist, cats)).toEqual({ categoryId: 'e', source: 'history' }) // two matching words
    expect(suggestCategory('Zoe Muller Utrecht', hist, cats)).toBeNull() // only the city matches: a different shop
  })
  it('history beats the built-in keywords', () => {
    const hist = buildHistory([{ note: 'Shell Express shop snacks', category_id: 'e' }, { note: 'Shell Express coffee', category_id: 'e' }])
    expect(suggestCategory('Shell Express', hist, cats)?.categoryId).toBe('e') // would be Transport by keyword
  })
  it('a word seen in many categories is not trusted', () => {
    const hist = buildHistory([{ note: 'Amsterdam a', category_id: 'g' }, { note: 'Amsterdam b', category_id: 'e' }, { note: 'Amsterdam c', category_id: 't' }])
    expect(suggestCategory('Something Amsterdam', hist, cats)).toBeNull()
  })
  it('falls back to starter keywords, matched to the family’s category names', () => {
    expect(suggestCategory('Albert Heijn 1234 Amsterdam', new Map(), cats)).toEqual({ categoryId: 'g', source: 'keyword' })
    expect(suggestCategory('NS Groep IZ NS Reizigers', new Map(), cats)?.categoryId).toBe('t')
  })
  it('short keywords only match whole words', () => {
    expect(suggestCategory('Cooperative society', new Map(), cats)).toBeNull() // "coop" is not "cooperative"
    expect(suggestCategory('Boltzmann Institute', new Map(), cats)).toBeNull()
    expect(suggestCategory('Betaling Coop Utrecht', new Map(), cats)?.categoryId).toBe('g')
  })
  it('never suggests an archived category, or one the family does not have', () => {
    expect(suggestCategory('Netflix', new Map(), cats)).toBeNull() // no "Fun" category here
    expect(suggestCategory('x', buildHistory([{ note: 'zzz store', category_id: 'x' }, { note: 'zzz store', category_id: 'x' }]), cats)).toBeNull()
    expect(suggestCategory('zzz store', buildHistory([{ note: 'zzz store', category_id: 'x' }]), cats)).toBeNull()
  })
  it('returns nothing for an unknown merchant', () => expect(suggestCategory('Qwerty Holdings', new Map(), cats)).toBeNull())
})

describe('duplicates', () => {
  it('matches the same day and amount, one for one', () => {
    const rows = [{ date: '2026-03-15', cents: 450 }, { date: '2026-03-15', cents: 450 }, { date: '2026-03-15', cents: 999 }, { date: '2026-03-16', cents: 450 }]
    expect(markDuplicates(rows, [{ spent_on: '2026-03-15', amount_cents: 450 }])).toEqual([true, false, false, false])
    expect(markDuplicates(rows, [])).toEqual([false, false, false, false])
  })
})

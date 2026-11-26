const { chromium } = require('playwright')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7), Y = now.getFullYear()
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const KID = { user_id: 'k1', family_id: 'f1', display_name: 'Mia', role: 'child', username: 'mia' }
const C = (id, name, emoji = '•') => ({ id, name, emoji, budget_cents: 0, archived: false })
const baseCats = [C('g', 'Groceries', '🛒'), C('t', 'Transport', '🚌'), C('k', 'Kids', '🧸'), C('e', 'Eating out', '🍕'), C('l', 'Leisure', '🎮')]
const tags = [{ id: 't1', name: 'Weekly shop', archived: false }, { id: 't2', name: 'Party', archived: false }]
const results = []; let failed = false
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) failed = true }
const day = (m, d) => `${ym(m)}-${String(d).padStart(2, '0')}`
const prevDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
const cut = Math.min(now.getDate(), prevDays) // last month counts up to this day

async function open(path, o = {}) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: o.width ?? 390, height: 1500 } })
  const log = [], errors = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of [45]\d\d|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  const sess = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: o.asKid ? 'k1' : 'p1', email: 'a@b.c', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now.toISOString() } }
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(sess)])
  const st = { expenses: [], cats: baseCats, summary: [], ...o }
  await page.route(SB + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), p = u.pathname, m = rq.method()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    const json = (x, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(x) })
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (p.startsWith('/rest/v1/rpc/')) {
      const n = p.split('/').pop(), body = rq.postData() ? JSON.parse(rq.postData()) : {}; log.push({ k: 'rpc', n, body })
      if (n === 'year_summary') return json(st.summary)
      return json(n === 'settle_allowance' ? 0 : [])
    }
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop(), single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (m !== 'GET') return json([])
    if (tb === 'expenses') {
      log.push({ k: 'GET', tb, q: u.search })
      let rows = st.expenses; for (const r of u.searchParams.getAll('spent_on')) { const [op, ...v] = r.split('.'); const val = v.join('.'); rows = rows.filter(x => op === 'gte' ? x.spent_on >= val : op === 'lt' ? x.spent_on < val : true) }
      return json(rows)
    }
    const map = { categories: st.cats, members: [P, KID], bills: [], bill_payments: [], tags }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173' + path); await page.waitForTimeout(1100)
  return { b, page, log, errors, st }
}
const x = (id, cat, cents, spent_on, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: cat, amount_cents: cents, note: id, spent_on, bill_id: null, monthly_fee: false, tag_id: null, ...o })
// This month (€2,260): Groceries 720 (540 weekly shop, 100 party, 80 untagged), Transport 480, Kids 410, Eating out 360, Leisure 290.
// Last month (same days): Groceries 660, Transport 515, Kids 370, Eating out 275, Leisure 310.
const data = () => [
  x('g1', 'g', 54000, day(0, 1), { tag_id: 't1' }), x('g2', 'g', 10000, day(0, 1), { tag_id: 't2' }), x('g3', 'g', 8000, day(0, 1)),
  x('t1', 't', 45000, day(0, 1)), x('t2', 't', 3000, day(0, 1), { bill_id: 'b1', monthly_fee: true }), // a monthly fee counts
  x('k1', 'k', 41000, day(0, 1)), x('e1', 'e', 36000, day(0, 1)), x('l1', 'l', 29000, day(0, 1)),
  x('yr', 't', 118000, day(0, 1), { bill_id: 'b2' }), // a yearly bill: kept apart
  x('og', 'g', 66000, day(-1, 1)), x('ot', 't', 51500, day(-1, 1)), x('ok', 'k', 37000, day(-1, 1)), x('oe', 'e', 27500, day(-1, 1)), x('ol', 'l', 31000, day(-1, 1)),
  x('late', 'g', 99900, day(-1, prevDays)), // the last day of last month: only counted when this month has got that far
]
const tab = pg => pg.getByRole('tab', { name: 'Breakdown' })
const text = async (pg, sel) => (await pg.locator(sel).first().innerText()).replace(/\s+/g, ' ')

;(async () => {
  /* ===== the tab and this month ===== */
  let s = await open('/review', { expenses: data() }), pg = s.page
  const tabs = await pg.getByRole('tab').allInnerTexts()
  ok(JSON.stringify(tabs) === JSON.stringify(['This month', 'Year', 'Breakdown', 'Tags']), 'Review has four tabs, Breakdown third: ' + tabs)
  await tab(pg).click(); await pg.waitForSelector('.bd-row')
  ok(await tab(pg).getAttribute('aria-selected') === 'true', 'the Breakdown tab is selected')
  const hero = await text(pg, '.card .big')
  ok(hero === '€2,260', 'total is €2,260: monthly fee counted, the yearly bill is not: ' + hero)
  ok((await text(pg, '.card .muted.small')).includes(`1 to ${now.getDate()}`) || (await text(pg, '.card .muted.small')).includes('Everyday spending'), 'the caption says which days are covered')
  const names = await pg.locator('.bd-name').allInnerTexts(), pcts = await pg.locator('.bd-nums .muted').allInnerTexts()
  ok(JSON.stringify(names.map(n => n.replace(/^\S+\s/, ''))) === JSON.stringify(['Groceries', 'Transport', 'Kids', 'Eating out', 'Leisure']), 'rows are ordered biggest first: ' + names)
  ok(JSON.stringify(pcts) === JSON.stringify(['31.9%', '21.2%', '18.2%', '15.9%', '12.8%']), 'percentages are shares of the total: ' + pcts)
  const amts = await pg.locator('.bd-nums b').allInnerTexts()
  ok(JSON.stringify(amts) === JSON.stringify(['€720', '€480', '€410', '€360', '€290']), 'amounts are shown in whole euros from 100 euro up: ' + amts)
  ok(await pg.locator('.bd-bar > div').count() === 5, 'the share bar has one segment per category')
  ok((await pg.locator('.bd-bar').getAttribute('aria-label')).includes('Groceries 31.9%'), 'the bar has a text alternative with the shares')
  const apart = await text(pg, '.bd-apart')
  ok(apart.includes('€1,180') && apart.includes('kept apart'), 'yearly bills are reported apart, not in the shares: ' + apart)
  ok(await pg.locator('.bd-apart a[href="/plan"]').count() === 1, 'the note links to Plan')

  /* ===== opening a row ===== */
  const first = pg.locator('.bd-row').first()
  ok(await first.getAttribute('aria-expanded') === 'true' && await pg.getByTestId('panel-g').isVisible(), 'the biggest category is open to start with')
  const det = await pg.getByTestId('panel-g').locator('.bd-detail').allInnerTexts()
  ok(det.length === 3 && /Weekly shop\s+€540\s+75%/.test(det[0].replace(/\n/g, ' ')) && /Party\s+€100\s+14%/.test(det[1].replace(/\n/g, ' ')) && /No tag\s+€80\s+11%/.test(det[2].replace(/\n/g, ' ')), 'its tags with shares of the category, No tag last: ' + JSON.stringify(det))
  const link = pg.getByTestId('panel-g').locator('a.bd-link')
  ok((await link.getAttribute('href')) === `/review?category=g&month=${ym(0)}`, 'the link opens the existing category page for the same month: ' + await link.getAttribute('href'))
  await pg.locator('.bd-row').nth(1).click()
  ok(await pg.getByTestId('panel-t').isVisible() && await pg.getByTestId('panel-g').count() === 0, 'opening another row shows its tags and closes the first')
  ok(await pg.getByTestId('panel-t').locator('.bd-detail').count() === 1, 'Transport has no tags: one "No tag" line')
  await pg.locator('.bd-row').nth(1).click()
  ok(await pg.getByTestId('panel-t').count() === 0, 'tapping an open row closes it')
  await pg.screenshot({ path: `${S}/ui/breakdown-month.png`, fullPage: true })

  /* ===== comparison ===== */
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-IE', { month: 'long' })
  const lastShort = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-IE', { month: 'short' })
  const withLate = cut >= prevDays ? 99900 : 0
  const prevTotal = 66000 + 51500 + 37000 + 27500 + 31000 + withLate, diff = 226000 - prevTotal
  ok(await pg.getByRole('switch').isChecked(), 'comparison with last month is ON by default')
  const dtext = await text(pg, 'p.bd-delta')
  ok(dtext.includes(`${diff > 0 ? '▲' : '▼'} €${Math.abs(diff / 100).toLocaleString('en-IE')}`) && dtext.includes(lastMonth) && dtext.includes(now.getDate() > 0 ? 'so far' : ''), 'the headline compares with the same days of last month: ' + dtext + ' (expected ' + diff + ')')
  const rowDeltas = await pg.locator('.bd-main .bd-delta').allInnerTexts()
  const gDiff = 72000 - (66000 + withLate)
  ok(rowDeltas.length === 5 && rowDeltas[0].includes(gDiff >= 0 ? '▲' : '▼') && rowDeltas[0].includes(`vs ${lastShort}`), 'each row says how it moved: ' + JSON.stringify(rowDeltas))
  ok(rowDeltas[1].includes('▼ €35') && rowDeltas[2].includes('▲ €40') && rowDeltas[3].includes('▲ €85') && rowDeltas[4].includes('▼ €20'), 'the changes are right (Transport -35, Kids +40, Eating out +85, Leisure -20): ' + JSON.stringify(rowDeltas.slice(1)))
  await pg.getByRole('switch').uncheck()
  ok(await pg.locator('.bd-delta').count() === 0, 'turning comparison off hides every change')
  await pg.getByRole('switch').check()
  ok(await pg.locator('.bd-delta').count() === 6, 'turning it on brings them back')

  /* ===== moving between months ===== */
  ok(await pg.getByRole('button', { name: 'Next month' }).isDisabled(), 'you cannot go past this month')
  const before = s.log.filter(l => l.tb === 'expenses').length
  await pg.getByRole('button', { name: 'Previous month' }).click(); await pg.waitForTimeout(700)
  ok((await text(pg, '.stepper strong')).includes(new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-IE', { month: 'long' })), 'the previous month is shown')
  const asked = s.log.filter(l => l.tb === 'expenses').slice(before).map(l => decodeURIComponent(l.q))
  ok(asked.length >= 1 && asked[asked.length - 1].includes(`spent_on=gte.${day(-2, 1)}`) && asked[asked.length - 1].includes(`spent_on=lt.${day(0, 1)}`), 'it reads that month and the one before it: ' + asked.join(' '))
  const hero2 = await text(pg, '.card .big')
  ok(hero2 === '€' + ((66000 + 51500 + 37000 + 27500 + 31000 + 99900) / 100).toLocaleString('en-IE'), 'last month total (all of it, including its last day): ' + hero2)
  ok(!(await pg.locator('.card .muted.small').first().innerText()).includes(' to '), 'a finished month is described as the whole month')
  await pg.getByRole('button', { name: 'Next month' }).click(); await pg.waitForTimeout(500)
  ok(await text(pg, '.card .big') === '€2,260', 'back to this month')

  /* ===== the year ===== */
  const summary = []
  const put = (month, cat, cents, is_bill = false) => summary.push({ month, category_id: cat, is_bill, total_cents: cents })
  for (let m = 1; m <= 11; m++) { put(m, 'g', 70000); put(m, 't', 50000); put(m, 'k', 40000); put(m, 'e', 35000); put(m, 'l', 20000 + (m === 7 ? 30000 : 0)) }
  put(3, 't', 118000, true)
  await s.b.close()
  s = await open('/review', { expenses: data(), summary }); pg = s.page
  await tab(pg).click(); await pg.waitForSelector('.bd-row')
  await pg.getByRole('button', { name: 'Year', exact: true }).last().click(); await pg.waitForSelector('.bd-mix')
  ok(s.log.some(l => l.k === 'rpc' && l.n === 'year_summary' && l.body.y === Y), 'the year view asks for this year')
  const yearTotal = 11 * (70000 + 50000 + 40000 + 35000 + 20000) + 30000
  const yh = await text(pg, '.card .big')
  ok(yh === '€' + (yearTotal / 100).toLocaleString('en-IE'), 'year total excludes the yearly bill: ' + yh)
  ok(await pg.locator('.bd-row.static').count() === 5 && await pg.locator('button.bd-row').count() === 0, 'year rows list every category (no rows to open)')
  ok((await text(pg, '.bd-row.static .bd-main')).includes('a month'), 'each row says what it is per month')
  ok(await pg.locator('.bd-col').count() === 12, 'the mix chart has 12 columns')
  ok(await pg.locator('.bd-col').nth(11).evaluate(e => getComputedStyle(e).opacity) === '0.15', 'a month with no data is faded')
  ok(await pg.locator('.bd-apart').count() === 1 && (await text(pg, '.bd-apart')).includes('€1,180'), 'yearly bills are mentioned apart')
  await pg.getByRole('button', { name: 'Previous year' }).click(); await pg.waitForTimeout(500)
  ok(s.log.some(l => l.k === 'rpc' && l.n === 'year_summary' && l.body.y === Y - 1), 'the previous year is requested')
  await pg.screenshot({ path: `${S}/ui/breakdown-year.png`, fullPage: true })
  await s.b.close()

  /* ===== many categories, empty month, children, wide screens ===== */
  const many = ['g', 't', 'k', 'e', 'l', 'h', 'm', 'o'].map((id, i) => C(id, ['Groceries', 'Transport', 'Kids', 'Eating out', 'Leisure', 'Home', 'Health', 'Other'][i]))
  const manyData = [x('a1', 'g', 72000, day(0, 1)), x('a2', 't', 48000, day(0, 1)), x('a3', 'k', 41000, day(0, 1)), x('a4', 'e', 36000, day(0, 1)), x('a5', 'l', 29000, day(0, 1)), x('a6', 'h', 27000, day(0, 1)), x('a7', 'm', 19000, day(0, 1)), x('a8', 'o', 12000, day(0, 1))]
  s = await open('/review', { expenses: manyData, cats: many }); pg = s.page
  await tab(pg).click(); await pg.waitForSelector('.bd-row')
  const mn = await pg.locator('.bd-name').allInnerTexts()
  ok(mn.length === 6 && mn[5].includes('3 more categories'), 'eight categories show as five plus "3 more categories": ' + mn)
  ok((await text(pg, '.bd-nums >> nth=5')).includes('€580') && (await text(pg, '.bd-nums >> nth=5')).includes('20.4%'), 'the group has the combined amount and share')
  await pg.locator('.bd-row').nth(5).click()
  const gd = (await pg.getByTestId('panel-more').locator('.bd-detail').allInnerTexts()).map(t => t.replace(/\s+/g, ' '))
  ok(gd.length === 3 && gd[0].includes('Home') && gd[0].includes('9.5%') && gd[2].includes('Other') && gd[2].includes('4.2%'), 'opening it lists what is inside, with shares of all spending: ' + JSON.stringify(gd))
  ok(await pg.getByTestId('panel-more').locator('a').count() === 0, 'a group has no single page to open')
  const sum = (await pg.locator('.bd-nums .muted').allInnerTexts()).reduce((a, t) => a + parseFloat(t), 0)
  ok(Math.abs(sum - 100) < 0.05, 'the shares of all rows add up to 100: ' + sum)
  await s.b.close()

  s = await open('/review', { expenses: [] }); pg = s.page
  await tab(pg).click(); await pg.waitForTimeout(600)
  ok((await pg.locator('main').innerText()).includes('Nothing to show yet') && await pg.locator('.bd-row').count() === 0, 'a month without spending says so')
  await s.b.close()

  s = await open('/review', { expenses: data(), asKid: true }); pg = s.page
  ok(new URL(pg.url()).pathname === '/' && await pg.getByRole('tab', { name: 'Breakdown' }).count() === 0, 'children do not get the Breakdown tab (they are sent Home)')
  await s.b.close()

  s = await open('/review', { expenses: data() }); pg = s.page
  await tab(pg).click(); await pg.waitForSelector('.bd-row')
  ok(await pg.getByRole('button', { name: 'Flow' }).count() === 0, 'on a phone there is no Flow button (the list is the view)')
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scrolling on a phone')
  await s.b.close()

  s = await open('/review', { expenses: data(), width: 900 }); pg = s.page
  await tab(pg).click(); await pg.waitForSelector('.bd-row')
  await pg.getByRole('button', { name: 'Flow' }).click()
  ok(await pg.locator('svg.flow').count() === 1 && await pg.locator('svg.flow path').count() === 5, 'on a wide screen the flow diagram has one band per category')
  ok((await pg.locator('svg.flow').getAttribute('aria-label')).includes('Groceries €720'), 'the diagram has a text alternative')
  const labels = await pg.locator('svg.flow text').allTextContents()
  ok(labels.includes('€2,260') && labels.some(t => t.includes('€720 · 31.9%')), 'the diagram is labelled with amounts and shares: ' + JSON.stringify(labels.slice(0, 4)))
  ok(await pg.locator('.bd-row').count() === 5, 'the list is still there under the diagram')
  await pg.screenshot({ path: `${S}/ui/breakdown-flow.png`, fullPage: true })
  await pg.getByRole('button', { name: 'List' }).click()
  ok(await pg.locator('svg.flow').count() === 0, 'switching back to List hides the diagram')
  ok(s.errors.length === 0, 'no page errors: ' + s.errors.join(' | '))
  await s.b.close()

  console.log(results.join('\n')); console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${results.filter(r => r.startsWith('FAIL')).length} failed`)
  process.exit(failed ? 1 : 0)
})().catch(e => { console.log(results.join('\n')); console.error('CRASH', e); process.exit(1) })

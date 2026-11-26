const { chromium } = require('playwright')
const { withEt, flat, tagsOf } = require('./etshim.cjs')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7), Y = now.getFullYear()
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const KID = { user_id: 'k1', family_id: 'f1', display_name: 'Mia', role: 'child', username: 'mia' }
const C = (id, name, emoji = '•') => ({ id, name, emoji, budget_cents: 0, archived: false })
const B = (c, cents) => ({ ...c, budget_cents: cents })
const baseCats = [B(C('g', 'Groceries', '🛒'), 100000), B(C('t', 'Transport', '🚌'), 60000), B(C('k', 'Kids', '🧸'), 60000), B(C('e', 'Eating out', '🍕'), 30000), C('l', 'Leisure', '🎮')]
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
      if (n === 'year_summary_by_tag') return json(st.tagSummary || [])
      if (n === 'tags_total') return json([{ total_cents: 249000, n: 38 }])
      return json(n === 'settle_allowance' ? 0 : [])
    }
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop(), single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (m !== 'GET') return json([])
    if (tb === 'expenses') {
      log.push({ k: 'GET', tb, q: u.search })
      let rows = st.expenses; for (const r of u.searchParams.getAll('spent_on')) { const [op, ...v] = r.split('.'); const val = v.join('.'); rows = rows.filter(x => op === 'gte' ? x.spent_on >= val : op === 'lt' ? x.spent_on < val : true) }
      const want = (u.searchParams.get('expense_tags.tag_id') || '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean)
      if (want.length) rows = rows.filter(x => tagsOf(x).some(t => want.includes(t)))
      if (u.searchParams.get('expense_tags') === 'is.null') rows = rows.filter(x => !tagsOf(x).length)
      return json(withEt(rows))
    }
    if (tb === 'expense_tags') { const ids = (decodeURIComponent(u.search).match(/expense_id=in\.\(([^)]*)\)/) || [])[1]; const all = flat(st.expenses); return json(ids ? all.filter(r => ids.split(',').includes(r.expense_id)) : all) }
    const map = { categories: st.cats, members: [P, KID], bills: [], bill_payments: [], tags, goals: st.goals || [], goal_contributions: st.contribs || [] }
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
  x('twoago', 'g', 100000, day(-2, 1)), // the month before last: what a finished month is compared with
  x('late', 'g', 99900, day(-1, prevDays)), // the last day of last month: only counted when this month has got that far
]
const text = async (pg, sel) => (await pg.locator(sel).first().innerText()).replace(/\s+/g, ' ')
const heads = pg => pg.locator('main h2').allInnerTexts()

;(async () => {
  /* ===== the tabs, and this month ===== */
  let s = await open('/review', { expenses: data() }), pg = s.page
  await pg.waitForSelector('.bd-row')
  ok(JSON.stringify(await pg.getByRole('tab').allInnerTexts()) === JSON.stringify(['Month', 'Year']), 'Review has two tabs: Month and Year (tags are a filter now)')
  ok(await pg.getByRole('tab', { name: 'Month' }).getAttribute('aria-selected') === 'true', 'it opens on Month')
  ok(!(await pg.getByRole('tab').allInnerTexts()).includes('Breakdown') && !(await pg.getByRole('tab').allInnerTexts()).includes('This month'), 'no Breakdown tab and no "This month" tab any more')
  const monthLabel = new Date().toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
  ok((await text(pg, '.stepper strong')) === monthLabel && await pg.getByRole('button', { name: 'Next month' }).isDisabled(), 'it opens on the current month, and you cannot go beyond it')
  ok((await text(pg, '.card .big')) === '€2,260', 'total is €2,260: monthly fee counted, the yearly bill is not: ' + await text(pg, '.card .big'))
  const main = await pg.locator('main').innerText()
  ok(!/Wins|Worth a look|Comfortably within budget|family meeting|How \w+ (is going|went)|Goals/.test(main), 'the old review cards, the family-meeting card and the Goals card are gone from Month')
  const names = await pg.locator('.bd-name').allInnerTexts(), pcts = await pg.locator('.bd-nums .muted').allInnerTexts()
  ok(JSON.stringify(names.map(n => n.replace(/^\S+\s/, ''))) === JSON.stringify(['Groceries', 'Transport', 'Kids', 'Eating out', 'Leisure']), 'rows are ordered biggest first: ' + names)
  ok(JSON.stringify(pcts) === JSON.stringify(['31.9%', '21.2%', '18.2%', '15.9%', '12.8%']), 'percentages are shares of the total: ' + pcts)
  const apart = await text(pg, '.bd-apart')
  ok(apart.includes('€1,180') && apart.includes('kept apart') && await pg.locator('.bd-apart a[href="/plan"]').count() === 1, 'yearly bills are reported apart, with a link to Plan: ' + apart)

  /* ===== pie by default, bars on request, remembered ===== */
  ok(await pg.locator('svg.pie').count() === 1 && await pg.locator('.bd-bar').count() === 0, 'the pie is the default view')
  ok(await pg.locator('.pie-slice').count() === 5, 'one slice per category')
  ok(JSON.stringify(await pg.locator('.pie-name').allTextContents()) === JSON.stringify(['Groceries', 'Transport', 'Kids', 'Eating out', 'Leisure']), 'every slice is named by its own label')
  ok(JSON.stringify(await pg.locator('.pie-pct').allTextContents()) === JSON.stringify(['31.9%', '21.2%', '18.2%', '15.9%', '12.8%']), 'and shows its share')
  ok(await pg.locator('.pie-lead').count() === 5, 'with a leader line to the slice')
  ok((await pg.locator('svg.pie').getAttribute('aria-label')).includes('Groceries 31.9%'), 'the pie has a text alternative')
  ok(await pg.getByRole('button', { name: 'Pie' }).getAttribute('aria-pressed') === 'true' && await pg.getByRole('button', { name: 'Flow' }).count() === 0, 'the switch shows Pie as chosen, and no Flow button on a phone')
  await pg.screenshot({ path: `${S}/ui/review-month.png`, fullPage: true })
  await pg.getByRole('button', { name: 'Bars' }).click()
  ok(await pg.locator('.bd-bar').count() === 1 && await pg.locator('svg.pie').count() === 0, 'Bars shows the share bar instead')
  await pg.reload(); await pg.waitForSelector('.bd-row')
  ok(await pg.locator('.bd-bar').count() === 1, 'the choice is remembered on the device')
  await pg.getByRole('button', { name: 'Pie' }).click()
  ok(await pg.locator('svg.pie').count() === 1, 'and Pie brings the pie back')

  /* ===== budget hints ===== */
  const hint = n => pg.locator(`.bd-item:has(.bd-name:has-text("${n}")) .bd-budget`)
  ok((await hint('Groceries').innerText()).includes('€280 left of €1,000') && await hint('Groceries').getAttribute('data-state') === 'ok', 'Groceries: €280 left of €1,000')
  ok((await hint('Transport').innerText()).includes('€120 left of €600, nearly used') && await hint('Transport').getAttribute('data-state') === 'near', 'Transport: nearly used from 80%')
  ok((await hint('Kids').innerText()).includes('€190 left of €600'), 'Kids: €190 left')
  ok((await hint('Eating out').innerText()).includes('€60 over its €300 budget') && await hint('Eating out').getAttribute('data-state') === 'over', 'Eating out: over, in words')
  ok(await hint('Leisure').count() === 0, 'a category without a budget shows no hint')
  ok(await pg.locator('.bd-budget-bar i.over').first().evaluate(e => e.style.width) === '100%', 'an overspent bar is capped at full')

  /* ===== comparison ===== */
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-IE', { month: 'long' })
  const lastShort = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-IE', { month: 'short' })
  const withLate = cut >= prevDays ? 99900 : 0
  const diff = 226000 - (66000 + 51500 + 37000 + 27500 + 31000 + withLate)
  ok(await pg.getByRole('switch').isChecked(), 'comparison with last month is ON by default')
  const dtext = await text(pg, 'p.bd-delta')
  ok(dtext.includes(`${diff > 0 ? '▲' : '▼'} €${Math.abs(diff / 100).toLocaleString('en-IE')}`) && dtext.includes(lastMonth) && dtext.includes('so far'), 'the headline compares with the same days of last month: ' + dtext)
  const rowDeltas = await pg.locator('.bd-main .bd-delta').allInnerTexts()
  ok(rowDeltas[1].includes('▼ €35') && rowDeltas[2].includes('▲ €40') && rowDeltas[3].includes('▲ €85') && rowDeltas[4].includes('▼ €20') && rowDeltas[0].includes(`vs ${lastShort}`), 'each row says how it moved: ' + JSON.stringify(rowDeltas))
  await pg.getByRole('switch').uncheck()
  ok(await pg.locator('.bd-delta').count() === 0 && await hint('Groceries').count() === 1, 'turning comparison off hides the changes but keeps the budget hints')
  await pg.getByRole('switch').check()

  /* ===== opening a row ===== */
  ok(await pg.locator('.bd-row').first().getAttribute('aria-expanded') === 'true' && await pg.getByTestId('panel-g').isVisible(), 'the biggest category is open to start with')
  const det = (await pg.getByTestId('panel-g').locator('.bd-detail').allInnerTexts()).map(t => t.replace(/\n/g, ' '))
  ok(det.length === 3 && /Weekly shop\s+€540\s+75%/.test(det[0]) && /Party\s+€100\s+14%/.test(det[1]) && /No tag\s+€80\s+11%/.test(det[2]), 'its tags with shares of the category, No tag last: ' + JSON.stringify(det))
  ok((await pg.getByTestId('panel-g').locator('a.bd-link').getAttribute('href')) === `/review?category=g&month=${ym(0)}`, 'the link opens the category page for the same month')
  await pg.locator('.bd-row').nth(1).click()
  ok(await pg.getByTestId('panel-t').isVisible() && await pg.getByTestId('panel-g').count() === 0, 'opening another row shows its tags and closes the first')

  /* ===== moving between months ===== */
  const before = s.log.filter(l => l.tb === 'expenses').length
  await pg.getByRole('button', { name: 'Previous month' }).click(); await pg.waitForTimeout(700)
  ok((await text(pg, '.stepper strong')).includes(lastMonth), 'the previous month is shown')
  const asked = s.log.filter(l => l.tb === 'expenses').slice(before).map(l => decodeURIComponent(l.q))
  ok(asked.length >= 1 && asked[asked.length - 1].includes(`spent_on=gte.${day(-2, 1)}`) && asked[asked.length - 1].includes(`spent_on=lt.${day(0, 1)}`), 'it reads that month and the one before it')
  ok((await text(pg, '.card .big')) === '€' + ((66000 + 51500 + 37000 + 27500 + 31000 + 99900) / 100).toLocaleString('en-IE'), 'last month total (all of it, including its last day): ' + await text(pg, '.card .big'))
  ok(!(await pg.locator('.card .muted.small').first().innerText()).includes(' to '), 'a finished month is described as the whole month')
  ok((await text(pg, 'p.bd-delta')).includes('than ' + new Date(now.getFullYear(), now.getMonth() - 2, 1).toLocaleDateString('en-IE', { month: 'long' })) && !(await text(pg, 'p.bd-delta')).includes('so far'), 'and compared with the whole month before it')
  const past = await text(pg, '.bd-item:has(.bd-name:has-text("Kids")) .bd-budget')
  ok(past.includes('Ended') && past.includes('under its €600 budget'), 'budget hints are worded as a result for a finished month: ' + past)
  ok(!/Wins|Worth a look|How \w+ went/.test(await pg.locator('main').innerText()), 'no review cards on an earlier month either')
  await pg.getByRole('button', { name: 'Next month' }).click(); await pg.waitForTimeout(500)
  ok(await text(pg, '.card .big') === '€2,260', 'back to this month')
  await s.b.close()

  /* ===== the year ===== */
  const summary = []
  const put = (month, cat, cents, is_bill = false) => summary.push({ month, category_id: cat, is_bill, total_cents: cents })
  for (let m = 1; m <= 11; m++) { put(m, 'g', 70000); put(m, 't', 50000); put(m, 'k', 40000); put(m, 'e', 35000); put(m, 'l', 20000 + (m === 7 ? 30000 : 0)) }
  put(3, 't', 118000, true)
  const goals = [{ id: 'goal1', name: 'Summer holiday', emoji: '🏖', target_cents: 300000, status: 'active', created_at: '2026-01-01T00:00:00Z' }, { id: 'goal2', name: 'Done one', emoji: '✅', target_cents: 1000, status: 'reached', created_at: '2026-01-01T00:00:00Z' }]
  const contribs = [{ id: 'c1', goal_id: 'goal1', member_id: 'p1', amount_cents: 145000, source: 'cash', created_at: '2026-03-01T00:00:00Z' }]
  s = await open('/review', { expenses: data(), summary, goals, contribs }); pg = s.page
  await pg.waitForSelector('.bd-row')
  await pg.getByRole('tab', { name: 'Year' }).click(); await pg.waitForSelector('.bd-mix')
  ok(s.log.some(l => l.k === 'rpc' && l.n === 'year_summary' && l.body.y === Y), 'the year view asks for this year')
  const yearTotal = 11 * (70000 + 50000 + 40000 + 35000 + 20000) + 30000
  ok((await text(pg, '.hero')) === '€' + ((yearTotal + 118000) / 100).toLocaleString('en-IE'), 'the Year total is everyday spending plus the yearly bill: ' + await text(pg, '.hero'))
  ok((await pg.locator('.tile').allInnerTexts()).join(' ').includes('Yearly bills'), 'with its tiles (everyday, yearly bills, per month, busiest month)')
  ok(JSON.stringify(await heads(pg)) === JSON.stringify(['Where the money went', 'Spending by month', 'How the mix changed', 'Goals']), 'sections in order: Where the money went, Spending by month, How the mix changed, Goals: ' + JSON.stringify(await heads(pg)))
  ok(await pg.locator('svg.pie').count() === 1 && await pg.locator('.pie-slice').count() === 5 && await pg.getByRole('button', { name: 'Pie' }).getAttribute('aria-pressed') === 'true', 'the pie is the default here too')
  ok((await pg.locator('.pie-pct').allTextContents()).every(t => /^\d+\.\d%$/.test(t)) && Math.abs((await pg.locator('.pie-pct').allTextContents()).reduce((a, t) => a + parseFloat(t), 0) - 100) < 0.05, 'the pie labels show shares that add up to 100')
  const yr = await pg.locator('.bd-row.static').allInnerTexts()
  ok(yr.length === 5 && yr[0].includes('a month') && await pg.locator('button.bd-row').count() === 0, 'a list under it with the average per month (nothing to open)')
  await pg.getByRole('button', { name: 'Bars' }).click()
  ok(await pg.locator('.bd-bar').count() === 1 && await pg.locator('svg.pie').count() === 0 && await pg.locator('.bars .bar-row').count() === 5, 'Bars keeps the budget bars of the Year view (one row per category)')
  ok(await pg.locator('.bar-tick').count() >= 1, 'with the yearly budget marks')
  await pg.getByRole('button', { name: 'Pie' }).click()
  ok(await pg.locator('.bd-col').count() === 12 && await pg.locator('.bd-col').nth(11).evaluate(e => getComputedStyle(e).opacity) === '0.15', 'the mix chart has 12 columns, a month with no data is faded')
  ok(await pg.locator('.viz svg[aria-label^="Spending by month"]').count() === 1, 'the monthly chart is there')
  const goalText = await text(pg, 'section:has(h2:text-is("Goals"))')
  ok(goalText.includes('Summer holiday') && goalText.includes('€1,450') && goalText.includes('€3,000') && goalText.includes('48%') && !goalText.includes('Done one'), 'Goals: active goals with progress, finished ones left out: ' + goalText)
  ok(await pg.locator('a[href="/goals"]:has-text("Open Goals")').count() === 1, 'with a link to Goals')
  ok(await pg.locator('.bd-apart').count() === 1 && (await text(pg, '.bd-apart')).includes('€1,180'), 'yearly bills are mentioned apart')
  await pg.getByRole('button', { name: 'Previous year' }).click(); await pg.waitForTimeout(500)
  ok(s.log.some(l => l.k === 'rpc' && l.n === 'year_summary' && l.body.y === Y - 1) && (await heads(pg)).includes('Goals'), 'the previous year is requested; goals still show today\'s progress')
  await pg.screenshot({ path: `${S}/ui/review-year.png`, fullPage: true })
  await s.b.close()

  s = await open('/review', { expenses: data(), summary: [], goals: [] }); pg = s.page
  await pg.getByRole('tab', { name: 'Year' }).click(); await pg.waitForTimeout(700)
  ok(!(await heads(pg)).includes('Goals') && (await pg.locator('main').innerText()).includes('No everyday spending recorded'), 'an empty year says so, and without goals there is no Goals card')
  await s.b.close()

  /* ===== many categories, empty month, children, wide screens ===== */
  const many = ['g', 't', 'k', 'e', 'l', 'h', 'm', 'o'].map((id, i) => C(id, ['Groceries', 'Transport', 'Kids', 'Eating out', 'Leisure', 'Home', 'Health', 'Other'][i]))
  const manyData = [x('a1', 'g', 72000, day(0, 1)), x('a2', 't', 48000, day(0, 1)), x('a3', 'k', 41000, day(0, 1)), x('a4', 'e', 36000, day(0, 1)), x('a5', 'l', 29000, day(0, 1)), x('a6', 'h', 27000, day(0, 1)), x('a7', 'm', 19000, day(0, 1)), x('a8', 'o', 12000, day(0, 1))]
  s = await open('/review', { expenses: manyData, cats: many }); pg = s.page
  await pg.waitForSelector('.bd-row')
  const mn = await pg.locator('.bd-name').allInnerTexts()
  ok(mn.length === 6 && mn[5].includes('3 more categories'), 'eight categories show as five plus "3 more categories": ' + mn)
  ok(await pg.locator('.pie-slice').count() === 6 && (await pg.locator('.pie-name').allTextContents())[5] === '3 more categories', 'the pie has six slices, the last is the group, with its full name')
  ok(await pg.locator('.bd-item:has(.bd-name:has-text("3 more")) .bd-budget').count() === 0, 'a group has no budget hint')
  await pg.locator('.bd-row').nth(5).click()
  const gd = (await pg.getByTestId('panel-more').locator('.bd-detail').allInnerTexts()).map(t => t.replace(/\s+/g, ' '))
  ok(gd.length === 3 && gd[0].includes('Home') && gd[0].includes('9.5%') && gd[2].includes('Other') && gd[2].includes('4.2%'), 'opening it lists what is inside: ' + JSON.stringify(gd))
  const sum = (await pg.locator('.bd-nums .muted').allInnerTexts()).reduce((a, t) => a + parseFloat(t), 0)
  ok(Math.abs(sum - 100) < 0.05, 'the shares of all rows add up to 100: ' + sum)
  await s.b.close()

  s = await open('/review', { expenses: [] }); pg = s.page
  await pg.waitForTimeout(600)
  ok((await pg.locator('main').innerText()).includes('Nothing to show yet') && await pg.locator('.bd-row').count() === 0 && await pg.locator('svg.pie').count() === 0, 'a month without spending says so')
  await s.b.close()

  s = await open('/review', { expenses: data(), asKid: true }); pg = s.page
  ok(new URL(pg.url()).pathname === '/' && await pg.getByRole('tab', { name: 'Month' }).count() === 0, 'children do not get the Review tabs (they are sent Home)')
  await s.b.close()

  s = await open('/review', { expenses: data() }); pg = s.page
  await pg.waitForSelector('.bd-row')
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scrolling on a phone')
  const box = await pg.locator('svg.pie').boundingBox()
  ok(box && box.width <= 340 && box.x >= 0 && box.x + box.width <= 390, 'the pie fits the screen')
  await s.b.close()

  s = await open('/review', { expenses: data(), width: 900 }); pg = s.page
  await pg.waitForSelector('.bd-row')
  ok(await pg.getByRole('button', { name: 'Flow' }).count() === 1, 'on a wide screen there is a Flow choice too')
  await pg.getByRole('button', { name: 'Flow' }).click()
  ok(await pg.locator('svg.flow').count() === 1 && await pg.locator('svg.pie').count() === 0, 'Flow shows the flow diagram')
  ok(await pg.locator('svg.flow').getAttribute('viewBox') === '0 0 760 470', 'at 900 px and up it uses the wide diagram')
  ok(await pg.locator('svg.flow path').count() === 8, 'five category bands plus three tag bands for the picked category (Groceries): ' + await pg.locator('svg.flow path').count())
  const flowText = (await pg.locator('svg.flow text').allTextContents()).join(' | ')
  ok(flowText.includes('Weekly shop') && flowText.includes('€540') && flowText.includes('75%') && flowText.includes('No tag') && flowText.includes('Tags in Groceries') && flowText.includes('share of the category'), 'the third level shows Groceries\' tags with amounts and shares: ' + flowText.slice(0, 200))
  ok(await pg.locator('.flow-pick').count() === 1, 'the picked category is outlined')
  ok((await pg.locator('svg.flow').getAttribute('aria-label')).includes('Groceries is made of Weekly shop €540'), 'the diagram\'s text alternative names the tags too')
  ok(await pg.locator('.bd-row.picked').count() === 1 && await pg.locator('.bd-row[aria-pressed="true"]').count() === 1 && await pg.locator('.bd-panel').count() === 0, 'in the list the picked category is marked (rows act as a picker, no inline panel)')
  await pg.locator('.bd-row:has-text("Eating out")').click(); await pg.waitForTimeout(200)
  const flow2 = (await pg.locator('svg.flow text').allTextContents()).join(' | ')
  ok(flow2.includes('Tags in Eating out') && flow2.includes('No tag') && !flow2.includes('Weekly shop') && await pg.locator('svg.flow path').count() === 6, 'picking another category shows its tags instead: ' + flow2.slice(0, 160))
  ok((await pg.locator('a.bd-link').getAttribute('href')) === `/review?category=e&month=${ym(0)}`, 'with a link to every expense in the picked category')
  const stackedFlow = await pg.locator('.rv-grid > section').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.y), Math.round(r.width)] }))
  ok(stackedFlow.length === 2 && stackedFlow[1][0] > stackedFlow[0][0] && stackedFlow[0][1] >= 800, 'between 900 and 1,180 px the diagram gets the full width and the list sits underneath: ' + JSON.stringify(stackedFlow))
  await pg.screenshot({ path: `${S}/ui/review-wide-flow.png`, fullPage: true })
  await pg.getByRole('tab', { name: 'Year' }).click(); await pg.waitForTimeout(600)
  ok(await pg.locator('svg.flow').count() === 0 && await pg.getByRole('button', { name: 'Flow' }).count() === 0, 'the Year view has no Flow (it is for one month), it falls back to the pie')
  ok(s.errors.length === 0, 'no page errors: ' + s.errors.join(' | '))
  await s.b.close()

  /* ===== the wide layout: 1,120 px, two columns ===== */
  s = await open('/review', { expenses: data(), summary, goals, contribs, width: 1400 }); pg = s.page
  await pg.waitForSelector('.bd-row')
  const mainBox = await pg.locator('main').boundingBox()
  ok(mainBox.width >= 1119 && mainBox.width <= 1121, 'on a large screen the Review content is 1,120 px wide: ' + mainBox.width)
  const cards = await pg.locator('.rv-grid > section').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)] }))
  ok(cards.length === 2 && cards[1][0] > cards[0][0] + cards[0][2] - 2 && Math.abs(cards[0][1] - cards[1][1]) < 30 && cards[1][2] === 440, 'Month has two columns side by side: the pie on the left, the list (440 px) on the right: ' + JSON.stringify(cards))
  await pg.getByRole('button', { name: 'Flow' }).click()
  const cards2 = await pg.locator('.rv-grid > section').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)))
  ok(cards2[1] === 340, 'with Flow the list column is 340 px')
  await pg.getByRole('tab', { name: 'Year' }).click(); await pg.waitForSelector('.bd-mix')
  await pg.getByRole('button', { name: 'Pie' }).click()
  const where = await pg.locator('.rv-where').evaluate(e => { const k = [...e.children].map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)] }); return k })
  ok(where.length === 2 && where[1][0] >= where[0][0] + where[0][1] - 2 && where[0][1] === 500, 'Year: the pie (500 px) and its list sit side by side: ' + JSON.stringify(where))
  ok((await pg.locator('.viz svg[aria-label^="Spending by month"]').getAttribute('viewBox')) === '0 0 960 260', 'the monthly chart uses the wide shape')
  const pair = await pg.locator('.rv-pair > section').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().x)))
  ok(pair.length === 2 && pair[1] > pair[0], 'How the mix changed and Goals are side by side')
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scrolling')
  await pg.screenshot({ path: `${S}/ui/review-wide-year.png`, fullPage: true })
  await s.b.close()

  s = await open('/review', { expenses: data(), summary, goals, contribs, width: 700 }); pg = s.page
  await pg.waitForSelector('.bd-row')
  const narrow = await pg.locator('main').boundingBox()
  ok(narrow.width <= 561, 'below 900 px the page keeps the phone column: ' + narrow.width)
  const stacked = await pg.locator('.rv-grid > section').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().y)))
  ok(stacked.length === 2 && stacked[1] > stacked[0], 'and the cards are stacked')
  await pg.getByRole('button', { name: 'Flow' }).click()
  ok(await pg.locator('svg.flow').getAttribute('viewBox') !== '0 0 760 470' && await pg.locator('svg.flow path').count() === 5, 'with Flow between 600 and 900 px the compact two-level diagram is used')
  await s.b.close()


  /* ===== the tag filter: several tags per expense, several tags at once ===== */
  const withBoth = () => [...data(), x('both', 'l', 2000, day(0, 1), { tag_ids: ['t1', 't2'] })]
  s = await open('/review', { expenses: withBoth().map(e => (e.tag_id ? { ...e, tag_ids: [e.tag_id], tag_id: null } : e)), tagSummary: [{ month: 11, category_id: 'g', is_bill: false, total_cents: 12000 }] }); pg = s.page
  await pg.waitForSelector('.bd-row')
  const chipRow = pg.locator('[aria-label="Filter by tag"]')
  ok(JSON.stringify(await chipRow.locator('button').allInnerTexts()) === JSON.stringify(['All spending', '#Weekly shop', '#Party', 'No tag']), 'the tag filter offers All spending, each tag and No tag: ' + JSON.stringify(await chipRow.locator('button').allInnerTexts()))
  ok(await chipRow.getByRole('button', { name: 'All spending' }).getAttribute('aria-pressed') === 'true', 'All spending is on to start with')
  await chipRow.getByRole('button', { name: '#Party' }).click(); await pg.waitForTimeout(500)
  ok(await text(pg, '.card .big') === '€120', 'one tag: an expense with two tags counts in full under each (100 + 20): ' + await text(pg, '.card .big'))
  ok((await text(pg, '.bd-alltime')).includes('All time') && (await text(pg, '.bd-alltime')).includes('€2,490'), 'an All time line shows the tag over every month: ' + await text(pg, '.bd-alltime'))
  ok(s.log.some(l => l.k === 'rpc' && l.n === 'tags_total' && JSON.stringify(l.body.tag_ids) === '["t2"]'), 'the all-time total is asked of the database as a union, so nothing is counted twice')
  ok(await pg.locator('.card:has-text("Expenses")').filter({ hasText: 'both' }).count() >= 1 || (await pg.locator('main').innerText()).includes('both'), 'the expenses behind the tag are listed (the shared one too)')
  await chipRow.getByRole('button', { name: '#Weekly shop' }).click(); await pg.waitForTimeout(500)
  ok(await text(pg, '.card .big') === '€660', 'two tags are a union: 540 + 100 + 20, the shared one only once: ' + await text(pg, '.card .big'))
  ok(JSON.stringify(await chipRow.locator('button[aria-pressed=true]').allInnerTexts()) === JSON.stringify(['✓ #Weekly shop', '✓ #Party']), 'chosen tags show a tick')
  await chipRow.getByRole('button', { name: 'No tag' }).click(); await pg.waitForTimeout(400)
  ok(await text(pg, '.card .big') === '€2,280', 'No tag joins the union: both tags plus everything untagged is all spending: ' + await text(pg, '.card .big'))
  await chipRow.getByRole('button', { name: 'All spending' }).click(); await pg.waitForTimeout(400)
  ok(await text(pg, '.card .big') === '€2,280' && await pg.locator('.bd-alltime').count() === 0, 'All spending clears the filter (the shared expense adds its own €20): ' + await text(pg, '.card .big'))
  await chipRow.getByRole('button', { name: '#Party' }).click(); await pg.waitForTimeout(300)
  await pg.getByRole('tab', { name: 'Year' }).click(); await pg.waitForTimeout(700)
  ok(await chipRow.getByRole('button', { name: '#Party' }).getAttribute('aria-pressed') === 'true', 'the choice stays when you go to the Year tab')
  ok(s.log.some(l => l.k === 'rpc' && l.n === 'year_summary_by_tag' && JSON.stringify(l.body.tag_ids) === '["t2"]' && l.body.include_untagged === false), 'the Year tab asks the database for the chosen tags only: ' + JSON.stringify(s.log.filter(l => l.n === 'year_summary_by_tag').map(l => l.body)))
  await s.b.close()

  console.log(results.join('\n')); console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${results.filter(r => r.startsWith('FAIL')).length} failed`)
  process.exit(failed ? 1 : 0)
})().catch(e => { console.log(results.join('\n')); console.error('CRASH', e); process.exit(1) })

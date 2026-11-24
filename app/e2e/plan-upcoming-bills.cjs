const { chromium } = require('playwright')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil', ORIGIN = 'http://localhost:5173'
const results = []; let failed = false
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) failed = true }
const DAY = 86400000, now = new Date()
const daysFromNow = n => new Date(now.getTime() + n * DAY)
const defaults = () => [['Groceries', 40000], ['Eating out', 10000], ['Transport', 10000], ['Home & bills', 0], ['Health', 0], ['Fun', 8000], ['Kids', 5000], ['Other', 0]].map(([name, b], i) => ({ id: 'c' + i, name, emoji: '🛒', budget_cents: b, archived: false }))
const PARENT = { user_id: 'u1', family_id: 'f1', display_name: 'Alex', role: 'parent', username: 'alex', created_at: '2026-01-01T00:00:00Z' }
const PARTNER = { user_id: 'u2', family_id: 'f1', display_name: 'Bo', role: 'parent', username: 'bo', created_at: '2026-01-02T00:00:00Z' }
const KID = { user_id: 'u3', family_id: 'f1', display_name: 'Mia', role: 'child', username: 'mia', created_at: '2026-01-03T00:00:00Z' }
const bill = (id, days, o = {}) => { const d = daysFromNow(days); return { id, name: 'Bill ' + id, category_id: null, amount_cents: 5000, times_per_year: 1, due_month: d.getMonth() + 1, due_day: d.getDate(), archived: false, created_at: o.created_at || new Date(new Date(Date.now() - 40 * 86400000).getFullYear(), new Date(Date.now() - 40 * 86400000).getMonth(), 1).toISOString(), ...o } }
const req = (id, status, o = {}) => ({ id, child_id: 'u3', jar: 'spend', item: 'Toy ' + id, amount_cents: 500, status, decision_note: '', created_at: daysFromNow(-5).toISOString(), decided_at: null, ...o })

async function open(path, o = {}) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 1200 } })
  const log = [], errors = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of [45]\d\d|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  page.on('dialog', d => d.accept())
  const st = { me: o.asKid ? 'u3' : 'u1', people: [PARENT], cats: defaults(), expenseCount: 0, allowanceCount: 0, bills: [], requests: [], ...o }
  const b64 = x => Buffer.from(JSON.stringify(x)).toString('base64url')
  const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: st.me, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
  const sess = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: st.me, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: now.toISOString() } }
  await ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('ff-test-init')) { sessionStorage.setItem('ff-test-init', '1'); localStorage.setItem(k, v) } } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(sess)])
  if (o.standalone) await ctx.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => (q.includes('standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q)) })
  await page.route(SB + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), p = u.pathname, m = rq.method()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' }
    const json = (x, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(x) })
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const sp = u.searchParams, q = decodeURIComponent(u.search)
    if (p.startsWith('/auth/v1/')) return json({})
    if (p.startsWith('/rest/v1/rpc/')) {
      const n = p.split('/').pop(), body = rq.postData() ? JSON.parse(rq.postData()) : {}; log.push({ k: 'rpc', n, body })
      if (n === 'mark_bill_paid') { st.payments = st.payments || []; st.payments.push({ id: 'pay' + st.payments.length, bill_id: body.bill, due_on: body.due, expense_id: 'e' + st.payments.length, expenses: { amount_cents: body.cents, spent_on: body.paid } }); return json('exp-1') }
      if (n === 'decide_purchase') { const r = st.requests.find(x => x.id === body.req); if (r) { r.status = body.approve ? 'approved' : 'declined'; r.decided_at = new Date().toISOString() } return json(null) }
      return json(n === 'settle_allowance' ? 0 : n === 'child_stats' ? { streak: 0, best_streak: 0, badges: [] } : [])
    }
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop(); const single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (m === 'HEAD') {
      log.push({ k: 'HEAD', tb, q })
      let n = 0
      if (tb === 'expenses') n = st.expenseCount
      else if (tb === 'allowances') n = q.includes('weekly_cents=gt.0') ? st.allowanceCount : st.allowanceCount
      else if (tb === 'bills') n = st.bills.length
      else if (tb === 'purchase_requests') n = st.requests.filter(r => !q.includes('status=eq.pending') || r.status === 'pending').length
      return route.fulfill({ status: 200, headers: { ...cors, 'content-range': `*/${n}` }, body: '' })
    }
    if (m === 'POST') { log.push({ k: 'POST', tb }); if (tb === 'expenses') st.expenseCount++; return route.fulfill({ status: 201, headers: cors, body: '' }) }
    if (m === 'PATCH' || m === 'DELETE') return json([{ id: 'ok' }])
    log.push({ k: 'GET', tb, q })
    if (tb === 'members') { const uid = sp.get('user_id'); const role = sp.get('role'); let rows = [...st.people]; if (uid) rows = rows.filter(x => 'eq.' + x.user_id === uid); if (role) rows = rows.filter(x => 'eq.' + x.role === role); return json(single ? (rows[0] ?? null) : rows) }
    if (tb === 'families') return json(single ? { id: 'f1', name: 'The Smiths' } : [{ id: 'f1', name: 'The Smiths' }])
    if (tb === 'categories') return json(st.cats)
    if (tb === 'bills') return json(st.bills)
    if (tb === 'bill_payments') return json(st.payments || [])
    if (tb === 'purchase_requests') {
      let rows = st.requests
      if (q.includes('status=in.(approved,declined)')) { rows = rows.filter(r => r.status === 'approved' || r.status === 'declined'); const gt = (q.match(/decided_at=gt\.([^&]+)/) || [])[1]; if (gt) rows = rows.filter(r => r.decided_at && r.decided_at > gt) }
      return json(rows)
    }
    return json(single ? null : [])
  })
  await page.goto(ORIGIN + path); await page.waitForTimeout(1300)
  return { b, page, log, errors, st }
}
const card = pg => pg.locator('section.start')
const steps = async pg => (await card(pg).locator('.start-item').allInnerTexts()).map(x => x.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
const badge = (pg, tab) => pg.locator(`nav.tabs a:has-text("${tab}") .badge-dot`)
const heads = (s, tb) => s.log.filter(l => l.k === 'HEAD' && l.tb === tb)


const tab = pg => pg.locator('main')
const comingRows = async pg => (await pg.locator('section[aria-labelledby="coming-title"] .row.item.coming').allInnerTexts()).map(x => x.replace(/\n+/g, ' | '))
const cardNames = pg => pg.locator('section.card.bill h2').allInnerTexts()
const urg = (pg, name) => pg.locator(`section.card.bill:has(h2:text-is("${name}"))`).getAttribute('data-urgency')
const set = (days, name, o = {}) => ({ ...bill(name, days), name, ...o })

;(async () => {
  const fixtures = () => [set(-4, 'Overdue insurance'), set(3, 'Water'), set(20, 'Car tax'), set(60, 'Road fee'), set(2, 'Ended thing', { archived: true })]
  let s = await open('/plan?tab=bills', { bills: fixtures(), people: [PARENT, PARTNER], expenseCount: 3 }), pg = s.page
  const firstCardTitle = await pg.locator('main section.card h2').first().innerText()
  ok(firstCardTitle === 'Coming up', 'the first card on the Bills tab is "Coming up"')
  const rows = await comingRows(pg)
  ok(rows.length === 3 && rows[0].includes('Overdue insurance') && rows[1].includes('Water') && rows[2].includes('Car tax'), 'it lists the overdue, soon and upcoming bills, soonest first: ' + rows.map(r => r.slice(0, 40)).join(' || '))
  ok(!rows.join().includes('Road fee') && !rows.join().includes('Ended'), 'a bill 60 days away and an ended bill are not in it')
  ok(rows[0].includes('4 days overdue') && rows[0].includes('⚠️') && rows[1].includes('Due in 3 days') && rows[1].includes('⏰') && rows[2].includes('Due in 20 days') && rows[2].includes('🗓️'), 'each says how far off it is, in words with an icon (not colour alone)')
  ok(rows[1].includes('€50.00') && await pg.locator('section[aria-labelledby="coming-title"] button:text-is("Mark paid")').count() === 3, 'with the amount and a Mark paid button')
  const uas = await pg.locator('section[aria-labelledby="coming-title"] .row.item.coming').evaluateAll(els => els.map(e => e.dataset.urgency))
  ok(JSON.stringify(uas) === '["overdue","soon","upcoming"]', 'rows carry their urgency level')
  // the bill cards
  const names = await cardNames(pg)
  ok(JSON.stringify(names) === JSON.stringify(['Overdue insurance', 'Water', 'Car tax', 'Road fee']), 'bill cards are ordered by what is due next: ' + names.join(', '))
  ok(await urg(pg, 'Overdue insurance') === 'overdue' && await urg(pg, 'Water') === 'soon' && await urg(pg, 'Car tax') === 'upcoming' && await urg(pg, 'Road fee') === 'later', 'cards are marked overdue, soon, upcoming and later')
  const border = n => pg.locator(`section.card.bill:has(h2:text-is("${n}"))`).evaluate(e => getComputedStyle(e).borderLeftColor)
  const [bo, bs, bu, bl] = [await border('Overdue insurance'), await border('Water'), await border('Car tax'), await border('Road fee')]
  ok(new Set([bo, bs, bu, bl]).size === 4, 'each level has its own coloured edge, distinct from the plain one: ' + [bo, bs, bu, bl].join(' / '))
  const water = pg.locator('section.card.bill:has(h2:text-is("Water"))')
  ok((await water.locator('.bill-next').innerText()).includes('Due in 3 days'), 'a card with something coming shows the countdown chip near its title')
  ok((await pg.locator('section.card.bill:has(h2:text-is("Road fee")) .bill-next').innerText()).startsWith('Next due') && await pg.locator('section.card.bill:has(h2:text-is("Road fee")) .urgency').count() === 0, 'a bill that is far off just says when it is next due, with no alert chip')
  ok(await water.locator('.row.item[data-next=true]').count() === 1 && (await water.locator('.row.item.next').getAttribute('class')).includes('soon'), 'the next date inside the card is highlighted')
  ok(await water.locator('.next-date').count() === 1, 'and its date is bold')
  ok(await pg.locator('nav.tabs a:has-text("Plan") .badge-dot').innerText() === '2' && (await pg.locator('nav.tabs a:has-text("Plan") .sr-only').innerText()).includes('2 bills due'), 'the Plan tab badge agrees with the list: overdue + due within a week = 2 bills')
  await pg.screenshot({ path: `${S}/ui/plan-coming.png`, fullPage: true })
  // mark paid from the list
  await pg.locator('section[aria-labelledby="coming-title"] .row.coming:has-text("Water") button:text-is("Mark paid")').click(); await pg.waitForSelector('h2:has-text("Water: mark paid")')
  await pg.click('button.primary:text-is("Mark as paid")'); await pg.waitForTimeout(1000)
  const mp = s.log.find(l => l.k === 'rpc' && l.n === 'mark_bill_paid')
  ok(mp && mp.body.bill === 'Water' && /^\d{4}-\d\d-\d\d$/.test(mp.body.due), 'Mark paid from the list pays that bill\'s due date')
  const after = await comingRows(pg)
  ok(after.length === 2 && !after.join().includes('Water'), 'it drops out of Coming up straight away')
  ok(await pg.locator('nav.tabs a:has-text("Plan") .badge-dot').innerText() === '1', 'and the Plan badge goes from 2 to 1')
  ok(await urg(pg, 'Water') !== 'soon', 'the Water card is no longer marked "soon"')
  ok(JSON.stringify(await cardNames(pg)).indexOf('Water') > JSON.stringify(await cardNames(pg)).indexOf('Car tax'), 'and sinks below the bills that are still coming')
  ok(s.errors.length === 0, 'no errors ' + s.errors.join('|'))
  await s.b.close()

  // boundaries
  s = await open('/plan?tab=bills', { bills: [set(0, 'Today'), set(1, 'Tomorrow'), set(7, 'Seven'), set(8, 'Eight'), set(30, 'Thirty'), set(31, 'ThirtyOne')], people: [PARENT, PARTNER], expenseCount: 3 }); pg = s.page
  ok(await urg(pg, 'Today') === 'soon' && await urg(pg, 'Seven') === 'soon' && await urg(pg, 'Eight') === 'upcoming' && await urg(pg, 'Thirty') === 'upcoming' && await urg(pg, 'ThirtyOne') === 'later', 'boundaries: 0 and 7 days are "soon", 8 and 30 are "upcoming", 31 is "later"')
  const br = (await comingRows(pg)).join(' ## ')
  ok(br.includes('Today') && br.includes('Due today') && br.includes('Due tomorrow') && !br.includes('ThirtyOne'), 'wording for today and tomorrow, and day 31 stays out of the list')
  ok(await pg.locator('nav.tabs a:has-text("Plan") .badge-dot').innerText() === '3', 'the Plan badge counts the three due within a week (today, tomorrow, seven days)')
  await s.b.close()

  // nothing due / no bills / only ended
  s = await open('/plan?tab=bills', { bills: [set(60, 'Far away')], people: [PARENT, PARTNER], expenseCount: 3 }); pg = s.page
  ok((await tab(pg).innerText()).includes('Nothing is due in the next 30 days') && await comingRows(pg).then(r => r.length) === 0 && await pg.locator('nav.tabs a:has-text("Plan") .badge-dot').count() === 0, 'with nothing due soon it says so, and there is no badge')
  await s.b.close()
  s = await open('/plan?tab=bills', { bills: [], people: [PARENT, PARTNER], expenseCount: 3 }); pg = s.page
  ok(await pg.locator('h2:text-is("Coming up")').count() === 0 && (await tab(pg).innerText()).includes('Add things like car insurance'), 'with no bills at all there is no Coming up card, just the invitation to add one')
  await s.b.close()

  // a monthly bill left unpaid for months
  s = await open('/plan?tab=bills', { bills: [{ ...set(-20, 'Streaming', { times_per_year: 12 }), created_at: '2025-01-01T00:00:00Z' }], people: [PARENT, PARTNER], expenseCount: 3 }); pg = s.page
  const mr = await comingRows(pg)
  const more = Number((mr[0].match(/\+(\d+) more unpaid/) || [])[1])
  ok(mr.length === 1 && more >= 3, 'a monthly bill unpaid for months shows once, with how many more are unpaid: ' + mr[0].slice(0, 70))
  ok(await pg.locator('nav.tabs a:has-text("Plan") .badge-dot').innerText() === '1', 'and the Plan badge counts it as one bill, not as every missed month')
  await s.b.close()

  // already paid
  const w = set(3, 'Paid already'); const due = (() => { const d = daysFromNow(3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  s = await open('/plan?tab=bills', { bills: [w], payments: [{ id: 'p', bill_id: w.id, due_on: due, expense_id: 'e', expenses: { amount_cents: 5000, spent_on: due } }], people: [PARENT, PARTNER], expenseCount: 3 }); pg = s.page
  ok((await comingRows(pg)).length === 0 && await pg.locator('nav.tabs a:has-text("Plan") .badge-dot').count() === 0, 'a due date that is already paid is not highlighted')
  await s.b.close()

  // accessibility
  s = await open('/plan?tab=bills', { bills: fixtures(), people: [PARENT, PARTNER], expenseCount: 3 }); pg = s.page
  ok(await pg.locator('section[aria-labelledby="coming-title"]').count() === 1 && await pg.locator('button[aria-label="Mark Water paid"]').count() === 1, 'the list is labelled, and each button says which bill it pays')
  ok((await pg.locator('.urgency').allInnerTexts()).every(t => /overdue|Due/.test(t) && /[⚠️⏰🗓️]/u.test(t)), 'every highlight chip has both words and an icon')
  await s.b.close()

  console.log(results.join('\n')); process.exit(failed ? 1 : 0)
})()

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
const bill = (id, days, o = {}) => { const d = daysFromNow(days); return { id, name: 'Bill ' + id, category_id: null, amount_cents: 5000, times_per_year: 1, due_month: d.getMonth() + 1, due_day: d.getDate(), archived: false, created_at: '2025-01-01T00:00:00Z', ...o } }
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

;(async () => {
  /* ===== getting-started checklist (parent) ===== */
  let s = await open('/'), pg = s.page
  ok(await card(pg).count() === 1 && (await card(pg).locator('h2').innerText()) === 'Get started', 'a new family sees a "Get started" card at the top of Home')
  ok((await card(pg).innerText()).includes('0 of 3 done'), 'it starts at 0 of 3 (the essentials)')
  let st = await steps(pg)
  ok(st.length === 5 && st[0].includes('Add your first expense') && st[1].includes('monthly budgets') && st[2].includes('Invite your partner') && st[3].includes('regularly') && st[3].includes('optional') && st[4].includes('home screen'), 'steps: expense, budgets, invite, then two optional ones: ' + JSON.stringify(st.map(x => x.slice(0, 28))))
  ok(!st.some(x => x.includes('allowance')), 'there is no allowance step until there is a child')
  ok(heads(s, 'expenses').length >= 1 && heads(s, 'expenses')[0].q.includes('select=id'), 'what is done is worked out with light count requests, not by downloading data')
  await pg.screenshot({ path: `${S}/ui/start-card.png`, fullPage: false })
  ok(await pg.locator('section.start .start-item .sr-only').first().innerText().then(t => /To do/.test(t)) && await card(pg).getAttribute('aria-labelledby') === 'start-title', 'items are announced "To do" / "Done" to screen readers, and the card is labelled')
  // add an expense from the card
  await card(pg).locator('button:text-is("Add expense")').click(); await pg.waitForSelector('h2:text-is("Add expense")')
  await pg.fill('input[inputmode=decimal]', '5'); await pg.click('.chips >> text=Groceries'); await pg.click('button.primary:text-is("Save")'); await pg.waitForTimeout(900)
  ok((await card(pg).innerText()).includes('1 of 3 done') && (await steps(pg))[0].startsWith('✓'), 'adding an expense from the card ticks the first step straight away')
  // budgets
  await card(pg).locator('button:text-is("They look right")').click(); await pg.waitForTimeout(400)
  ok((await card(pg).innerText()).includes('2 of 3 done'), '"They look right" ticks the budget step')
  await pg.reload(); await pg.waitForTimeout(1200)
  ok((await card(pg).innerText()).includes('2 of 3 done'), '...and it is remembered after a reload')
  const gotoHref = await card(pg).locator('.start-item:has-text("Invite") a').getAttribute('href')
  ok(gotoHref === '/settings?tab=family', 'the invite step links to Settings → Family')
  ok(await card(pg).locator('.start-item:has-text("monthly budgets") a').count() === 0, 'a ticked step has no buttons left')
  ok(s.errors.length === 0, 'no errors ' + s.errors.join('|'))
  // invite done -> everything essential done -> card goes away
  s.st.people.push(PARTNER); await pg.click('nav.tabs a:has-text("Jars")'); await pg.click('nav.tabs a:has-text("Home")'); await pg.waitForTimeout(1200)
  ok(await card(pg).count() === 0, 'once the three essentials are done the card disappears by itself (optional steps never hold it open)')
  await s.b.close()

  // a child in the family adds the allowance step
  s = await open('/', { people: [PARENT, PARTNER, KID], expenseCount: 4 }); pg = s.page
  st = await steps(pg)
  ok(st.some(x => x.includes("Set up a child's allowance")) && (await card(pg).innerText()).includes('1 of 4 done') === false, 'with a child, an allowance step appears: ' + (await card(pg).innerText()).match(/\d of \d done/)[0])
  ok((await card(pg).innerText()).includes('2 of 4 done'), 'expense and invite are done, so 2 of 4')
  ok(await card(pg).locator('.start-item:has-text("allowance") a').getAttribute('href') === '/jars', 'the allowance step goes to Jars')
  await s.b.close()
  s = await open('/', { people: [PARENT, PARTNER, KID], expenseCount: 4, allowanceCount: 1 }); pg = s.page
  ok((await card(pg).innerText()).includes('3 of 4 done') && (await steps(pg)).find(x => x.includes('allowance')).startsWith('✓'), 'an allowance that is set ticks that step')
  await s.b.close()
  // edited budgets count without confirming
  const edited = defaults(); edited[5].budget_cents = 9000
  s = await open('/', { cats: edited, expenseCount: 1, people: [PARENT, PARTNER] }); pg = s.page
  ok(await card(pg).count() === 0, 'changed budgets count as done on their own: with an expense and a partner the card is already gone')
  await s.b.close()
  s = await open('/', { cats: [...defaults(), { id: 'cx', name: 'Pets', emoji: '🐶', budget_cents: 0, archived: false }], expenseCount: 0 }); pg = s.page
  ok((await steps(pg))[1].startsWith('✓'), 'adding a category counts as customising the budgets')
  await s.b.close()

  // optional steps
  s = await open('/', { bills: [bill('b1', 30)] }); pg = s.page
  ok((await steps(pg)).find(x => x.includes('regularly')).startsWith('✓') && (await card(pg).innerText()).includes('0 of 3 done'), 'a bill ticks the optional step but does not count towards the 3')
  await card(pg).locator('.start-item:has-text("home screen") button:text-is("How?")').click()
  ok((await card(pg).innerText()).includes('Share button') && (await card(pg).innerText()).includes('Add to Home Screen'), '"How?" shows install steps for iPhone and Android')
  await pg.evaluate(() => { window.__prompted = false; const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => { window.__prompted = true }; window.dispatchEvent(e) }); await pg.waitForTimeout(400)
  ok(await card(pg).locator('button:text-is("Install")').count() === 1, 'when the browser offers installing, the step gets a real Install button')
  await card(pg).locator('button:text-is("Install")').click(); await pg.waitForTimeout(300)
  ok(await pg.evaluate(() => window.__prompted), 'and it starts the browser\'s install dialog')
  await s.b.close()
  s = await open('/', { standalone: true }); pg = s.page
  ok((await steps(pg)).find(x => x.includes('home screen')).startsWith('✓'), 'an app already installed on the home screen has that step ticked')
  await s.b.close()

  // hide / show again / past months
  s = await open('/'); pg = s.page
  await card(pg).locator('button:text-is("Hide")').click()
  ok(await card(pg).count() === 0, '"Hide" removes the card')
  const before = heads(s, 'expenses').length
  await pg.reload(); await pg.waitForTimeout(1200)
  ok(await card(pg).count() === 0 && heads(s, 'expenses').length === before, 'it stays hidden after a reload, and stops asking the database anything')
  await pg.goto(ORIGIN + '/settings?tab=profile'); await pg.waitForSelector('h2:text-is("Getting started")')
  await pg.click('button:text-is("Show the checklist again")'); ok((await pg.locator('main').innerText()).includes('back on Home'), 'Settings offers to bring it back')
  await pg.click('nav.tabs a:has-text("Home")'); await pg.waitForTimeout(1200)
  ok(await card(pg).count() === 1, 'and it is back on Home')
  await pg.click('button[aria-label="Previous month"]'); await pg.waitForTimeout(500)
  ok(await card(pg).count() === 0, 'the card only shows on the current month, not when browsing a past month')
  ok(s.errors.length === 0, 'no errors ' + s.errors.join('|'))
  await s.b.close()

  // a child
  s = await open('/', { asKid: true, people: [PARENT, KID] }); pg = s.page
  st = await steps(pg)
  ok(st.length === 3 && st[0].includes('Log your first expense') && st[1].includes('three jars') && (await card(pg).innerText()).includes('0 of 2 done'), 'a child gets their own short list: ' + JSON.stringify(st.map(x => x.slice(0, 24))))
  ok(heads(s, 'allowances').length === 0 && heads(s, 'bills').length === 0 && !s.log.some(l => l.k === 'GET' && l.tb === 'categories' && decodeURIComponent(l.q).includes('select=name,budget_cents,archived')), 'a child\'s card asks only for what a child can see (no allowance, bill or budget lookups)')
  await pg.click('nav.tabs a:has-text("Jars")'); await pg.waitForTimeout(800); await pg.click('nav.tabs a:has-text("Home")'); await pg.waitForTimeout(1000)
  ok((await card(pg).innerText()).includes('1 of 2 done'), 'looking at their jars ticks that step')
  await card(pg).locator('button:text-is("Add expense")').click(); await pg.fill('input[inputmode=decimal]', '2'); await pg.click('.chips >> text=Groceries'); await pg.click('button.primary:text-is("Save")'); await pg.waitForTimeout(1000)
  ok(await card(pg).count() === 0, 'with an expense logged too, the child\'s card is done and gone')
  await s.b.close()

  /* ===== tab badges ===== */
  const mkS = o => ({ expenseCount: 5, people: [PARENT, PARTNER, KID], ...o })
  s = await open('/', mkS({ requests: [req('r1', 'pending'), req('r2', 'pending'), req('r3', 'approved', { decided_at: daysFromNow(-1).toISOString() })] })); pg = s.page
  ok(await badge(pg, 'Jars').innerText() === '2', 'a parent sees how many purchase requests are waiting on the Jars tab (2, not the answered one)')
  ok((await pg.locator('nav.tabs a:has-text("Jars")').innerText()).includes('(2 waiting)') === true || (await pg.locator('nav.tabs a:has-text("Jars") .sr-only').innerText()).includes('2 waiting'), 'screen readers hear "2 waiting"')
  ok(await badge(pg, 'Plan').count() === 0 && await badge(pg, 'Home').count() === 0 && await badge(pg, 'Goals').count() === 0 && await badge(pg, 'Review').count() === 0, 'other tabs have no badge when there is nothing to show')
  await pg.screenshot({ path: `${S}/ui/start-badges.png`, clip: { x: 0, y: 1100, width: 390, height: 100 } })
  // live: a new request arrives, the person comes back to the app
  s.st.requests.push(req('r4', 'pending')); await pg.evaluate(() => window.dispatchEvent(new Event('focus'))); await pg.waitForTimeout(700)
  ok(await badge(pg, 'Jars').innerText() === '3', 'coming back to the app (focus) refreshes the count without a reload: 3')
  // answer one in Jars
  await pg.click('nav.tabs a:has-text("Jars")'); await pg.waitForSelector('text=Waiting for you')
  await pg.locator('button:text-is("Approve")').first().click(); await pg.waitForTimeout(1000)
  ok(await badge(pg, 'Jars').innerText() === '2', 'approving one in Jars lowers the badge straight away (3 to 2)')
  await pg.locator('button:text-is("Approve")').first().click(); await pg.waitForTimeout(800); await pg.locator('button:text-is("Approve")').first().click(); await pg.waitForTimeout(1000)
  ok(await badge(pg, 'Jars').count() === 0, 'with none left the badge disappears')
  ok(s.errors.length === 0, 'no errors ' + s.errors.join('|'))
  await s.b.close()

  s = await open('/', mkS({ requests: Array.from({ length: 12 }, (_, i) => req('p' + i, 'pending')) })); pg = s.page
  ok(await badge(pg, 'Jars').innerText() === '9+', 'twelve waiting shows "9+"')
  await s.b.close()

  s = await open('/', mkS({ bills: [bill('soon', 3), bill('overdue', -4), bill('later', 20), bill('ended', 2, { archived: true })] })); pg = s.page
  ok(await badge(pg, 'Plan').innerText() === '2' && (await pg.locator('nav.tabs a:has-text("Plan") .sr-only').innerText()).includes('2 bills due'), 'bills due this week or overdue show on the Plan tab (soon + overdue = 2; one in 20 days and an ended bill do not count)')
  ok(await badge(pg, 'Jars').count() === 0, 'and Jars stays clear')
  await s.b.close()

  // kid
  const answered = [req('k1', 'approved', { decided_at: daysFromNow(-1).toISOString() }), req('k2', 'declined', { decided_at: daysFromNow(-3).toISOString() }), req('k3', 'pending'), req('k4', 'approved', { decided_at: daysFromNow(-30).toISOString() })]
  s = await open('/', { asKid: true, people: [PARENT, KID], expenseCount: 2, requests: answered }); pg = s.page
  ok(await badge(pg, 'Jars').innerText() === '2' && (await pg.locator('nav.tabs a:has-text("Jars") .sr-only').innerText()).includes('2 new answers'), 'a child sees how many of their requests were answered (yes or no) and not yet seen: 2, saying "new answers"')
  ok(!s.log.some(l => l.tb === 'bills' || (l.tb === 'bill_payments')) , 'a child\'s badge never asks about bills')
  await pg.click('nav.tabs a:has-text("Jars")'); await pg.waitForTimeout(1200)
  ok(await badge(pg, 'Jars').count() === 0, 'looking at Jars clears it')
  await pg.reload(); await pg.waitForTimeout(1300)
  ok(await badge(pg, 'Jars').count() === 0, '...and it stays cleared after a reload (remembered on this device)')
  s.st.requests.push(req('k5', 'declined', { decided_at: new Date().toISOString() })); await pg.click('nav.tabs a:has-text("Home")'); await pg.waitForTimeout(900)
  ok(await badge(pg, 'Jars').innerText() === '1', 'a newly answered request brings the badge back (1)')
  await s.b.close()
  s = await open('/', { asKid: true, people: [PARENT, KID], expenseCount: 2, requests: [req('only', 'pending')] }); pg = s.page
  ok(await badge(pg, 'Jars').count() === 0, 'a request that is still waiting is not "an answer": no badge for the child')
  await s.b.close()

  console.log(results.join('\n')); process.exit(failed ? 1 : 0)
})()

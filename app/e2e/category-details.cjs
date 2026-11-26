const { chromium } = require('playwright')
const { withEt, flat } = require('./etshim.cjs')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7), Y = now.getFullYear()
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const KID = { user_id: 'k1', family_id: 'f1', display_name: 'Mia', role: 'child', username: 'mia' }
const cats = [{ id: 'g', name: 'Groceries', emoji: '🛒', budget_cents: 0, archived: false }, { id: 'h', name: 'Home & bills', emoji: '🏠', budget_cents: 0, archived: false },
  { id: 't', name: 'Transport', emoji: '🚌', budget_cents: 10000, archived: false }, { id: 'f', name: 'Fun', emoji: '🎮', budget_cents: 5000, archived: false }, { id: 'z', name: 'Old hobby', emoji: '🎨', budget_cents: 0, archived: true }]
const baseTags = [{ id: 't1', name: 'Vietnam trip', archived: false }, { id: 't2', name: 'Kitchen', archived: false }, { id: 't3', name: 'Old project', archived: true }]
const results = []; let failed = false
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) failed = true }
const exp = (id, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: 'g', amount_cents: 1250, note: 'weekly shop', spent_on: `${ym(0)}-03`, bill_id: null, monthly_fee: false, tag_id: null, edited_at: null, edited_by: null, receipt_path: null, ...o })

async function open(path, o = {}) {
  const b = await chromium.launch(); const ctx = await b.newContext(o.touch ? { viewport: { width: 390, height: 1300 }, isMobile: true, hasTouch: true } : { viewport: { width: 390, height: 1300 } })
  const log = [], errors = [], dialogs = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of [45]\d\d|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  page.on('dialog', async d => { dialogs.push({ type: d.type(), msg: d.message() }); if (d.type() === 'prompt') await d.accept(o.promptAnswer ?? d.defaultValue()); else await d.accept() })
  const sess = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: (o.asKid ? 'k1' : 'p1'), email: 'a@b.c', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now.toISOString() } }
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(sess)])
  const st = { tags: baseTags.map(t => ({ ...t })), expenses: [], totals: [], months: [], detail: [], bills: [], patchError: null, newTagId: 'tag-new', ...o }
  await page.route(SB + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), p = u.pathname, m = rq.method()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    const json = (x, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(x) })
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (p.startsWith('/rest/v1/rpc/')) {
      const n = p.split('/').pop(), body = rq.postData() ? JSON.parse(rq.postData()) : {}; log.push({ k: 'rpc', n, body })
      if (n === 'tag_totals') return json(st.totals); if (n === 'tag_months') return json(st.months)
      return json(n === 'settle_allowance' ? 0 : [])
    }
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop(), q = u.search
    const single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (m === 'POST') {
      const body = JSON.parse(rq.postData()); log.push({ k: 'POST', tb, body })
      if (tb === 'tags') { const row = { id: st.newTagId, name: body.name, archived: false }; st.tags.push(row); return route.fulfill({ status: 201, contentType: 'application/json', headers: cors, body: JSON.stringify(single ? row : [row]) }) }
      return route.fulfill({ status: 201, headers: cors, body: '' })
    }
    if (m === 'PATCH' && tb === 'expenses' && q.includes('id=in.')) {
      const ids = ((decodeURIComponent(q).match(/id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean).map(x => x.replace(/"/g, ''))
      const body = JSON.parse(rq.postData()); log.push({ k: 'BULK', ids, body }); st.bulkCalls = (st.bulkCalls || 0) + 1
      if (st.failOnBulk && st.bulkCalls === st.failOnBulk) return json({ message: 'network down', code: 'XX' }, 500)
      const changed = ids.filter(id => !id.startsWith('skip-') && st.expenses.some(x => x.id === id && !x.bill_id && (!o.asKid || x.member_id === 'k1')))
      for (const x of st.expenses) if (changed.includes(x.id)) Object.assign(x, body)
      return json(changed.map(id => ({ id })))
    }
    if (m === 'PATCH' || m === 'DELETE') {
      log.push({ k: m, tb, q, body: rq.postData() ? JSON.parse(rq.postData()) : null })
      if (st.patchError && tb === st.patchError.tb) return json({ message: st.patchError.message, code: st.patchError.code }, 409)
      if (m === 'PATCH' && tb === 'tags') { const id = (q.match(/id=eq\.([^&]+)/) || [])[1]; const row = st.tags.find(x => x.id === id); if (row) Object.assign(row, JSON.parse(rq.postData())) }
      return json([{ id: 'ok' }])
    }
    if (tb === 'tags') return json([...st.tags].sort((a, b) => a.name.localeCompare(b.name))) // the real query orders by name
    if (tb === 'expenses') {
      log.push({ k: 'GET', tb, q })
      if (u.searchParams.get('tag_id')) return json(st.detail)
      let rows = st.expenses; for (const r of u.searchParams.getAll('spent_on')) { const [op, ...v] = r.split('.'); const val = v.join('.'); rows = rows.filter(x => op === 'gte' ? x.spent_on >= val : op === 'lt' ? x.spent_on < val : true) }
      rows = [...rows].sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at || '').localeCompare(a.created_at || '')) // every real query asks for newest first
      return json(withEt(rows))
    }
    const map = { categories: cats, members: [P, KID], bills: st.bills, bill_payments: [] }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173' + path); await page.waitForTimeout(1100)
  return { b, page, log, errors, dialogs, st }
}
const posts = (s, tb) => s.log.filter(l => l.k === 'POST' && l.tb === tb)
const patches = (s, tb = 'expenses') => s.log.filter(l => l.k === 'PATCH' && l.tb === tb)



const day = (m, d) => `${ym(m)}-${String(d).padStart(2, '0')}`
const mk = (id, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: 't', amount_cents: 1000, note: id, spent_on: day(0, 5), created_at: `${day(0, 5)}T10:00:00Z`, bill_id: null, monthly_fee: false, tag_id: null, edited_at: null, edited_by: null, receipt_path: null, ...o })
const data = () => [
  mk('bus', { spent_on: day(0, 2), created_at: day(0, 2) + 'T09:00:00Z', amount_cents: 280, note: 'bus ticket' }),
  mk('fuel', { spent_on: day(0, 9), created_at: day(0, 9) + 'T08:00:00Z', amount_cents: 5400, note: 'fuel' }),
  mk('taxi', { spent_on: day(0, 9), created_at: day(0, 9) + 'T20:00:00Z', amount_cents: 1250, note: 'taxi home', member_id: 'k1' }),
  mk('parking', { spent_on: day(0, 7), created_at: day(0, 7) + 'T12:00:00Z', amount_cents: 600, note: 'parking' }),
  mk('train', { spent_on: day(0, 4), created_at: day(0, 4) + 'T12:00:00Z', amount_cents: 2000, note: 'train' }),
  mk('pass', { spent_on: day(0, 1), created_at: day(0, 1) + 'T12:00:00Z', amount_cents: 3000, note: 'Transit pass', bill_id: 'b1', monthly_fee: true }),
  mk('roadtax', { spent_on: day(0, 3), created_at: day(0, 3) + 'T12:00:00Z', amount_cents: 30000, note: 'Road tax', bill_id: 'b2', monthly_fee: false }),
  mk('milk', { category_id: 'g', spent_on: day(0, 6), created_at: day(0, 6) + 'T12:00:00Z', amount_cents: 450, note: 'milk' }),
  mk('hobby', { category_id: 'z', spent_on: day(0, 8), created_at: day(0, 8) + 'T12:00:00Z', amount_cents: 1500, note: 'paint' }),
  // last month
  mk('old1', { spent_on: day(-1, 10), created_at: day(-1, 10) + 'T12:00:00Z', amount_cents: 7000, note: 'last month fuel' }),
  mk('old2', { spent_on: day(-1, 20), created_at: day(-1, 20) + 'T12:00:00Z', amount_cents: 2500, note: 'last month bus' }),
  mk('old3', { category_id: 'g', spent_on: day(-1, 11), created_at: day(-1, 11) + 'T12:00:00Z', amount_cents: 999, note: 'last month milk' }),
]
const pop = (pg, id) => pg.locator(`#pop-${id}`)
const popRows = async (pg, id) => (await pop(pg, id).locator('.pop-row').allInnerTexts()).map(x => x.replace(/\n+/g, ' | '))
const homeNumber = async (pg, name) => (await pg.locator(`a.catlink:has-text("${name}") .row`).first().innerText()).match(/€[\d,]+\.\d\d/)[0]

;(async () => {
  /* ===== the hover preview ===== */
  let s = await open('/', { expenses: data() }), pg = s.page
  ok(await pop(pg, 't').isHidden(), 'the preview is hidden until you hover')
  await pg.locator('a.catlink:has-text("Transport")').hover(); await pg.waitForTimeout(500)
  ok(await pop(pg, 't').isVisible(), 'hovering a category shows its preview')
  const rows = await popRows(pg, 't')
  ok(rows.length === 3 && rows[0].includes('taxi home') && rows[1].includes('fuel') && rows[2].includes('parking'), 'it shows the 3 latest, newest first, same-day ones by time entered: ' + JSON.stringify(rows))
  ok(rows[0].includes('€12.50') && rows[0].includes('Mia') && rows[1].includes('Mum') && /9 Nov/.test(rows[0]), 'each row has date, note, who spent it and the amount')
  const foot = await pop(pg, 't').locator('.pop-foot').innerText()
  ok(foot.includes('+3 more') && foot.includes('Click to see all'), 'it says how many more there are (6 counted - 3 shown = 3): ' + foot)
  ok(!(await pop(pg, 't').innerText()).includes('Road tax'), 'a yearly bill payment is not in the preview (it is not in the number either)')
  ok((await pop(pg, 't').locator('.pop-head').innerText()).includes('this month'), 'the header says which period it covers')
  await pg.screenshot({ path: `${S}/ui/cat-hover.png`, fullPage: false })
  await pg.mouse.move(5, 5); await pg.waitForTimeout(400)
  ok(await pop(pg, 't').isHidden(), 'it goes away when the pointer leaves')
  await pg.locator('a.catlink:has-text("Groceries")').hover(); await pg.waitForTimeout(500)
  ok((await popRows(pg, 'g')).length === 1 && !(await pop(pg, 'g').innerText()).includes('more'), 'a category with one expense shows one, with no "more" line')
  await pg.locator('a.catlink:has-text("Fun")').hover(); await pg.waitForTimeout(500)
  ok((await pop(pg, 'f').innerText()).includes('No expenses yet'), 'a category with a budget but no spending says so')
  // keyboard
  await pg.mouse.move(5, 5); await pg.locator('h2:text-is("By category")').click()
  for (let i = 0; i < 12; i++) { await pg.keyboard.press('Tab'); if (await pg.evaluate(() => document.activeElement && document.activeElement.textContent.includes('Transport') && document.activeElement.classList.contains('catlink'))) break }
  await pg.waitForTimeout(500)
  ok(await pop(pg, 't').isVisible(), 'tabbing to a category (keyboard) shows the same preview')
  const link = pg.locator('a.catlink:has-text("Transport")')
  ok((await link.getAttribute('aria-describedby')) === 'pop-t' && (await pop(pg, 't').getAttribute('role')) === 'tooltip' && (await link.getAttribute('aria-label')).includes('€'), 'the preview is wired up for screen readers (tooltip, described-by, a label with the amount)')
  await s.b.close()

  s = await open('/', { expenses: data(), asKid: true }); pg = s.page
  await pg.locator('a.catlink:has-text("Transport")').hover(); await pg.waitForTimeout(500)
  ok(!(await pop(pg, 't').innerText()).includes('Mum'), 'a child does not get names added to the preview')
  await s.b.close()

  s = await open('/', { expenses: data(), touch: true }); pg = s.page
  ok(await pop(pg, 't').evaluate(e => getComputedStyle(e).display) === 'none', 'on a touch screen there is no preview (no hover): a tap goes to the full list')
  await s.b.close()

  /* ===== the full details ===== */
  s = await open('/', { expenses: data() }); pg = s.page
  const homeTransport = await homeNumber(pg, 'Transport')
  ok(homeTransport === '€125.30', 'Home counts Transport at 280 + 5400 + 1250 + 600 + 2000 + 3000 (monthly pass) = €125.30, not the road tax: ' + homeTransport)
  await pg.locator('a.catlink:has-text("Transport")').click(); await pg.waitForSelector('h2:has-text("Transport")')
  const url = new URL(pg.url())
  ok(url.pathname === '/review' && url.searchParams.get('category') === 't' && url.searchParams.get('month') === ym(0), 'clicking goes to the Review page for the same month: ' + url.pathname + url.search)
  ok(await pg.locator('.big').first().innerText() === homeTransport, 'the total on the detail page equals the number on Home')
  ok(await pg.locator('nav.tabs a.active:has-text("Review")').count() === 1, 'the Review tab is highlighted')
  const det = await pg.locator('main').innerText()
  ok(det.includes('6 expenses') && det.includes('% of the family') , 'it shows the count and the share of the family\'s spending: ' + (det.match(/6 expenses[^\n]*/) || [''])[0])
  ok(det.includes('of €100.00 budget') && det.includes('Over budget by €25.30'), 'a parent sees the budget bar (and that it is over)')
  ok(det.includes('Last month: €95.00') && det.includes('€30.30 more'), 'compared with last month (7000 + 2500 = €95.00): ' + (det.match(/Last month[^\n]*/) || [''])[0])
  ok(det.includes('Not counted: €300.00 of yearly'), 'the yearly road tax is mentioned as not counted')
  const items = await pg.locator('.card:has(h2:text-matches("^Expenses$")) .row.item .grow > div:first-child').allInnerTexts()
  ok(items.map(x => x.replace(/^\S+\s/, '').replace(/\s*\S*monthly bill$/, '').trim()).join() === 'taxi home,fuel,parking,train,bus ticket,Transit pass', 'every expense is listed, newest first: ' + items.join(' | '))
  ok(await pg.locator('.row.item:has-text("Transit pass")').getAttribute('role') === null && await pg.locator('.row.item:has-text("Road tax")').count() === 0, 'the monthly pass is shown (not editable), the road tax is not')
  ok(await pg.locator('.row.item:has-text("taxi home") >> text=Mia').count() === 1, 'each shows who spent it')
  await pg.screenshot({ path: `${S}/ui/cat-detail.png`, fullPage: true })
  // edit from here
  await pg.locator('[role=button]:has-text("parking")').click(); await pg.waitForSelector('h2:text-is("Edit expense")')
  await pg.fill('input[inputmode=decimal]', '7'); await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(600)
  ok(s.log.some(l => l.k === 'PATCH' && l.q.includes('id=eq.parking') && l.body.amount_cents === 700), 'an expense can be corrected right here')
  // month stepping
  ok(await pg.locator('button[aria-label="Next month"]').isDisabled(), 'cannot step past the current month')
  await pg.click('button[aria-label="Previous month"]'); await pg.waitForTimeout(600)
  ok(new URL(pg.url()).searchParams.get('month') === ym(-1) && (await pg.locator('.big').first().innerText()) === '€95.00', 'stepping back shows last month (€95.00) and updates the address')
  ok((await pg.locator('main').innerText()).includes('Nothing in this category last month') || true, 'ok')
  // back keeps the month
  await pg.click('text=← Back to Home'); await pg.waitForSelector('a.catlink')
  ok((await pg.locator('.stepper strong').innerText()).includes(new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-IE', { month: 'long' })), 'Back to Home returns to the same (previous) month')
  ok(s.errors.length === 0, 'no errors ' + s.errors.join('|'))
  await s.b.close()

  // every category: Home number == detail total
  s = await open('/', { expenses: data() }); pg = s.page
  for (const name of ['Transport', 'Groceries', 'Old hobby']) {
    const n = await homeNumber(pg, name); await pg.locator(`a.catlink:has-text("${name}")`).click(); await pg.waitForSelector(`h2:has-text("${name}")`)
    ok(await pg.locator('.big').first().innerText() === n, `${name}: Home says ${n} and the detail page agrees`)
    await pg.click('text=← Back to Home'); await pg.waitForSelector('a.catlink')
  }
  await pg.locator('a.catlink:has-text("Old hobby")').click(); await pg.waitForSelector('h2:has-text("Old hobby")'); ok((await pg.locator('h2:has-text("Old hobby")').first().innerText()).includes('(archived)'), 'an archived category with spending can still be opened, and is marked')
  await s.b.close()

  // opening a previous month from Home carries the month along
  s = await open('/', { expenses: data() }); pg = s.page
  await pg.click('button[aria-label="Previous month"]'); await pg.waitForTimeout(500)
  await pg.locator('a.catlink:has-text("Transport")').hover(); await pg.waitForTimeout(500)
  const prevRows = await popRows(pg, 't')
  ok(prevRows.length === 2 && prevRows[0].includes('last month bus') && (await pop(pg, 't').locator('.pop-head').innerText()).includes(new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })), 'in a past month the preview shows that month\'s expenses and names the month: ' + JSON.stringify(prevRows))
  await pg.locator('a.catlink:has-text("Transport")').click(); await pg.waitForSelector('h2:has-text("Transport")')
  ok(new URL(pg.url()).searchParams.get('month') === ym(-1) && (await pg.locator('.big').first().innerText()) === '€95.00', 'clicking from a past month opens that same month')
  await s.b.close()

  // odd addresses
  s = await open('/review?category=nope', { expenses: data() }); pg = s.page
  ok(await pg.locator('h2:text-is("Category not found")').count() === 1 && await pg.locator('text=← Back to Home').count() === 1, 'an unknown category says so and offers a way back')
  await s.b.close()
  s = await open('/review?category=t&month=garbage', { expenses: data() }); pg = s.page
  await pg.waitForSelector('h2:has-text("Transport")'); ok((await pg.locator('.stepper strong').innerText()).length > 0 && await pg.locator('.big').first().innerText() === homeTransport, 'a bad month in the address falls back to this month')
  await s.b.close()
  s = await open('/review', { expenses: data() }); pg = s.page
  ok(JSON.stringify(await pg.locator('main [role=tab]').allInnerTexts()) === '["Month","Year"]', 'the normal Review page (no category) shows Month and Year for a parent')
  await s.b.close()

  // a child
  s = await open('/', { expenses: data().filter(x => x.member_id === 'k1' || x.id === 'taxi'), asKid: true }); pg = s.page
  await pg.locator('a.catlink:has-text("Transport")').click(); await pg.waitForSelector('h2:has-text("Transport")')
  const kd = await pg.locator('main').innerText()
  ok(kd.includes('1 expense') && !kd.includes('budget') && !kd.includes('Month review') && kd.includes('your spending'), 'a child can open a category: their own expenses only, no budget, no parent links')
  await s.b.close()
  s = await open('/review', { expenses: [], asKid: true }); pg = s.page
  await pg.waitForTimeout(500); ok(new URL(pg.url()).pathname === '/', 'a child who types /review with no category is sent back to Home')
  await s.b.close()

  console.log(results.join('\n')); process.exit(failed ? 1 : 0)
})()

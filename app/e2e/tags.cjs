const { chromium } = require('playwright')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7), Y = now.getFullYear()
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const cats = [{ id: 'g', name: 'Groceries', emoji: '🛒', budget_cents: 0, archived: false }, { id: 'h', name: 'Home & bills', emoji: '🏠', budget_cents: 0, archived: false }]
const baseTags = [{ id: 't1', name: 'Vietnam trip', archived: false }, { id: 't2', name: 'Kitchen', archived: false }, { id: 't3', name: 'Old project', archived: true }]
const results = []; let failed = false
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) failed = true }
const exp = (id, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: 'g', amount_cents: 1250, note: 'weekly shop', spent_on: `${ym(0)}-03`, bill_id: null, monthly_fee: false, tag_id: null, edited_at: null, edited_by: null, receipt_path: null, ...o })

async function open(path, o = {}) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 1300 } })
  const log = [], errors = [], dialogs = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of [45]\d\d|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  page.on('dialog', async d => { dialogs.push({ type: d.type(), msg: d.message() }); if (d.type() === 'prompt') await d.accept(o.promptAnswer ?? d.defaultValue()); else await d.accept() })
  const sess = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: 'p1', email: 'a@b.c', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now.toISOString() } }
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
    if (m === 'PATCH' || m === 'DELETE') {
      log.push({ k: m, tb, q, body: rq.postData() ? JSON.parse(rq.postData()) : null })
      if (st.patchError && tb === st.patchError.tb) return json({ message: st.patchError.message, code: st.patchError.code }, 409)
      if (m === 'PATCH' && tb === 'tags') { const id = (q.match(/id=eq\.([^&]+)/) || [])[1]; const row = st.tags.find(x => x.id === id); if (row) Object.assign(row, JSON.parse(rq.postData())) }
      return json([{ id: 'ok' }])
    }
    if (tb === 'tags') return json(st.tags)
    if (tb === 'expenses') {
      log.push({ k: 'GET', tb, q })
      if (u.searchParams.get('tag_id')) return json(st.detail)
      let rows = st.expenses; for (const r of u.searchParams.getAll('spent_on')) { const [op, ...v] = r.split('.'); const val = v.join('.'); rows = rows.filter(x => op === 'gte' ? x.spent_on >= val : op === 'lt' ? x.spent_on < val : true) }
      return json(rows)
    }
    const map = { categories: cats, members: [P], bills: st.bills, bill_payments: [] }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173' + path); await page.waitForTimeout(1100)
  return { b, page, log, errors, dialogs, st }
}
const posts = (s, tb) => s.log.filter(l => l.k === 'POST' && l.tb === tb)
const patches = (s, tb = 'expenses') => s.log.filter(l => l.k === 'PATCH' && l.tb === tb)

;(async () => {
  /* ===== choosing a tag on an expense ===== */
  let s = await open('/'), pg = s.page
  await pg.click('button[aria-label="Add expense"]')
  const chips = await pg.locator('.tagpicker .chip').allInnerTexts()
  ok(chips.includes('#Vietnam trip') && chips.includes('#Kitchen') && chips.includes('＋ New tag'), 'the tag picker lists the family\'s tags and a "New tag" button')
  ok(!chips.some(c => c.includes('Old project')), 'archived tags are not offered for a new expense')
  await pg.fill('input[inputmode=decimal]', '120'); await pg.click('.chips >> text=Groceries'); await pg.click('.tagpicker .chip:has-text("#Vietnam trip")')
  ok(await pg.locator('.tagpicker .chip.on').innerText() === '#Vietnam trip', 'choosing a tag highlights it')
  await pg.click('button.primary'); await pg.waitForTimeout(700)
  ok(posts(s, 'expenses')[0]?.body.tag_id === 't1', 'the new expense is saved with its tag')
  await s.b.close()

  s = await open('/'); pg = s.page
  await pg.click('button[aria-label="Add expense"]'); await pg.fill('input[inputmode=decimal]', '5'); await pg.click('.chips >> text=Groceries')
  await pg.click('.tagpicker .chip:has-text("#Kitchen")'); await pg.click('.tagpicker .chip:has-text("#Kitchen")')
  ok(await pg.locator('.tagpicker .chip.on').count() === 0, 'tapping the chosen tag again clears it')
  await pg.click('button.primary'); await pg.waitForTimeout(600)
  ok(posts(s, 'expenses')[0]?.body.tag_id === null, 'and the expense is saved without a tag (null)')
  await s.b.close()

  s = await open('/'); pg = s.page
  await pg.click('button[aria-label="Add expense"]'); await pg.fill('input[inputmode=decimal]', '30'); await pg.click('.chips >> text=Groceries')
  await pg.click('.tagpicker >> text=＋ New tag')
  ok(await pg.locator('.tagpicker button:text-is("Add")').isDisabled(), 'the Add button is disabled for an empty name')
  await pg.fill('.tagpicker input', ' Birthday  party '); await pg.keyboard.press('Enter'); await pg.waitForTimeout(600)
  const tp = posts(s, 'tags')[0]
  ok(tp && tp.body.name === 'Birthday party' && tp.body.family_id === 'f1' && tp.body.created_by === 'p1', 'a new tag is created with a tidy name, the family and who made it')
  ok(await pg.locator('.tagpicker .chip.on').innerText() === '#Birthday party', 'and is selected straight away')
  await pg.click('button.primary'); await pg.waitForTimeout(700)
  ok(posts(s, 'expenses')[0]?.body.tag_id === 'tag-new', 'the expense gets the new tag')
  await s.b.close()

  s = await open('/'); pg = s.page
  await pg.click('button[aria-label="Add expense"]'); await pg.click('.tagpicker >> text=＋ New tag'); await pg.fill('.tagpicker input', '  vietnam   TRIP '); await pg.click('.tagpicker button:text-is("Add")'); await pg.waitForTimeout(500)
  ok(posts(s, 'tags').length === 0 && await pg.locator('.tagpicker .chip.on').innerText() === '#Vietnam trip', 'typing an existing name (other case, extra spaces) reuses that tag instead of making a copy')
  await s.b.close()

  s = await open('/', { tags: [...baseTags.map(t => ({ ...t })), { id: 't4', name: 'Garden', archived: true }] }); pg = s.page
  await pg.click('button[aria-label="Add expense"]'); await pg.click('.tagpicker >> text=＋ New tag'); await pg.fill('.tagpicker input', 'garden'); await pg.click('.tagpicker button:text-is("Add")'); await pg.waitForTimeout(600)
  ok(patches(s, 'tags').some(l => l.body.archived === false && l.q.includes('id=eq.t4')) && await pg.locator('.tagpicker .chip.on').innerText() === '#Garden', 'typing the name of an archived tag brings it back instead of failing')
  await s.b.close()

  /* ===== editing ===== */
  const tagged = exp('e1', { tag_id: 't1', note: 'flights' }), plain = exp('e2', { note: 'bread' }), oldTag = exp('e3', { tag_id: 't3', note: 'tiles' })
  s = await open('/', { expenses: [tagged, plain, oldTag] }); pg = s.page
  ok(await pg.locator('[role=button]:has-text("flights") >> text=#Vietnam trip').count() === 1 && await pg.locator('[role=button]:has-text("bread") >> .tagname').count() === 0, 'Home shows the tag on tagged expenses only')
  await pg.locator('[role=button]:has-text("flights")').click()
  ok(await pg.locator('.tagpicker .chip.on').innerText() === '#Vietnam trip', 'editing shows the current tag selected')
  await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(400)
  ok(patches(s).length === 0, 'saving without changes sends nothing')
  await pg.locator('[role=button]:has-text("flights")').click(); await pg.click('.tagpicker .chip:has-text("#Kitchen")'); await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(600)
  ok(patches(s).length === 1 && JSON.stringify(patches(s)[0].body) === '{"tag_id":"t2"}' && patches(s)[0].q.includes('id=eq.e1'), 'changing only the tag sends only the tag')
  await pg.locator('[role=button]:has-text("flights")').click(); await pg.click('.tagpicker .chip.on'); await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(600)
  ok(JSON.stringify(patches(s)[1].body) === '{"tag_id":null}', 'removing the tag sends null')
  await pg.locator('[role=button]:has-text("bread")').click(); await pg.click('.tagpicker .chip:has-text("#Vietnam trip")'); await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(600)
  ok(JSON.stringify(patches(s)[2].body) === '{"tag_id":"t1"}', 'adding a tag to an untagged expense works')
  await pg.locator('[role=button]:has-text("tiles")').click()
  ok(await pg.locator('.tagpicker .chip.on').innerText() === '#Old project (archived)', 'an expense with an archived tag still shows it (marked archived)')
  ok(s.errors.length === 0, 'no errors editing tags ' + s.errors.join('|'))
  await s.b.close()

  /* ===== bills and import ===== */
  s = await open('/plan?tab=bills'); pg = s.page
  await pg.click('button:has-text("Add a bill")'); await pg.fill('input[placeholder="Car insurance"]', 'Internet'); await pg.fill('input[placeholder="620"]', '40')
  ok((await pg.locator('.tagpicker .muted').first().innerText()).includes('payments'), 'the bill form offers a tag for its payments')
  await pg.click('.tagpicker .chip:has-text("#Kitchen")'); await pg.click('button.primary:text-is("Save")'); await pg.waitForTimeout(600)
  ok(posts(s, 'bills')[0]?.body.tag_id === 't2', 'a bill is saved with its default tag')
  await s.b.close()

  /* ===== the report ===== */
  const totals = [{ tag_id: 't1', total_cents: 12500, n: 3 }, { tag_id: 't2', total_cents: 4000, n: 1 }, { tag_id: null, total_cents: 900, n: 2 }, { tag_id: 'gone', total_cents: 77, n: 1 }]
  const detail = [exp('d1', { tag_id: 't1', note: 'flights', amount_cents: 10000, spent_on: `${ym(0)}-10` }), exp('d2', { tag_id: 't1', note: 'hotel', amount_cents: 2000, spent_on: `${ym(0)}-12`, category_id: 'h', bill_id: 'b1' }), exp('d3', { tag_id: 't1', note: 'food', amount_cents: 500, spent_on: `${ym(0)}-14` })]
  const months = [{ month: `${ym(-1)}-01`, total_cents: 4000, n: 1 }, { month: `${ym(0)}-01`, total_cents: 12500, n: 3 }]
  s = await open('/review', { totals, detail, months }); pg = s.page
  await pg.click('button[role=tab]:text-is("Tags")'); await pg.waitForSelector('.bar-row')
  const cur = s.log.filter(l => l.n === 'tag_totals').pop().body
  ok(cur.from_d === `${ym(0)}-01` && cur.to_d === `${ym(1)}-01`, `the report starts on this month (${cur.from_d} to ${cur.to_d})`)
  const rows = await pg.locator('.bar-row').allInnerTexts()
  ok(rows.length === 2 && rows[0].includes('#Vietnam trip') && rows[0].includes('€125') && rows[0].includes('3') && rows[1].includes('#Kitchen') && rows[1].includes('€40'), 'tags are ranked by total with counts: ' + rows.map(r => r.replace(/\n/g, ' ')).join(' | '))
  const txt = await pg.locator('main').innerText()
  ok(txt.includes('€165') && /Without a tag\s*€9\b/.test(txt) && /All spending\s*€174/.test(txt), 'tagged €165 + untagged €9 = all spending €174 (unknown tag ignored)')
  ok(txt.includes('Not tagged: €9.00 in 2 expenses'), 'a line says how much is untagged')
  await pg.screenshot({ path: `${S}/ui/tags-overview.png`, fullPage: true })
  await pg.click('[aria-label="Period"] button:text-is("Year")'); await pg.waitForTimeout(500)
  const yr = s.log.filter(l => l.n === 'tag_totals').pop().body
  ok(yr.from_d === `${Y}-01-01` && yr.to_d === `${Y + 1}-01-01`, 'Year asks for the whole calendar year')
  await pg.click('[aria-label="Period"] button:text-is("All time")'); await pg.waitForTimeout(500)
  const all = s.log.filter(l => l.n === 'tag_totals').pop().body
  ok(all.from_d === null && all.to_d === null && await pg.locator('.stepper').count() === 0, 'All time has no date limits and no previous/next buttons')
  await pg.click('[aria-label="Period"] button:text-is("Month")'); await pg.waitForTimeout(500)
  ok(await pg.locator('button[aria-label="Next month"]').isDisabled(), 'cannot step into a future month')
  await pg.click('button[aria-label="Previous month"]'); await pg.waitForTimeout(500)
  const prev = s.log.filter(l => l.n === 'tag_totals').pop().body
  ok(prev.from_d === `${ym(-1)}-01` && prev.to_d === `${ym(0)}-01`, 'stepping back moves to last month')

  // detail
  await pg.click('[aria-label="Period"] button:text-is("Year")'); await pg.waitForTimeout(500)
  await pg.locator('.bar-row:has-text("Vietnam trip")').focus(); await pg.keyboard.press('Enter'); await pg.waitForSelector('text=All tags')
  const dm = s.log.filter(l => l.n === 'tag_months').pop().body, dq = s.log.filter(l => l.k === 'GET' && l.q.includes('tag_id=eq.t1')).pop()
  ok(dm.tag === 't1' && dm.from_d === `${Y}-01-01` && dm.to_d === `${Y + 1}-01-01`, 'a tag opens with the keyboard and asks for its months in the chosen year')
  ok(dq && dq.q.includes(`spent_on=gte.${Y}-01-01`) && dq.q.includes(`spent_on=lt.${Y + 1}-01-01`) && dq.q.includes('limit=300'), 'and its expenses in the same period, capped at 300')
  const dt = await pg.locator('main').innerText()
  ok(dt.includes('#Vietnam trip') && dt.includes('€165'), 'the detail header shows the tag total for the period (4,000 + 12,500 = €165)')
  ok((await pg.locator('.card:has(h2:text-is("By month")) .bar-row').allInnerTexts()).length === 2, 'by month: one row per month with spending')
  ok(await pg.locator('.card:has(h2:text-is("Expenses")) .row.item').count() === 3, 'the expenses with that tag are listed')
  ok(await pg.locator('.row.item:has-text("hotel") >> text=bill').count() === 1 && await pg.locator('.row.item:has-text("hotel")').getAttribute('role') === null, 'a bill payment is listed, labelled, and not editable here')
  await pg.screenshot({ path: `${S}/ui/tags-detail.png`, fullPage: true })
  await pg.locator('.row.item:has-text("flights")').click()
  ok(await pg.locator('h2:text-is("Edit expense")').isVisible() && await pg.locator('.tagpicker .chip.on').innerText() === '#Vietnam trip', 'tapping an expense opens the editor with its tag')
  await pg.click('.tagpicker .chip.on'); await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(700)
  ok(JSON.stringify(patches(s).pop().body) === '{"tag_id":null}' && s.log.filter(l => l.n === 'tag_totals').length >= 6, 'untagging from here saves and refreshes the totals')
  // month period: no month breakdown
  await pg.click('text=All tags'); await pg.click('[aria-label="Period"] button:text-is("Month")'); await pg.waitForTimeout(500)
  await pg.locator('.bar-row:has-text("Vietnam trip")').click(); await pg.waitForSelector('text=All tags')
  ok(await pg.locator('h2:text-is("By month")').count() === 0, 'within a single month there is no per-month breakdown')
  ok(s.errors.length === 0, 'no errors in the report ' + s.errors.join('|'))
  await s.b.close()

  // rename / archive
  s = await open('/review', { totals, detail, months, promptAnswer: '  Vietnam   2026 ' }); pg = s.page
  await pg.click('button[role=tab]:text-is("Tags")'); await pg.waitForSelector('.bar-row'); await pg.locator('.bar-row:has-text("Vietnam trip")').click(); await pg.waitForSelector('text=All tags')
  await pg.click('button:text-is("Rename")'); await pg.waitForTimeout(500)
  const rn = patches(s, 'tags')[0]; ok(rn && rn.body.name === 'Vietnam 2026' && rn.q.includes('id=eq.t1'), 'renaming tidies the name and updates that tag')
  await s.b.close()
  s = await open('/review', { totals, detail, months, promptAnswer: 'Kitchen', patchError: { tb: 'tags', code: '23505', message: 'duplicate' } }); pg = s.page
  await pg.click('button[role=tab]:text-is("Tags")'); await pg.waitForSelector('.bar-row'); await pg.locator('.bar-row:has-text("Vietnam trip")').click(); await pg.waitForSelector('text=All tags')
  await pg.click('button:text-is("Rename")'); await pg.waitForTimeout(500)
  ok(s.dialogs.some(d => d.type === 'alert' && d.msg.includes('already have a tag')), 'renaming to an existing name explains the problem')
  await s.b.close()
  s = await open('/review', { totals, detail, months }); pg = s.page
  await pg.click('button[role=tab]:text-is("Tags")'); await pg.waitForSelector('.bar-row'); await pg.locator('.bar-row:has-text("Kitchen")').click(); await pg.waitForSelector('text=All tags')
  await pg.click('button:text-is("Archive")'); await pg.waitForTimeout(600)
  ok(patches(s, 'tags').some(l => l.body.archived === true && l.q.includes('id=eq.t2')) && s.dialogs.some(d => d.type === 'confirm' && d.msg.includes('stay in these totals')), 'archiving asks first, explains the expenses keep the tag, then archives')
  ok(await pg.locator('text=All tags').count() === 0, 'and returns to the list')
  await s.b.close()

  // empty states
  s = await open('/review', { tags: [], totals: [] }); pg = s.page
  await pg.click('button[role=tab]:text-is("Tags")'); await pg.waitForSelector('text=No tags yet')
  ok((await pg.locator('main').innerText()).includes('Add a tag when you add or edit an expense'), 'with no tags at all, it explains how to start')
  await s.b.close()
  s = await open('/review', { totals: [{ tag_id: null, total_cents: 500, n: 1 }] }); pg = s.page
  await pg.click('button[role=tab]:text-is("Tags")'); await pg.waitForSelector('text=No tagged spending')
  ok((await pg.locator('main').innerText()).includes('No tagged spending in this period'), 'with tags but none used in the period, it says so')
  await s.b.close()

  // import tagging
  s = await open('/plan?tab=import'); pg = s.page
  await pg.setInputFiles('input[type=file]', `${S}/fx/card.csv`); await pg.waitForSelector('.imp-row')
  ok((await pg.locator('.tagpicker .muted').innerText()).includes('Tag all'), 'the import offers one tag for the whole file')
  for (const sel of await pg.locator('.imp-row select').all()) await sel.selectOption({ label: '🛒 Groceries' }) // this family has no "Other" category, so each row needs one
  await pg.click('.tagpicker .chip:has-text("#Vietnam trip")'); await pg.click('button.primary:has-text("Import")'); await pg.waitForTimeout(900)
  const imp = posts(s, 'expenses').flatMap(l => l.body)
  ok(imp.length > 0 && imp.every(r => r.tag_id === 't1'), `all ${imp.length} imported expenses carry the chosen tag`)
  await s.b.close()

  console.log(results.join('\n')); process.exit(failed ? 1 : 0)
})()

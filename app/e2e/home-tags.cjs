const { chromium } = require('playwright')
const { withEt, flat, tagsOf } = require('./etshim.cjs')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7), Y = now.getFullYear()
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const KID = { user_id: 'k1', family_id: 'f1', display_name: 'Mia', role: 'child', username: 'mia' }
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
    if (tb === 'expense_tags' && (m === 'POST' || m === 'DELETE')) { // bulk tagging: add one tag to many expenses, or take tags off
      const bodyRows = m === 'POST' ? JSON.parse(rq.postData()) : []
      const ids = m === 'POST' ? bodyRows.map(r => r.expense_id) : ((decodeURIComponent(q).match(/expense_id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean)
      const tag = m === 'POST' ? bodyRows[0].tag_id : ((q.match(/tag_id=eq\.([^&]+)/) || [])[1] || null)
      log.push({ k: 'BULK', ids, body: { [m === 'POST' ? 'add' : 'remove']: tag } }); st.bulkCalls = (st.bulkCalls || 0) + 1
      if (st.failOnBulk && st.bulkCalls === st.failOnBulk) return json({ message: 'network down', code: 'XX' }, 500)
      if (ids.some(id => id.startsWith('skip-') || !st.expenses.some(x => x.id === id && !x.bill_id && (!o.asKid || x.member_id === 'k1')))) return json({ message: 'new row violates row-level security policy for table "expense_tags"', code: '42501' }, 403)
      for (const x of st.expenses) if (ids.includes(x.id)) { const cur = tagsOf(x); x.tag_ids = m === 'POST' ? [...new Set([...cur, tag])] : tag ? cur.filter(t => t !== tag) : []; delete x.tag_id }
      return json(ids.map(expense_id => ({ expense_id })), m === 'POST' ? 201 : 200)
    }
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


const mk = (id, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: 'g', amount_cents: 1000, note: id, spent_on: `${ym(0)}-05`, bill_id: null, monthly_fee: false, tag_id: null, edited_at: null, edited_by: null, receipt_path: null, ...o })
const base = () => [
  mk('apple', { tag_ids: ['t1'], amount_cents: 1000 }), mk('bread'), mk('cheese', { tag_ids: ['t2'], amount_cents: 3000 }),
  mk('internet', { bill_id: 'b1', monthly_fee: true, amount_cents: 4000, category_id: 'h' }),
  mk('insurance', { bill_id: 'b2', monthly_fee: false, tag_ids: ['t1'], amount_cents: 60000, category_id: 'h' }), mk('fruit', { tag_ids: ['t1'], amount_cents: 500 }),
]
const names = async pg => (await pg.locator('.card:has(h2:text-matches("^(Recent|Expenses)$")) .row.item .grow > div:first-child').allInnerTexts()).map(x => x.replace(/^\S+\s/, '').replace(/ 📎$/, '').trim())
const rec = pg => pg.locator('.card:has(h2:text-matches("^(Recent|Expenses)$"))')

;(async () => {
  let s = await open('/', { expenses: base() }), pg = s.page
  const opts = await pg.locator('.listbar-filter option').allInnerTexts()
  ok(JSON.stringify(opts) === '["All expenses","Without a tag","#Kitchen","#Vietnam trip"]', 'the filter offers all, untagged and only tags that are used this month (not the archived unused one): ' + JSON.stringify(opts))
  ok((await names(pg)).join() === 'apple,bread,cheese,internet,fruit', 'unfiltered: everyday spending, yearly bill payment kept out as before')
  await pg.selectOption('.listbar-filter select', { label: '#Vietnam trip' })
  ok((await names(pg)).join() === 'apple,insurance,fruit', 'a tag filter shows everything with that tag, the yearly bill payment too')
  const sum = await rec(pg).locator('p.muted.small:has-text("expenses")').innerText()
  ok(sum.includes('3 expenses') && sum.includes('€615.00'), 'with a total that matches the tag: ' + sum.replace(/\n/g, ' '))
  ok(await rec(pg).locator('.row.item:has-text("insurance") >> text=bill').count() === 1 && await rec(pg).locator('.row.item:has-text("insurance")').getAttribute('role') === null, 'the bill payment is labelled and not tappable')
  ok((await pg.locator('.big').first().innerText()) === '€95.00', 'the month total and budget bars above are not changed by the filter (€95 = everyday spending)')
  await pg.click('text=Show all'); ok((await names(pg)).length === 5, '"Show all" clears the filter')
  await pg.selectOption('.listbar-filter select', { label: 'Without a tag' })
  ok((await names(pg)).join() === 'bread,internet', '"Without a tag": untagged everyday spending (a monthly fee included)')
  await pg.screenshot({ path: `${S}/ui/home-filter.png`, fullPage: true })

  // select mode
  await pg.click('button:text-is("Select")'); await pg.waitForTimeout(200)
  ok(await pg.locator('.actionbar').isVisible() && await pg.locator('button[aria-label="Add expense"]').isHidden(), 'select mode shows the action bar and hides the + button')
  ok(await pg.locator('button:text-is("Select all 1")').count() === 1, '"Select all" counts only what can be tagged (the monthly fee cannot)')
  await pg.locator('[role=checkbox]:has-text("bread")').click()
  ok(await pg.locator('[role=checkbox]:has-text("bread")').getAttribute('aria-checked') === 'true' && (await pg.locator('.actionbar').innerText()).includes('1 selected'), 'tapping a row selects it (and does not open the editor)')
  ok(await pg.locator('h2:text-is("Edit expense")').count() === 0, '...no editor opened')
  await pg.locator('.row.item:has-text("internet")').click(); ok((await pg.locator('.actionbar').innerText()).includes('1 selected'), 'a bill payment cannot be selected')
  await pg.screenshot({ path: `${S}/ui/home-select.png`, fullPage: true })
  await pg.click('button:has-text("Tag…")'); await pg.waitForSelector('.sheet')
  ok(await pg.locator('.sheet button.primary:text-is("Add tag")').isDisabled(), 'Add stays disabled until a tag is chosen')
  await pg.click('.sheet .tagpicker .chip:has-text("#Kitchen")'); await pg.click('.sheet button:text-is("Add tag")'); await pg.waitForTimeout(700)
  const b1 = s.log.filter(l => l.k === 'BULK')
  ok(b1.length === 1 && b1[0].ids.join() === 'bread' && JSON.stringify(b1[0].body) === '{"add":"t2"}', 'one request tags exactly the selected expense with the chosen tag')
  ok((await rec(pg).locator('[role=status]').innerText()).includes('Tagged 1 expense with #Kitchen.'), 'a message says what happened')
  ok(await pg.locator('.actionbar').count() === 0, 'select mode ends')
  await pg.click('.listbar-filter select'); await pg.selectOption('.listbar-filter select', { label: 'All expenses' })
  ok(await rec(pg).locator('.row.item:has-text("bread") >> text=#Kitchen').count() === 1, 'the list reloaded and shows the new tag')

  // remove tags
  await pg.selectOption('.listbar-filter select', { label: '#Vietnam trip' }); await pg.click('button:text-is("Select")')
  await pg.click('button:has-text("Select all")'); ok((await pg.locator('.actionbar').innerText()).includes('2 selected'), 'select all picks the 2 editable expenses (not the bill payment)')
  await pg.click('button:has-text("Tag…")'); await pg.click('.sheet button:has-text("Remove all their tags instead")'); await pg.waitForTimeout(700)
  const b2 = s.log.filter(l => l.k === 'BULK')[1]
  ok(JSON.stringify(b2.body) === '{"remove":null}' && b2.ids.sort().join() === 'apple,fruit' && s.dialogs.some(d => d.type === 'confirm' && d.msg.includes('Remove all tags from 2')), 'removing asks first, then clears just those two')
  ok((await rec(pg).locator('[role=status]').innerText()).includes('Removed the tags from 2 expenses.'), 'and says so')
  ok(s.errors.length === 0, 'no errors so far ' + s.errors.join('|'))
  await s.b.close()

  // a new tag from the bulk sheet
  s = await open('/', { expenses: base() }); pg = s.page
  await pg.click('button:text-is("Select")'); await pg.locator('[role=checkbox]:has-text("bread")').click(); await pg.click('button:has-text("Tag…")')
  await pg.click('.sheet >> text=＋ New tag'); await pg.fill('.sheet .tagpicker input', 'Picnic'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500)
  await pg.click('.sheet button:text-is("Add tag")'); await pg.waitForTimeout(700)
  ok(s.log.filter(l => l.k === 'POST' && l.tb === 'tags').length === 1 && s.log.find(l => l.k === 'BULK').body.add === 'tag-new', 'a tag made in the bulk sheet is created once and applied')
  await s.b.close()

  // keyboard
  s = await open('/', { expenses: base() }); pg = s.page
  await pg.click('button:text-is("Select")'); await pg.locator('[role=checkbox]:has-text("bread")').focus(); await pg.keyboard.press('Space')
  ok(await pg.locator('[role=checkbox]:has-text("bread")').getAttribute('aria-checked') === 'true', 'rows can be selected from the keyboard')
  await pg.click('.actionbar button:text-is("Cancel")'); ok(await pg.locator('.actionbar').count() === 0, 'Cancel leaves select mode')
  await s.b.close()

  // many expenses: requests stay small
  const many = Array.from({ length: 250 }, (_, i) => mk('m' + String(i).padStart(3, '0'), { amount_cents: 100 }))
  s = await open('/', { expenses: many }); pg = s.page
  await pg.click('button:text-is("Select")'); ok(await pg.locator('.row.item').count() === 250, 'select mode lists everything (not just the first 30)')
  await pg.click('button:has-text("Select all 250")'); await pg.click('button:has-text("Tag…")'); await pg.click('.sheet .tagpicker .chip:has-text("#Vietnam trip")'); await pg.click('.sheet button:text-is("Add tag")'); await pg.waitForTimeout(1200)
  const bulk = s.log.filter(l => l.k === 'BULK')
  ok(JSON.stringify(bulk.map(b => b.ids.length)) === '[100,100,50]', '250 expenses are tagged in 3 requests of at most 100: ' + JSON.stringify(bulk.map(b => b.ids.length)))
  ok(new Set(bulk.flatMap(b => b.ids)).size === 250, 'every expense is in exactly one request')
  ok((await rec(pg).locator('[role=status]').innerText()).includes('Tagged 250 expenses with #Vietnam trip.'), 'one message for the whole job')
  await s.b.close()

  // partial result and an error part-way
  const mixed = [...Array.from({ length: 3 }, (_, i) => mk('ok' + i)), mk('skip-1'), mk('skip-2')]
  s = await open('/', { expenses: mixed }); pg = s.page
  await pg.click('button:text-is("Select")'); await pg.click('button:has-text("Select all 5")'); await pg.click('button:has-text("Tag…")'); await pg.click('.sheet .tagpicker .chip:has-text("#Kitchen")'); await pg.click('.sheet button:text-is("Add tag")'); await pg.waitForTimeout(800)
  const pm = await rec(pg).locator('[role=status]').innerText()
  ok(pm.includes('Stopped after 0 of 5') && pm.includes('row-level security'), 'if the database refuses some (they are not yours to tag), nothing is half done and the message says why: ' + pm.replace(/\n/g, ' ').slice(0, 130))
  await s.b.close()
  s = await open('/', { expenses: Array.from({ length: 250 }, (_, i) => mk('m' + String(i).padStart(3, '0'))), failOnBulk: 2 }); pg = s.page
  await pg.click('button:text-is("Select")'); await pg.click('button:has-text("Select all 250")'); await pg.click('button:has-text("Tag…")'); await pg.click('.sheet .tagpicker .chip:has-text("#Vietnam trip")'); await pg.click('.sheet button:text-is("Add tag")'); await pg.waitForTimeout(1000)
  const em = await rec(pg).locator('[role=status]').innerText()
  ok(em.includes('Stopped after 100 of 250') && em.includes('network down') && s.log.filter(l => l.k === 'BULK').length === 2, 'an error part-way stops, says how far it got, and does not hammer on: ' + em.replace(/\n/g, ' ').slice(0, 90))
  ok((await rec(pg).locator('.row.item:has-text("m000") >> text=#Vietnam trip').count()) === 1, 'and the list shows what did get saved')
  await s.b.close()

  // a child: only their own expenses can be selected
  const kidList = [mk('mine1', { member_id: 'k1' }), mk('mine2', { member_id: 'k1' }), mk('mums', { member_id: 'p1' })]
  s = await open('/', { expenses: kidList, asKid: true }); pg = s.page
  await pg.click('button:text-is("Select")'); ok(await pg.locator('button:has-text("Select all 2")').count() === 1, 'a child can select only their own expenses')
  await pg.locator('.row.item:has-text("mums")').click(); ok((await pg.locator('.actionbar').innerText()).includes('0 selected'), "and not a parent's")
  await s.b.close()

  // removing the tag from its last expense keeps the filter (so it survives month stepping) and offers a way out
  s = await open('/', { expenses: [mk('solo', { tag_ids: ['t2'] }), mk('other')] }); pg = s.page
  await pg.selectOption('.listbar-filter select', { label: '#Kitchen' }); await pg.click('button:text-is("Select")'); await pg.click('button:has-text("Select all")'); await pg.click('button:has-text("Tag…")'); await pg.click('.sheet button:has-text("Remove all their tags instead")'); await pg.waitForTimeout(800)
  ok((await rec(pg).innerText()).includes('Nothing here for this month') && await pg.locator('.listbar-filter select').inputValue() === 't2', 'when the last expense loses the filtered tag, the list says nothing is left for it')
  await pg.click('text=Show all'); ok((await names(pg)).length === 2 && await pg.locator('.listbar-filter select').inputValue() === '', 'and "Show all" brings everything back')
  ok(s.errors.length === 0, 'no errors ' + s.errors.join('|'))
  await s.b.close()
  s = await open('/', { expenses: [mk('solo', { tag_ids: ['t2'] }), mk('other')] }); pg = s.page
  await pg.selectOption('.listbar-filter select', { label: '#Kitchen' }); await pg.click('button[aria-label="Previous month"]'); await pg.waitForTimeout(600)
  ok(await pg.locator('.listbar-filter select').inputValue() === 't2' && (await rec(pg).innerText()).includes('Nothing here for this month'), 'the filter stays when stepping to a month without that tag, and says so')
  await pg.click('button[aria-label="Next month"]'); await pg.waitForTimeout(600)
  ok((await names(pg)).join() === 'solo', 'and is still applied when stepping back')
  await s.b.close()

  console.log(results.join('\n')); process.exit(failed ? 1 : 0)
})()

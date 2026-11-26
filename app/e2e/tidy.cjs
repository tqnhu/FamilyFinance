const { chromium } = require('playwright')
const { withEt, flat } = require('./etshim.cjs')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7)
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const cats = [{ id: 'g', name: 'Groceries', emoji: '🛒', budget_cents: 0, archived: false }, { id: 'e', name: 'Eating out', emoji: '🍕', budget_cents: 0, archived: false }, { id: 't', name: 'Transport', emoji: '🚌', budget_cents: 0, archived: false }, { id: 'f', name: 'Fun', emoji: '🎮', budget_cents: 0, archived: false }, { id: 'o', name: 'Other', emoji: '📦', budget_cents: 0, archived: false }]
const TAGS = [{ id: 't1', name: 'Sports', archived: false }]
const KID = { user_id: 'k1', family_id: 'f1', display_name: 'Mia', role: 'child', username: 'mia' }
const results = []; let failed = false
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) failed = true }
const x = (id, cat, cents, spent_on, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: cat, amount_cents: cents, note: id, spent_on, bill_id: null, monthly_fee: false, tag_id: null, annual_fee: false, edited_at: null, edited_by: null, receipt_path: null, created_at: spent_on + 'T10:00:00Z', ...o })

async function open(path, o = {}) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 1500 } })
  const log = [], errors = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of [45]\d\d|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  page.on('dialog', d => d.accept())
  const sess = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: o.asKid ? 'k1' : 'p1', email: 'a@b.c', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now.toISOString() } }
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(sess)])
  const st = { expenses: [], rules: [], ...o }
  await page.route(SB + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), p = u.pathname, m = rq.method()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    const json = (v, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(v) })
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (p.startsWith('/rest/v1/rpc/')) return json(p.endsWith('settle_allowance') ? 0 : [])
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop(), single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (tb === 'classification_rules') {
      if (m === 'GET') return json(st.rules)
      const body = rq.postData() ? JSON.parse(rq.postData()) : null; log.push({ k: m, tb, q: u.search, body })
      if (m === 'POST') {
        if (st.dupError) return json({ code: '23505', message: 'duplicate key' }, 409)
        st.rules.unshift({ id: 'r' + (st.rules.length + 1), min_cents: null, max_cents: null, tag_id: null, annual_fee: false, status: 'on', ...body }); return route.fulfill({ status: 201, headers: cors, body: '' })
      }
      const id = decodeURIComponent((u.search.match(/id=eq\.([^&]+)/) || [])[1] || '')
      if (m === 'PATCH') { const r = st.rules.find(x => x.id === id); if (r) Object.assign(r, body); return json(r ? [{ id }] : []) }
      if (m === 'DELETE') { const n = st.rules.length; st.rules = st.rules.filter(x => x.id !== id); return json(n !== st.rules.length ? [{ id }] : []) }
    }
    if (m === 'PATCH' && tb === 'expenses' && u.search.includes('id=in.')) {
      const ids = ((decodeURIComponent(u.search).match(/id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean).map(x => x.replace(/"/g, ''))
      const body = JSON.parse(rq.postData()); log.push({ k: 'BULK', ids, body }); st.bulks = (st.bulks || 0) + 1
      if (st.failBulk && st.bulks === st.failBulk) return json({ message: 'network down', code: 'XX' }, 500)
      const hit = st.expenses.filter(x => ids.includes(x.id) && !x.bill_id); for (const x of hit) Object.assign(x, body)
      return json(hit.map(x => ({ id: x.id })))
    }
    if (m === 'POST') { log.push({ k: 'POST', tb, body: JSON.parse(rq.postData()) }); return route.fulfill({ status: 201, headers: cors, body: '' }) }
    if (m === 'PATCH' || m === 'DELETE') { log.push({ k: m, tb, q: u.search, body: rq.postData() ? JSON.parse(rq.postData()) : null }); return json([{ id: 'ok' }]) }
    if (tb === 'expenses' && u.searchParams.get('category_id') === 'not.is.null') return json(st.history || [])
    if (tb === 'expenses') {
      let rows = st.expenses; const cq = u.searchParams.get('category_id'); if (cq && cq.startsWith('eq.')) rows = rows.filter(x => x.category_id === cq.slice(3)); if (u.searchParams.get('bill_id') === 'is.null') rows = rows.filter(x => !x.bill_id)
      for (const r of u.searchParams.getAll('spent_on')) { const [op, ...v] = r.split('.'); const val = v.join('.'); rows = rows.filter(e => op === 'gte' ? e.spent_on >= val : op === 'lt' ? e.spent_on < val : true) }
      return json(withEt([...rows].sort((a, c) => c.spent_on.localeCompare(a.spent_on))))
    }
    const map = { categories: cats, members: [P, KID], bills: [], bill_payments: [], tags: TAGS }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173' + path); await page.waitForTimeout(1100)
  return { b, page, log, errors, st }
}
const bulks = s => s.log.filter(l => l.k === 'BULK')
const hist = (note, cat, n) => Array.from({ length: n }, () => ({ note, category_id: cat }))
const ymd = new Date().toLocaleDateString('sv')
const ex = (id, note, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: 'o', amount_cents: 1200, note, spent_on: ymd, bill_id: null, monthly_fee: false, tag_id: null, annual_fee: false, ...o })
const data = () => [ex('e1', 'Lidl Berlin'), ex('e2', 'Netflix.com'), ex('e3', 'Sportclub contributie', { amount_cents: 12000 }), ex('e4', 'Kramer Corner'), ex('e5', 'Qwerty Holdings'),
  ex('e6', 'Lidl', { category_id: 'g' }), ex('e7', 'Insurance payment', { bill_id: 'b1' })]
const opts = (o = {}) => ({ expenses: data(), history: hist('Kramer Corner', 'e', 2), rules: [{ id: 'r1', pattern: 'sportclub', min_cents: null, max_cents: null, category_id: 'f', tag_id: 't1', annual_fee: true, status: 'on' }], ...o })
const txt = (pg, sel) => pg.locator(sel).first().innerText().then(t => t.replace(/\s+/g, ' '))
const open2 = async o => { const x = await open('/plan?tab=rules', opts(o)); await x.page.locator('button:has-text("Tidy up Other")').click(); await x.page.waitForSelector('.tidy-row, h2:has-text("Nothing in Other")'); return x }

;(async () => {
  let s = await open2(), pg = s.page
  const head = await txt(pg, 'section.card')
  ok(head.includes('5 expenses are in Other') && head.includes('suggestion for 4') && head.includes('Nothing changes until you do'), 'the summary counts what is in Other (the bill payment is not) and what has a suggestion: ' + head)
  ok(head.includes('1 has no suggestion') && head.includes('Settings, Configuration'), 'and says how many have none and what to do')
  const rowOf = t => pg.locator(`.tidy-row:has-text("${t}")`)
  ok((await pg.locator('.tidy-row').count()) === 4, 'four rows are listed')
  ok(await rowOf('Lidl Berlin').locator('input').isChecked() && await rowOf('Netflix').locator('input').isChecked() && await rowOf('Sportclub').locator('input').isChecked(), 'the sure ones (starter and your rules) are ticked to start with')
  ok(!(await rowOf('Kramer').locator('input').isChecked()) && (await rowOf('Kramer').innerText()).toLowerCase().includes('maybe'), 'a weaker, history-based one is only offered: unticked and labelled maybe')
  ok((await rowOf('Lidl Berlin').innerText()).includes('Groceries') && (await rowOf('Sportclub').innerText()).includes('as an annual fee') && (await rowOf('Sportclub').innerText()).includes('Your rule'), 'each row says where it would go and why')
  ok(await pg.locator('button.primary:has-text("Move 3 expenses")').count() === 1, 'the button says exactly how many')
  await pg.getByRole('button', { name: 'Select none' }).click()
  ok(await pg.locator('button.primary').isDisabled(), 'with nothing ticked the button is off')
  await pg.getByRole('button', { name: 'Select all' }).click()
  ok(await pg.locator('button.primary:has-text("Move 4 expenses")').count() === 1, 'Select all ticks the maybe one too')
  await rowOf('Kramer').locator('input').uncheck(); await rowOf('Netflix').locator('input').uncheck()
  ok(await pg.locator('button.primary:has-text("Move 2 expenses")').count() === 1, 'unticking works one at a time')
  ok(bulks(s).length === 0, 'nothing has been sent yet')
  await pg.screenshot({ path: `${S}/ui/tidy.png`, fullPage: true })
  await rowOf('Netflix').locator('input').check()

  /* ===== moving, and undoing ===== */
  await pg.click('button.primary:has-text("Move 3 expenses")'); await pg.waitForTimeout(900)
  const b = bulks(s)
  const byCat = c => b.find(x => x.body.category_id === c && !('tag_id' in x.body))
  ok(b.length === 3, 'three updates: one per distinct change, each for many rows: ' + JSON.stringify(b.map(x => [x.ids, x.body])))
  ok(JSON.stringify(b.find(x => x.ids.includes('e1')).body) === '{"category_id":"g"}' && b.find(x => x.ids.includes('e1')).ids.length === 1, 'Lidl moves to Groceries only')
  ok(JSON.stringify(b.find(x => x.ids.includes('e3')).body) === '{"category_id":"f","annual_fee":true}' && s.log.some(l => l.k === 'POST' && l.tb === 'expense_tags' && JSON.stringify(l.body) === '[{"expense_id":"e3","tag_id":"t1"}]'), 'the rule\'s annual-fee flag is applied to its expense and its tag is added: ' + JSON.stringify(b.find(x => x.ids.includes('e3')).body))
  ok(!b.some(x => x.ids.includes('e4') || x.ids.includes('e5') || x.ids.includes('e7') || x.ids.includes('e6')), 'only the ticked expenses were touched (not the unticked, the unknown, the bill payment or the one already in Groceries)')
  ok((await txt(pg, '.attention')).includes('Moved 3 expenses out of Other') && (await txt(pg, '.attention')).includes('Undo'), 'a result card offers Undo: ' + await txt(pg, '.attention'))
  ok(await pg.locator('.tidy-row').count() === 1 && (await pg.locator('.tidy-row').innerText()).includes('Kramer'), 'the moved ones leave the list, the maybe one is still there')
  ok(s.st.expenses.find(x => x.id === 'e3').annual_fee === true && s.st.expenses.find(x => x.id === 'e1').category_id === 'g', 'and they really changed')
  await pg.click('button:has-text("Undo this move")'); await pg.waitForTimeout(900)
  const back = bulks(s).slice(3)
  ok(back.length === 2 && back.find(x => x.ids.includes('e1')).ids.includes('e2') && JSON.stringify(back.find(x => x.ids.includes('e3')).body) === '{"category_id":"o","annual_fee":false}' && s.log.some(l => l.k === 'DELETE' && l.tb === 'expense_tags' && decodeURIComponent(l.q).includes('expense_id=in.(e3)') && l.q.includes('tag_id=eq.t1')) && JSON.stringify(back.find(x => x.ids.includes('e1')).body) === '{"category_id":"o"}', 'undo puts back exactly what was changed: ' + JSON.stringify(back.map(x => x.body)))
  ok(s.st.expenses.filter(x => x.category_id === 'o' && !x.bill_id).length === 5 && s.st.expenses.find(x => x.id === 'e3').annual_fee === false, 'all five are in Other again, with no annual flag (and the tag the rule added is taken off again)')
  ok((await txt(pg, '.attention')).includes('Put back') && await pg.locator('.tidy-row').count() === 4, 'the screen says so and shows the suggestions again')
  ok(s.errors.length === 0, 'no page errors: ' + s.errors.join(' | '))
  await s.b.close()

  /* ===== trouble, and empty states ===== */
  s = await open2({ failBulk: 2 }); pg = s.page
  await pg.click('button.primary:has-text("Move 3 expenses")'); await pg.waitForTimeout(900)
  ok((await pg.locator('[role=alert]').innerText()).includes('Changed 1 of 3 before an error'), 'an error part-way says how far it got: ' + await pg.locator('[role=alert]').innerText())
  ok((await txt(pg, '.attention')).includes('Moved 1 expense out of Other'), 'and what was moved can still be undone')
  await s.b.close()

  s = await open('/plan?tab=rules', opts({ expenses: [ex('e6', 'Lidl', { category_id: 'g' })] })); pg = s.page
  await pg.locator('button:has-text("Tidy up Other")').click(); await pg.waitForSelector('h2:has-text("Nothing in Other")')
  ok(true, 'an empty Other says so')
  await pg.click('button:has-text("Back to Rules")'); await pg.waitForSelector('h2:has-text("Automatic categories")')
  ok(true, 'Back returns to the rules')
  await s.b.close()

  console.log(results.join('\n')); console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${results.filter(r => r.startsWith('FAIL')).length} failed`)
  process.exit(failed ? 1 : 0)
})().catch(e => { console.log(results.join('\n')); console.error('CRASH', e); process.exit(1) })

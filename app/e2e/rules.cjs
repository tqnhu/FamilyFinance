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
    if (m === 'POST') { log.push({ k: 'POST', tb, body: JSON.parse(rq.postData()) }); return route.fulfill({ status: 201, headers: cors, body: '' }) }
    if (m === 'PATCH' || m === 'DELETE') { log.push({ k: m, tb, q: u.search, body: rq.postData() ? JSON.parse(rq.postData()) : null }); return json([{ id: 'ok' }]) }
    if (tb === 'expenses' && u.searchParams.get('category_id') === 'not.is.null') return json(st.history || [])
    if (tb === 'expenses') {
      let rows = st.expenses; for (const r of u.searchParams.getAll('spent_on')) { const [op, ...v] = r.split('.'); const val = v.join('.'); rows = rows.filter(e => op === 'gte' ? e.spent_on >= val : op === 'lt' ? e.spent_on < val : true) }
      return json(withEt([...rows].sort((a, c) => c.spent_on.localeCompare(a.spent_on))))
    }
    const map = { categories: cats, members: [P, KID], bills: [], bill_payments: [], tags: TAGS }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173' + path); await page.waitForTimeout(1100)
  return { b, page, log, errors, st }
}
const reqs = (s, k, tb = 'classification_rules') => s.log.filter(l => l.k === k && l.tb === tb)
const expPosts = s => s.log.filter(l => l.k === 'POST' && l.tb === 'expenses').flatMap(l => Array.isArray(l.body) ? l.body : [l.body])
const hist = (note, cat, n) => Array.from({ length: n }, () => ({ note, category_id: cat }))
const R = (id, pattern, category_id, o = {}) => ({ id, pattern, min_cents: null, max_cents: null, category_id, tag_id: null, annual_fee: false, status: 'on', ...o })
const ymd = new Date().toLocaleDateString('sv')
const ex = (id, cat) => ({ id, family_id: 'f1', member_id: 'p1', category_id: cat, amount_cents: 500, note: id, spent_on: ymd, bill_id: null, monthly_fee: false, tag_id: null, annual_fee: false })
const txt = (pg, sel) => pg.locator(sel).first().innerText().then(t => t.replace(/\s+/g, ' '))

;(async () => {
  /* ===== the Rules tab ===== */
  let s = await open('/plan?tab=rules', { history: [...hist('Kramer Corner Utrecht', 'e', 4), ...hist('Lidl Berlin', 'g', 3), ...hist('Rare Place', 'f', 2), ...hist('Zeta Shop', 't', 3)], expenses: [ex('a', 'o'), ex('b', 'o'), ex('c', 'g'), ex('d', 'g'), ex('y', 'g')] }); let pg = s.page
  ok(JSON.stringify(await pg.getByRole('tab').allInnerTexts()) === JSON.stringify(['My profile', 'Family', 'Configuration']), 'the old Plan → Rules link lands on Settings, Configuration')
  ok((await txt(pg, 'section:has-text("Automatic categories")')).includes('2 of 5 expenses in the last 30 days are in Other (40%)'), 'it says how much is in Other: ' + await txt(pg, 'section:has-text("Automatic categories")'))
  const learned = await pg.locator('section:has(h2:text-is("Learned from you")) .rule-row').allInnerTexts()
  ok(learned.length === 2 && learned[0].includes('kramer corner') && learned[0].includes('Eating out') && learned[0].includes('4 times') && learned[1].includes('zeta shop'), 'two learned patterns are offered (Lidl is a starter shop, Rare Place has only 2): ' + JSON.stringify(learned.map(x => x.replace(/\n/g, ' '))))
  ok((await pg.locator('section:has(h2:text-is("Your rules"))').innerText()).includes('No rules yet'), 'no rules yet')
  await pg.locator('section:has(h2:text-is("Learned from you")) button:has-text("Make a rule")').first().click(); await pg.waitForTimeout(500)
  let b = reqs(s, 'POST')[0]?.body
  ok(b && b.pattern === 'kramer corner' && b.category_id === 'e' && b.status === 'on' && b.family_id === 'f1' && b.created_by === 'p1' && b.min_cents === null && b.annual_fee === false, 'Make a rule saves it as an on rule by the signed-in parent: ' + JSON.stringify(b))
  ok((await pg.locator('section:has(h2:text-is("Your rules"))').innerText()).includes('Description contains "kramer corner"') && (await pg.locator('section:has(h2:text-is("Learned from you")) .rule-row').count()) === 1, 'it appears under Your rules and leaves the learned list')
  await pg.locator('section:has(h2:text-is("Learned from you")) button:has-text("Not this one")').click(); await pg.waitForTimeout(500)
  b = reqs(s, 'POST')[1]?.body
  ok(b && b.pattern === 'zeta shop' && b.status === 'dismissed', 'Not this one is remembered as dismissed: ' + JSON.stringify(b))
  ok(await pg.locator('section:has(h2:text-is("Learned from you"))').count() === 0 && !(await pg.locator('section:has(h2:text-is("Your rules"))').innerText()).includes('zeta shop'), 'a dismissed pattern is not offered again and not listed as a rule')
  await pg.locator('details summary').click()
  ok((await pg.locator('details').innerText()).includes('albert heijn') && (await pg.locator('details').innerText()).includes('Used last'), 'starter rules can be read')
  await pg.screenshot({ path: `${S}/ui/rules-tab.png`, fullPage: true })

  /* ===== a new rule ===== */
  await pg.locator('button:has-text("New rule")').click(); await pg.waitForSelector('.sheet')
  await pg.fill('.sheet input[placeholder*="sportclub"]', 'x'); await pg.click('.sheet button:text-is("Save rule")')
  ok((await pg.locator('.sheet .error').innerText()).includes('at least 2 characters'), 'a too-short text is refused with a sentence')
  await pg.fill('.sheet input[placeholder*="sportclub"]', 'SPORTCLUB'); await pg.click('.sheet button:text-is("Save rule")')
  ok((await pg.locator('.sheet .error').innerText()).includes('Choose a category'), 'a category is required')
  await pg.locator('.sheet input[placeholder="any"]').first().fill('150'); await pg.locator('.sheet input[placeholder="any"]').nth(1).fill('50'); await pg.locator('.sheet .chip:has-text("Fun")').click(); await pg.click('.sheet button:text-is("Save rule")')
  ok((await pg.locator('.sheet .error').innerText()).includes('smallest amount cannot be more'), 'smallest above largest is refused')
  await pg.locator('.sheet input[placeholder="any"]').first().fill('50'); await pg.locator('.sheet input[placeholder="any"]').nth(1).fill('')
  ok((await pg.locator('.sheet .suggest').innerText()).includes('Matches 0'), 'the preview counts matching earlier expenses (none yet)')
  await pg.locator('.sheet .chip:has-text("#Sports")').click(); await pg.locator('.sheet label.annual-opt input').check()
  await pg.click('.sheet button:text-is("Save rule")'); await pg.waitForTimeout(600)
  b = reqs(s, 'POST')[2]?.body
  ok(b && b.pattern === 'sportclub' && b.min_cents === 5000 && b.max_cents === null && b.category_id === 'f' && b.tag_id === 't1' && b.annual_fee === true, 'saved with the pattern cleaned up, euros turned into cents, tag and annual fee: ' + JSON.stringify(b))
  const row = await txt(pg, '.rule-row:has-text("sportclub")')
  ok(row.includes('the amount is €50 or more') && row.includes('then Fun') && row.includes('as an annual fee') && row.includes('with a tag'), 'the list explains it in words: ' + row)
  await s.b.close()

  /* ===== switch, edit, delete, duplicates ===== */
  s = await open('/plan?tab=rules', { rules: [R('r1', 'sportclub', 'f', { annual_fee: true }), R('r2', 'shell', 't', { min_cents: 6000 }), R('r3', 'old one', 'g', { status: 'off' }), R('r4', 'turned down', 'g', { status: 'dismissed' })] }); pg = s.page
  const rows = await pg.locator('section:has(h2:text-is("Your rules")) .rule-row').allInnerTexts()
  ok(rows.length === 3 && !rows.join().includes('turned down'), 'three rules are listed, the dismissed one is not')
  ok(await pg.getByRole('switch', { name: 'Rule on: old one' }).isChecked() === false && await pg.getByRole('switch', { name: 'Rule on: sportclub' }).isChecked(), 'switches show which rules are on')
  await pg.getByRole('switch', { name: 'Rule on: sportclub' }).click(); await pg.waitForTimeout(400)
  ok(reqs(s, 'PATCH').length === 1 && JSON.stringify(reqs(s, 'PATCH')[0].body) === '{"status":"off"}' && reqs(s, 'PATCH')[0].q.includes('id=eq.r1'), 'switching off sends only the status for that rule')
  await pg.getByRole('switch', { name: 'Rule on: sportclub' }).click(); await pg.waitForTimeout(400)
  ok(JSON.stringify(reqs(s, 'PATCH')[1].body) === '{"status":"on"}', 'and back on')
  await pg.getByRole('button', { name: 'Edit rule: shell' }).click(); await pg.waitForSelector('.sheet')
  ok(await pg.locator('.sheet input[placeholder*="sportclub"]').inputValue() === 'shell' && await pg.locator('.sheet input[placeholder="any"]').first().inputValue() === '60' && (await pg.locator('.sheet .chip.on').innerText()).includes('Transport'), 'editing shows the rule\'s current values')
  await pg.locator('.sheet .chip:has-text("Fun")').click(); await pg.click('.sheet button:text-is("Save changes")'); await pg.waitForTimeout(500)
  const ch = reqs(s, 'PATCH')[2]
  ok(ch.q.includes('id=eq.r2') && ch.body.category_id === 'f' && ch.body.pattern === 'shell' && ch.body.min_cents === 6000 && ch.body.status === 'on' && !('family_id' in ch.body), 'saving changes sends the rule\'s fields, never the family: ' + JSON.stringify(ch.body))
  await pg.getByRole('button', { name: 'Edit rule: shell' }).click(); await pg.waitForSelector('.sheet')
  await pg.click('.sheet button:text-is("Delete this rule")'); await pg.waitForTimeout(500)
  ok(reqs(s, 'DELETE').length === 1 && reqs(s, 'DELETE')[0].q.includes('id=eq.r2') && await pg.locator('.rule-row:has-text("shell")').count() === 0, 'delete asks first, then removes just that rule')
  s.st.dupError = true
  await pg.locator('button:has-text("New rule")').click(); await pg.waitForSelector('.sheet'); await pg.fill('.sheet input[placeholder*="sportclub"]', 'sportclub'); await pg.locator('.sheet .chip:has-text("Fun")').click(); await pg.click('.sheet button:text-is("Save rule")'); await pg.waitForTimeout(500)
  ok((await pg.locator('.sheet .error').innerText()).includes('already a rule with the same text'), 'a duplicate gives a clear message')
  ok(s.errors.length === 0, 'no page errors: ' + s.errors.join(' | '))
  await s.b.close()

  /* ===== the expense form follows the rules ===== */
  const rules = [R('r1', 'sportclub', 'f', { tag_id: 't1', annual_fee: true }), R('r2', 'shell', 'g', { min_cents: 6000 })]
  const openAdd = async pg => { await pg.click('button[aria-label="Add expense"]'); await pg.waitForSelector('.sheet'); await pg.waitForTimeout(500) }
  const note = async (pg, t) => { await pg.fill('.sheet label:has-text("Note") input', t); await pg.waitForTimeout(350) }
  const picked = pg => pg.locator('.sheet .chips').first().locator('.chip.on').allInnerTexts()
  s = await open('/', { rules }); pg = s.page
  await openAdd(pg); await note(pg, 'Sportclub contributie')
  ok((await picked(pg)).join().includes('Fun') && await pg.locator('.sheet label.annual-opt input').isChecked() && (await pg.locator('.sheet .tagpicker .chip.on').innerText()).includes('Sports'), 'a rule pre-selects the category, the tag and the annual-fee box')
  ok((await txt(pg, '.suggest')).includes('Your rule: "sportclub" goes to Fun, as an annual fee.'), 'and says it is your rule: ' + await txt(pg, '.suggest'))
  await pg.locator('.sheet label.annual-opt input').uncheck(); await note(pg, 'Sportclub kleding')
  ok(!(await pg.locator('.sheet label.annual-opt input').isChecked()), 'a box you changed yourself is not switched back on by the rule')
  await note(pg, 'Shell Utrecht')
  ok((await picked(pg)).join().includes('Transport') && (await txt(pg, '.suggest')).toLowerCase().includes('starter'), 'an amount rule waits for an amount: with none, the starter rule applies (Transport)')
  await pg.fill('input[inputmode=decimal]', '45'); await pg.waitForTimeout(350)
  ok((await picked(pg)).join().includes('Transport'), 'under the amount: still the starter rule')
  await pg.fill('input[inputmode=decimal]', '80'); await pg.waitForTimeout(350)
  ok((await picked(pg)).join().includes('Groceries') && (await txt(pg, '.suggest')).includes('Your rule: "shell" goes to Groceries'), 'from the amount up: your rule wins: ' + await txt(pg, '.suggest'))
  await s.b.close()

  s = await open('/'); pg = s.page
  await openAdd(pg); await note(pg, 'Lidl Berlin')
  ok(await pg.locator('.remember').count() === 0, 'no "remember" prompt while you agree with the suggestion')
  await pg.locator('.sheet .chip:has-text("Transport")').click()
  const prompt = await txt(pg, '.remember')
  ok(prompt.includes('Remember this choice?') && prompt.includes('from Groceries to Transport') && prompt.includes('"lidl" in Transport'), 'changing a suggestion offers to remember it: ' + prompt)
  await pg.click('.remember button:text-is("Remember")'); await pg.waitForTimeout(500)
  b = reqs(s, 'POST')[0]?.body
  ok(b && b.pattern === 'lidl' && b.category_id === 't' && b.status === 'on' && b.annual_fee === false && b.family_id === 'f1', 'Remember saves a rule: ' + JSON.stringify(b))
  ok(await pg.locator('.remember').count() === 0 && (await pg.locator('.sheet').innerText()).includes('Saved as a rule'), 'the prompt is replaced by a confirmation')
  await pg.fill('input[inputmode=decimal]', '12'); await pg.click('button.primary:text-is("Save")'); await pg.waitForTimeout(700)
  ok(expPosts(s).length === 1 && expPosts(s)[0].category_id === 't', 'the expense itself is saved with the category you chose')
  await openAdd(pg); await note(pg, 'Albert Heijn 7'); await pg.locator('.sheet .chip:has-text("Eating out")').click()
  await pg.click('.remember button:text-is("Just this once")')
  ok(await pg.locator('.remember').count() === 0 && reqs(s, 'POST').length === 1, 'Just this once hides it and saves nothing')
  await s.b.close()

  s = await open('/', { asKid: true }); pg = s.page
  await openAdd(pg); await note(pg, 'Lidl Berlin'); await pg.locator('.sheet .chip:has-text("Transport")').click()
  ok(await pg.locator('.remember').count() === 0, 'children are never asked to make rules')
  await s.b.close()

  /* ===== the bank import follows the rules and remembers your changes ===== */
  const csv = ['Date,Description,Amount', '2026-03-01,Sportclub Rijnstad,-120.00', '2026-03-02,PAYPAL *4837,-36.90', '2026-03-03,Albert Heijn 1042,-23.45'].join('\n')
  const load = async o => { const x = await open('/plan?tab=import', o); await x.page.setInputFiles('input[type=file]', { name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await x.page.waitForSelector('.imp-row'); await x.page.waitForTimeout(500); return x }
  s = await load({ rules }); pg = s.page
  const catOf = t => pg.locator(`.imp-row:has-text("${t}") select`).evaluate(e => e.options[e.selectedIndex].text)
  ok((await catOf('Sportclub')).includes('Fun') && (await pg.locator('.imp-row:has-text("Sportclub") .imp-why').innerText()).includes('Your rule') && await pg.locator('.imp-row:has-text("Sportclub") label.imp-annual input').isChecked(), 'a rule sorts a row, and sets its annual-fee box')
  ok(!(await pg.locator('.imp-row:has-text("Sportclub") .imp-why').innerText()).includes('looks like'), 'no "looks like an annual fee" hint on a row the rule already decided')
  ok(await pg.locator('label:has-text("Remember the categories I choose here") input').isChecked(), 'remembering your choices is on by default')
  await pg.locator('.imp-row:has-text("PAYPAL") select').selectOption({ label: '🚌 Transport' })
  await pg.locator('.imp-row:has-text("Albert") select').selectOption({ label: '🍕 Eating out' })
  await pg.click('button.primary:has-text("Import 3")'); await pg.waitForTimeout(1200)
  const imp = expPosts(s), sc = imp.find(r => r.note.includes('Sportclub'))
  const sTags = s.log.filter(l => l.k === 'POST' && l.tb === 'expense_tags').flatMap(l => l.body)
  ok(sc.annual_fee === true && sc.category_id === 'f' && sTags.some(t => t.expense_id === sc.id && t.tag_id === 't1'), 'the rule\'s tag and annual-fee flag are imported with that row: ' + JSON.stringify([sc, sTags]))
  const made = reqs(s, 'POST').map(r => r.body)
  ok(made.length === 2 && made.some(r => r.pattern === 'paypal' && r.category_id === 't') && made.some(r => r.pattern === 'albert heijn' && r.category_id === 'e'), 'the two categories you changed become rules (one per shop): ' + JSON.stringify(made.map(r => [r.pattern, r.category_id])))
  ok((await pg.locator('.attention').innerText()).includes('2 of your category choices were saved as rules'), 'the result says so: ' + await txt(pg, '.attention'))
  await s.b.close()

  s = await load({ rules }); pg = s.page
  await pg.locator('.imp-row:has-text("PAYPAL") select').selectOption({ label: '🚌 Transport' })
  await pg.locator('label:has-text("Remember the categories I choose here") input').uncheck()
  await pg.click('button.primary:has-text("Import 3")'); await pg.waitForTimeout(1000)
  ok(reqs(s, 'POST').length === 0 && expPosts(s).length === 3, 'with remembering switched off, nothing is saved as a rule')
  await s.b.close()

  s = await load({ rules: [R('r9', 'paypal', 't')] }); pg = s.page
  ok((await catOf('PAYPAL')).includes('Transport') && !(await pg.locator('.imp-row:has-text("PAYPAL") .chip-label').textContent()).includes('Unsure'), 'a rule made earlier is used on the next import')
  await s.b.close()

  console.log(results.join('\n')); console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${results.filter(r => r.startsWith('FAIL')).length} failed`)
  process.exit(failed ? 1 : 0)
})().catch(e => { console.log(results.join('\n')); console.error('CRASH', e); process.exit(1) })

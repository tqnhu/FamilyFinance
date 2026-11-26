const { chromium } = require('playwright')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7)
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const cats = [{ id: 'g', name: 'Groceries', emoji: '🛒', budget_cents: 0, archived: false }, { id: 'e', name: 'Eating out', emoji: '🍕', budget_cents: 0, archived: false }, { id: 't', name: 'Transport', emoji: '🚌', budget_cents: 0, archived: false }, { id: 'f', name: 'Fun', emoji: '🎮', budget_cents: 0, archived: false }, { id: 'o', name: 'Other', emoji: '📦', budget_cents: 0, archived: false }]
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
  const st = { expenses: [], ...o }
  await page.route(SB + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), p = u.pathname, m = rq.method()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    const json = (v, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(v) })
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (p.startsWith('/rest/v1/rpc/')) return json(p.endsWith('settle_allowance') ? 0 : [])
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop(), single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (m === 'POST') { log.push({ k: 'POST', tb, body: JSON.parse(rq.postData()) }); return route.fulfill({ status: 201, headers: cors, body: '' }) }
    if (m === 'PATCH' || m === 'DELETE') { log.push({ k: m, tb, q: u.search, body: rq.postData() ? JSON.parse(rq.postData()) : null }); return json([{ id: 'ok' }]) }
    if (tb === 'expenses' && u.searchParams.get('category_id') === 'not.is.null') return json(st.history || [])
    if (tb === 'expenses') {
      let rows = st.expenses; for (const r of u.searchParams.getAll('spent_on')) { const [op, ...v] = r.split('.'); const val = v.join('.'); rows = rows.filter(e => op === 'gte' ? e.spent_on >= val : op === 'lt' ? e.spent_on < val : true) }
      return json([...rows].sort((a, c) => c.spent_on.localeCompare(a.spent_on)))
    }
    const map = { categories: cats, members: [P, KID], bills: [], bill_payments: [], tags: [] }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173' + path); await page.waitForTimeout(1100)
  return { b, page, log, errors, st }
}
const posts = s => s.log.filter(l => l.k === 'POST' && l.tb === 'expenses').flatMap(l => Array.isArray(l.body) ? l.body : [l.body])
const hist = (note, cat, n) => Array.from({ length: n }, () => ({ note, category_id: cat }))
const sheet = pg => pg.locator('.sheet')
const on = pg => pg.locator('.sheet .chip.on')
const openAdd = async pg => { await pg.click('button[aria-label="Add expense"]'); await pg.waitForSelector('.sheet'); await pg.waitForTimeout(500) }
const typeNote = async (pg, t) => { await pg.fill('.sheet label:has-text("Note") input', t); await pg.waitForTimeout(300) }

;(async () => {
  /* ===== adding an expense by hand ===== */
  let s = await open('/'), pg = s.page
  await openAdd(pg)
  ok(await on(pg).count() === 0 && await pg.locator('.suggest').count() === 0, 'nothing is suggested before a note is typed')
  await typeNote(pg, 'Lidl Berlin 1234')
  ok(await on(pg).count() === 1 && (await on(pg).innerText()).includes('Groceries'), 'a known shop pre-selects its category (starter rule)')
  const box = await pg.locator('.suggest').innerText()
  ok(box.toLowerCase().includes('rule') && box.includes('Suggested: Groceries') && box.includes('Starter rule: "lidl" is usually Groceries.') && box.includes('Pick another category'), 'the suggestion says what it is and why: ' + box.replace(/\n/g, ' | '))
  await typeNote(pg, 'Zzz unknown shop')
  ok(await on(pg).count() === 0 && await pg.locator('.suggest').count() === 0, 'when the note no longer matches, the automatic choice is taken back')
  await typeNote(pg, 'Lidl')
  ok((await on(pg).innerText()).includes('Groceries'), 'and comes back when it matches again')
  await pg.locator('.sheet .chip:has-text("Transport")').click()
  ok((await on(pg).innerText()).includes('Transport') && await pg.locator('.suggest:not(.remember)').count() === 0, 'tapping another category wins and hides the suggestion')
  await typeNote(pg, 'Albert Heijn 22')
  ok((await on(pg).innerText()).includes('Transport'), 'once you have chosen, the note never changes your category again')
  await pg.fill('input[inputmode=decimal]', '12'); await pg.click('button.primary:text-is("Save")'); await pg.waitForTimeout(800)
  ok(posts(s).length === 1 && posts(s)[0].category_id === 't' && posts(s)[0].note === 'Albert Heijn 22', 'your choice is what is saved')
  await s.b.close()

  s = await open('/'); pg = s.page
  await openAdd(pg); await typeNote(pg, 'Jumbo'); await pg.fill('input[inputmode=decimal]', '8'); await pg.click('button.primary'); await pg.waitForTimeout(800)
  ok(posts(s).length === 1 && posts(s)[0].category_id === 'g', 'saving with a pre-selected suggestion saves that category')
  await s.b.close()

  /* ===== learning from the family's own expenses ===== */
  s = await open('/', { history: hist('Bakkerij Kramer Utrecht', 'e', 3) }); pg = s.page
  await openAdd(pg); await typeNote(pg, 'Bakkerij Kramer')
  const learned = await pg.locator('.suggest').innerText()
  ok((await on(pg).innerText()).includes('Eating out') && learned.toLowerCase().includes('learned') && learned.includes('3 earlier expenses mentioning') && learned.includes('went to Eating out'), 'three consistent earlier expenses: pre-selected, labelled Learned, with the count: ' + learned.replace(/\n/g, ' | '))
  await s.b.close()

  s = await open('/', { history: hist('Kramer Corner', 'e', 2) }); pg = s.page
  await openAdd(pg); await typeNote(pg, 'Kramer Corner')
  ok(await on(pg).count() === 0, 'only two examples: not pre-selected')
  const maybe = await pg.locator('.suggest').innerText()
  ok(maybe.includes('Maybe Eating out?') && maybe.includes('2 earlier expenses'), 'it is offered instead: ' + maybe.replace(/\n/g, ' | '))
  await pg.locator('.suggest button:has-text("Use Eating out")').click()
  ok((await on(pg).innerText()).includes('Eating out') && await pg.locator('.suggest').count() === 0, 'Use selects it')
  await s.b.close()

  s = await open('/', { history: [...hist('Zeta Corner', 'e', 2), ...hist('Zeta Corner', 'g', 2)] }); pg = s.page
  await openAdd(pg); await typeNote(pg, 'Zeta Corner')
  ok(await on(pg).count() === 0 && await pg.locator('.suggest').count() === 0, 'contradicting history suggests nothing')
  await s.b.close()

  /* ===== children, and editing ===== */
  s = await open('/', { asKid: true }); pg = s.page
  await openAdd(pg); await typeNote(pg, 'Albert Heijn')
  ok(await on(pg).count() === 1 && (await on(pg).innerText()).includes('Groceries'), 'a child gets suggestions too')
  await s.b.close()

  const d = new Date().toLocaleDateString('sv').slice(0, 8) + '01'
  s = await open('/', { expenses: [{ id: 'x1', family_id: 'f1', member_id: 'p1', category_id: 't', amount_cents: 500, note: 'Lidl', spent_on: d, bill_id: null, monthly_fee: false, tag_id: null, annual_fee: false, edited_at: null, edited_by: null, receipt_path: null }] }); pg = s.page
  await pg.locator('[role=button]:has-text("Lidl")').click(); await pg.waitForSelector('.sheet'); await pg.waitForTimeout(400)
  ok((await on(pg).innerText()).includes('Transport') && await pg.locator('.suggest').count() === 0, 'editing never changes the category or shows a suggestion')
  await s.b.close()

  /* ===== bank import ===== */
  const csv = ['Date,Description,Amount', '2026-03-01,Albert Heijn 1042,-23.45', '2026-03-02,Boulangerie Paul,-4.80', '2026-03-03,Bakkerij Kramer,-6.10', '2026-03-04,PAYPAL *4837,-36.90', '2026-03-05,Kinepolis Brussel,-18.00'].join('\n')
  s = await open('/plan?tab=import', { history: hist('Bakkerij Kramer', 'e', 2) }); pg = s.page
  await pg.setInputFiles('input[type=file]', { name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await pg.waitForSelector('.imp-row'); await pg.waitForTimeout(500)
  const catOf = t => pg.locator(`.imp-row:has-text("${t}") select`).evaluate(e => e.options[e.selectedIndex].text)
  const chip = async t => (await pg.locator(`.imp-row:has-text("${t}") .chip-label`).textContent()).trim()
  ok((await catOf('Albert')).includes('Groceries') && await chip('Albert') === 'Rule', 'a known supermarket: Rule')
  ok((await catOf('Boulangerie')).includes('Eating out') && await chip('Boulangerie') === 'Rule', 'a French bakery is known too (European starter list)')
  ok(await chip('Bakkerij') === 'Learned' && (await pg.locator('.imp-row:has-text("Bakkerij") .imp-why').innerText()).includes('2 earlier expenses'), 'the family\'s own history: Learned, with the count')
  ok(await chip('PAYPAL') === 'Unsure' && (await pg.locator('.imp-row:has-text("PAYPAL") .imp-why').innerText()).includes('Nothing matched'), 'an unknown description: Unsure')
  const sum = await pg.locator('p.sorted').innerText()
  ok(sum.includes('3 of 5 sorted automatically') && sum.includes('2 need you'), 'summary: sorted automatically (the two Rules and Kinepolis) and what needs you: ' + sum)
  await pg.getByRole('button', { name: 'Needs you 2' }).click()
  const left = await pg.locator('.imp-row').allInnerTexts()
  ok(left.length === 2 && left.some(t => t.includes('PAYPAL')) && left.some(t => t.includes('Bakkerij')), 'the filter shows only the rows that need you: ' + left.length)
  await pg.locator('.imp-row:has-text("PAYPAL") select').selectOption({ label: '🚌 Transport' })
  ok(await chip('PAYPAL') === 'Your choice', 'a category you pick yourself says so')
  ok((await pg.locator('p.sorted').innerText()).includes('4 of 5'), 'and counts as sorted: ' + await pg.locator('p.sorted').innerText())
  await pg.getByRole('button', { name: 'All 5' }).click()
  ok(await pg.locator('.imp-row').count() === 5, 'All shows every row again')
  await pg.screenshot({ path: `${S}/ui/classify-import.png`, fullPage: true })
  ok(s.errors.length === 0, 'no page errors: ' + s.errors.join(' | '))
  await s.b.close()

  /* ===== a bank file without a header row: the first transaction must not be lost ===== */
  s = await open('/plan?tab=import'); pg = s.page
  await pg.setInputFiles('input[type=file]', { name: 'nohead.csv', mimeType: 'text/csv', buffer: Buffer.from('15-03-2026,Albert Heijn 1042,-23.45\n16-03-2026,Bakkerij Kramer,-4.20\n17-03-2026,Salary,2500.00') }); await pg.waitForSelector('.imp-row'); await pg.waitForTimeout(400)
  const info = await pg.locator('p:has-text("no header row")').innerText()
  ok(info.startsWith('3 rows') && info.includes('the first line is a transaction'), 'the file says it has no header row and counts all lines: ' + info)
  ok(await pg.locator('.imp-row').count() === 2 && await pg.locator('.imp-row:has-text("Albert Heijn 1042")').count() === 1, 'the first debit is among the transactions (2 expenses, the salary skipped)')
  ok((await pg.locator('text=expenses found').innerText()).includes('2 expenses found') && (await pg.locator('text=expenses found').innerText()).includes('1 incoming payments skipped'), 'summary: ' + await pg.locator('text=expenses found').innerText())
  await pg.click('button.primary:has-text("Import 2")'); await pg.waitForTimeout(800)
  ok(posts(s).length === 2 && posts(s).some(r => r.note === 'Albert Heijn 1042' && r.amount_cents === 2345 && r.spent_on === '2026-03-15'), 'both are imported, the first with the right date and amount')
  await s.b.close()

  console.log(results.join('\n')); console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${results.filter(r => r.startsWith('FAIL')).length} failed`)
  process.exit(failed ? 1 : 0)
})().catch(e => { console.log(results.join('\n')); console.error('CRASH', e); process.exit(1) })

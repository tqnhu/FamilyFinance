const { chromium } = require('playwright')
const { withEt, flat } = require('./etshim.cjs')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7)
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const cats = [{ id: 'g', name: 'Groceries', emoji: '🛒', budget_cents: 0, archived: false }, { id: 'f', name: 'Fun', emoji: '🎮', budget_cents: 0, archived: false }, { id: 'o', name: 'Other', emoji: '📦', budget_cents: 0, archived: false }]
const results = []; let failed = false
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) failed = true }
const x = (id, cat, cents, spent_on, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: cat, amount_cents: cents, note: id, spent_on, bill_id: null, monthly_fee: false, tag_id: null, annual_fee: false, edited_at: null, edited_by: null, receipt_path: null, created_at: spent_on + 'T10:00:00Z', ...o })

async function open(path, o = {}) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 1500 } })
  const log = [], errors = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of [45]\d\d|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  page.on('dialog', d => d.accept())
  const sess = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: 'p1', email: 'a@b.c', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now.toISOString() } }
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
    if (tb === 'expenses') {
      let rows = st.expenses; for (const r of u.searchParams.getAll('spent_on')) { const [op, ...v] = r.split('.'); const val = v.join('.'); rows = rows.filter(e => op === 'gte' ? e.spent_on >= val : op === 'lt' ? e.spent_on < val : true) }
      return json(withEt([...rows].sort((a, c) => c.spent_on.localeCompare(a.spent_on))))
    }
    const map = { categories: cats, members: [P], bills: [], bill_payments: [], tags: [] }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173' + path); await page.waitForTimeout(1100)
  return { b, page, log, errors, st }
}
const posts = s => s.log.filter(l => l.k === 'POST' && l.tb === 'expenses').flatMap(l => Array.isArray(l.body) ? l.body : [l.body])
const patches = s => s.log.filter(l => l.k === 'PATCH' && l.tb === 'expenses')
const csv = [
  'Date,Description,Amount',
  '2026-03-01,ANWB annual fee 2026,-49.00',
  '2026-03-02,Albert Heijn Amsterdam,-23.45',
  '2026-03-03,Jaarlijkse bijdrage Sportclub,-120.00',
  '2026-03-04,Dentist,-80.00',
].join('\n')

;(async () => {
  /* ===== bank import ===== */
  let s = await open('/plan?tab=import'), pg = s.page
  await pg.setInputFiles('input[type=file]', { name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await pg.waitForSelector('.imp-row'); await pg.waitForTimeout(500)
  const annualBox = t => pg.locator(`.imp-row:has-text("${t}") label.imp-annual input`)
  ok(await pg.locator('.imp-row').count() === 4, 'four rows to review')
  ok(await annualBox('ANWB').isChecked() && await annualBox('Jaarlijkse').isChecked(), 'descriptions that say annual / jaarlijks are ticked as annual fees to start with')
  ok(!(await annualBox('Albert').isChecked()) && !(await annualBox('Dentist').isChecked()), 'ordinary rows are not')
  ok(await pg.locator('.imp-row:has-text("ANWB") >> text=looks like one').count() === 1 && await pg.locator('.imp-row:has-text("Albert") >> text=looks like one').count() === 0, 'a hint explains why a row was ticked')
  const note = () => pg.locator('[role=status]:has-text("marked as")').innerText().catch(() => '')
  ok((await note()).includes('2 marked as annual fees (€169.00)') && (await note()).includes('kept out of monthly spending'), 'a summary says what will be kept apart: ' + await note())
  await annualBox('Dentist').check()
  ok((await note()).includes('3 marked as annual fees (€249.00)'), 'ticking another row updates the summary: ' + await note())
  await annualBox('Dentist').uncheck(); await annualBox('Jaarlijkse').uncheck()
  ok((await note()).includes('1 marked as an annual fee (€49.00)'), 'singular wording for one: ' + await note())
  ok(await pg.locator('.imp-row:has-text("Jaarlijkse") >> text=looks like one').count() === 0, 'once you choose, the hint goes away (it never overrides you)')
  await annualBox('Jaarlijkse').check()
  await pg.screenshot({ path: `${S}/ui/annual-import.png`, fullPage: true })
  await pg.click('button.primary:has-text("Import 4")'); await pg.waitForTimeout(1000)
  const rows = posts(s)
  const by = n => rows.find(r => r.note.includes(n))
  ok(rows.length === 4, 'four rows imported')
  ok(by('ANWB').annual_fee === true && by('Jaarlijkse').annual_fee === true, 'annual rows are sent with annual_fee = true')
  ok(!('annual_fee' in by('Albert')) && !('annual_fee' in by('Dentist')), 'other rows do not send the field at all (a normal import never depends on it)')
  ok(rows.every(r => !('bill_id' in r) && !('monthly_fee' in r)), 'the protected columns are still never sent')
  await s.b.close()

  // nothing ticked: no summary, nothing extra sent
  s = await open('/plan?tab=import'); pg = s.page
  await pg.setInputFiles('input[type=file]', { name: 'bank.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Description,Amount\n2026-03-02,Albert Heijn,-23.45') }); await pg.waitForSelector('.imp-row'); await pg.waitForTimeout(400)
  ok(await pg.locator('[role=status]:has-text("marked as")').count() === 0, 'no annual fees: no summary line')
  await pg.click('button.primary:has-text("Import 1")'); await pg.waitForTimeout(800)
  ok(posts(s).length === 1 && !('annual_fee' in posts(s)[0]), 'a plain import is exactly as before')
  await s.b.close()

  /* ===== the expense form ===== */
  s = await open('/'); pg = s.page
  await pg.click('button[aria-label="Add expense"]'); await pg.fill('input[inputmode=decimal]', '99'); await pg.click('.chip:has-text("Fun")')
  const box = pg.locator('label.annual-opt input')
  ok(!(await box.isChecked()), 'new expenses start as ordinary spending')
  ok((await pg.locator('label.annual-opt').innerText()).includes('Not counted as monthly spending'), 'the option explains itself')
  await box.check(); await pg.click('button.primary'); await pg.waitForTimeout(900)
  ok(posts(s).length === 1 && posts(s)[0].annual_fee === true && posts(s)[0].amount_cents === 9900, 'saved with annual_fee = true')
  await pg.click('button[aria-label="Add expense"]'); await pg.fill('input[inputmode=decimal]', '5'); await pg.click('.chip:has-text("Fun")'); await pg.click('button.primary'); await pg.waitForTimeout(900)
  ok(posts(s).length === 2 && !('annual_fee' in posts(s)[1]), 'an ordinary expense does not send the field')
  await s.b.close()

  /* ===== editing, and where it shows ===== */
  const d = `${ym(0)}-01`
  s = await open('/', { expenses: [x('club', 'f', 9900, d, { note: 'Sports club', annual_fee: true }), x('milk', 'g', 1000, d, { note: 'milk' })] }); pg = s.page
  ok((await pg.locator('.card .big').first().innerText()) === '€10.00', 'Home counts only the ordinary expense: ' + await pg.locator('.card .big').first().innerText())
  const notCounted = await pg.locator('p:has-text("Not counted")').first().innerText()
  ok(notCounted.includes('€99.00') && notCounted.includes('annual fees'), 'a note says what is kept apart: ' + notCounted)
  ok(await pg.locator('a.catlink:has-text("Fun")').count() === 0, 'the Fun category is not listed (its only spending is the annual fee)')
  const item = pg.locator('[role=button]:has-text("Sports club")')
  ok(await item.count() === 1 && (await item.innerText()).includes('annual fee'), 'the annual fee is still in the list, labelled, so it can be found')
  await item.click(); await pg.waitForSelector('.sheet')
  ok(await pg.locator('label.annual-opt input').isChecked(), 'editing shows it ticked')
  await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(500)
  ok(patches(s).length === 0, 'saving without a change sends nothing')
  await item.click(); await pg.waitForSelector('.sheet'); await pg.locator('label.annual-opt input').uncheck(); await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(700)
  ok(patches(s).length === 1 && JSON.stringify(patches(s)[0].body) === '{"annual_fee":false}' && patches(s)[0].q.includes('id=eq.club'), 'turning it off sends only { annual_fee: false } for that expense: ' + JSON.stringify(patches(s)[0]?.body))
  await pg.locator('[role=button]:has-text("milk")').click(); await pg.waitForSelector('.sheet')
  ok(!(await pg.locator('label.annual-opt input').isChecked()), 'an ordinary expense shows it unticked')
  await pg.locator('label.annual-opt input').check(); await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(700)
  ok(patches(s).length === 2 && JSON.stringify(patches(s)[1].body) === '{"annual_fee":true}', 'marking an existing expense sends only { annual_fee: true }')
  await s.b.close()

  s = await open('/review?category=f&month=' + ym(0), { expenses: [x('club', 'f', 9900, d, { note: 'Sports club', annual_fee: true }), x('cinema', 'f', 1500, d, { note: 'cinema' })] }); pg = s.page
  ok((await pg.locator('.card .big').first().innerText()) === '€15.00', 'the category page counts only the ordinary expense')
  const cn = await pg.locator('.card').first().innerText()
  ok(cn.includes('Not counted: €99.00') && cn.includes('annual fees'), 'and says what is kept apart: ' + cn.replace(/\n/g, ' | '))
  ok(await pg.locator('[role=button]:has-text("Sports club")').count() === 1, 'the annual fee is listed on the category page')
  await s.b.close()

  s = await open('/review', { expenses: [x('club', 'f', 9900, d, { note: 'Sports club', annual_fee: true }), x('cinema', 'f', 1500, d, { note: 'cinema' })] }); pg = s.page
  await pg.waitForSelector('.bd-row')
  ok((await pg.locator('.card .big').first().innerText()) === '€15', 'the Month tab leaves it out of the shares')
  ok((await pg.locator('.bd-apart').first().innerText()).includes('€99') && (await pg.locator('.bd-apart').first().innerText()).includes('annual fees'), 'and reports it as kept apart')
  ok(s.errors.length === 0, 'no page errors: ' + s.errors.join(' | '))
  await s.b.close()

  console.log(results.join('\n')); console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${results.filter(r => r.startsWith('FAIL')).length} failed`)
  process.exit(failed ? 1 : 0)
})().catch(e => { console.log(results.join('\n')); console.error('CRASH', e); process.exit(1) })

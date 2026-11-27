const { chromium } = require('playwright')
const { withEt, flat } = require('./etshim.cjs')
const fs = require('fs')
const S = process.argv[2], FX = `${S}/fx`
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7)
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const cats = [{ id: 'g', name: 'Groceries', emoji: '🛒', budget_cents: 40000, archived: false }, { id: 'f', name: 'Fun', emoji: '🎮', budget_cents: 8000, archived: false },
  { id: 'h', name: 'Home & bills', emoji: '🏠', budget_cents: 0, archived: false }]
const jpegBytes = fs.readFileSync(`${FX}/small.jpg`)
const results = []; let failed = false
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) failed = true }
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function open(path, o = {}) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 1200 } })
  const log = [], errors = [], dialogs = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of [45]\d\d/.test(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(m.text()) })
  page.on('dialog', d => { dialogs.push(d.message()); d.accept() })
  const sess = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: 'p1', email: 'a@b.c', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now.toISOString() } }
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(sess)])
  const st = { expenses: [], history: [], existing: [], pastRows: [], failUpload: false, patchResult: null, insertFailFrom: null, inserts: 0, uploads: [] }
  Object.assign(st, o)
  await page.route(SB + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), p = u.pathname, m = rq.method()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    const json = (x, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(x) })
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (p.startsWith('/storage/v1/')) {
      if (m === 'POST' && p.startsWith('/storage/v1/object/sign/receipts/')) { log.push({ k: 'sign', path: p.replace('/storage/v1/object/sign/receipts/', '') }); return json({ signedURL: p.replace('/storage/v1', '') + '?token=t' }) }
      if (m === 'GET' && p.startsWith('/storage/v1/object/sign/')) return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: cors, body: jpegBytes })
      if (m === 'POST' && p.startsWith('/storage/v1/object/receipts/')) {
        const path = decodeURIComponent(p.replace('/storage/v1/object/receipts/', '')); const buf = rq.postDataBuffer()
        const a = buf.indexOf(Buffer.from([0xff, 0xd8])), z = buf.lastIndexOf(Buffer.from([0xff, 0xd9]))
        const file = `${S}/up-${st.uploads.length}.jpg`; fs.writeFileSync(file, buf.subarray(a, z + 2)); st.uploads.push({ path, file, ctype: (buf.toString('latin1').match(/Content-Type: ([^\r\n]+)/) || [])[1] })
        log.push({ k: 'upload', path })
        return st.failUpload ? json({ message: 'boom', statusCode: '500', error: 'x' }, 500) : json({ Key: 'receipts/' + path, Id: 'i' })
      }
      if (m === 'DELETE' && p === '/storage/v1/object/receipts') { log.push({ k: 'storage-delete', prefixes: JSON.parse(rq.postData()).prefixes }); return json([]) }
      return json({})
    }
    if (p.startsWith('/rest/v1/rpc/')) return json(p.endsWith('settle_allowance') ? 0 : [])
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop(), q = u.search
    if (m === 'POST') {
      const body = JSON.parse(rq.postData()); log.push({ k: 'POST', tb, body }); st.inserts++
      if (st.insertFailFrom !== null && st.inserts >= st.insertFailFrom) return json({ message: 'insert failed', code: 'XX' }, 500)
      return route.fulfill({ status: 201, headers: cors, body: '' })
    }
    if (m === 'PATCH' || m === 'DELETE') { log.push({ k: m, tb, q, body: rq.postData() ? JSON.parse(rq.postData()) : null }); return json(st.patchResult ?? [{ id: 'ok' }]) }
    if (tb === 'expenses') {
      log.push({ k: 'GET', tb, q })
      if (q.includes('import_batch=not.is.null')) return json(st.pastRows)
      if (q.includes('category_id=not.is.null')) return json(st.history)
      if (q.includes('spent_on=gte') && q.includes('spent_on=lte')) return json(st.existing)
      const rng = u.searchParams.getAll('spent_on'); let rows = st.expenses
      for (const r of rng) { const [op, v] = [r.split('.')[0], r.split('.').slice(1).join('.')]; rows = rows.filter(x => op === 'gte' ? x.spent_on >= v : op === 'lt' ? x.spent_on < v : op === 'lte' ? x.spent_on <= v : true) }
      return json(withEt(rows))
    }
    const map = { categories: cats, members: [P], bills: st.bills || [], bill_payments: st.payments || [] }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    const single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object'); return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173' + path); await page.waitForTimeout(1100)
  return { b, page, log, errors, dialogs, st }
}
const exp = (id, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: 'g', amount_cents: 1250, note: 'weekly shop', spent_on: `${ym(0)}-03`, bill_id: null, edited_at: null, edited_by: null, receipt_path: null, ...o })
const py = (f, xy = '5,5') => require('child_process').execSync('python3 -c "from PIL import Image; im=Image.open(\'' + f + '\'); print(im.format, im.size[0], im.size[1], im.getpixel((' + xy + ')))"').toString().trim()


const mk = (id, cat, cents, note, day, extra = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: cat, amount_cents: cents, note, spent_on: `${ym(day[0])}-${day[1]}`, bill_id: null, monthly_fee: false, edited_at: null, edited_by: null, receipt_path: null, ...extra })
const bills = [
  { id: 'b1', name: 'Streaming', category_id: 'f', amount_cents: 1299, times_per_year: 12, due_month: 1, due_day: 5, archived: false, created_at: '2025-01-02T00:00:00Z' },
  { id: 'b2', name: 'Car insurance', category_id: 'h', amount_cents: 62000, times_per_year: 1, due_month: 3, due_day: 15, archived: false, created_at: '2025-01-02T00:00:00Z' },
]
const expenses = [
  mk('x1', 'g', 5000, 'weekly shop', [0, '03']),
  mk('x2', 'f', 1299, 'Streaming', [0, '02'], { bill_id: 'b1', monthly_fee: true }),
  mk('x3', 'h', 60500, 'Car insurance', [0, '01'], { bill_id: 'b2', monthly_fee: false }),
  mk('y1', 'g', 4000, 'last month shop', [-1, '03']),
  mk('y2', 'f', 1299, 'Streaming', [-1, '02'], { bill_id: 'b1', monthly_fee: true }),
]
;(async () => {
  let s = await open('/', { expenses, bills }), pg = s.page
  const big = await pg.locator('.leftcard').innerText()
  ok(big.includes('€62.99 spent'), 'Home spending counts groceries + the monthly fee, not the yearly insurance: ' + big.replace(/\n/g, ' '))
  const cat = await pg.locator('section:has(h2:text-is("By category"))').innerText()
  ok(cat.includes('Fun') && cat.includes('€12.99'), 'the monthly fee shows in its own category (Fun)')
  ok(!cat.includes('Home & bills') && !cat.includes('605'), 'the yearly insurance does not appear in the category bars')
  ok((await pg.locator('text=Not counted').innerText()).includes('€605.00'), 'the note names only the yearly bill: ' + (await pg.locator('text=Not counted').innerText()))
  const feeRow = pg.locator('.card:has(h2:text-is("Recent")) .row.item:has-text("Streaming")')
  ok(await feeRow.count() === 1 && await feeRow.locator('text=monthly bill').count() === 1, 'the monthly fee is listed with a "monthly bill" tag')
  ok(await feeRow.getAttribute('role') === null, 'and is not tappable (bill payments are changed on the Plan page)')
  ok(await pg.locator('.card:has(h2:text-is("Recent")) .row.item:has-text("Car insurance")').count() === 0, 'the yearly bill payment is not in the everyday list')
  ok(await pg.locator('[role=button]:has-text("weekly shop")').count() === 1, 'ordinary expenses are still tappable')
  ok(s.errors.length === 0, 'no errors on Home ' + s.errors.join('|'))
  await s.b.close()

  s = await open('/review', { expenses, bills }); pg = s.page
  const txt = await pg.locator('main').innerText()
  ok(txt.includes('€62.99'), 'the Month tab total includes the monthly fee (€62.99)')
  ok(/▲ €10 more than \w+ so far/.test(txt), 'compared with last month on the same basis (€52.99 -> €62.99, €10 more)')
  ok(!(await pg.locator('.card .big').first().innerText()).includes('605') && !(await pg.locator('.bd-nums b').allInnerTexts()).some(t => t.includes('605')) && txt.includes('kept apart'), 'the yearly insurance is not in the month total or its categories, only in the "kept apart" note')
  ok(txt.includes('Monthly fees count as everyday spending'), 'the page says monthly fees are counted')
  await pg.screenshot({ path: `${S}/ui/mf-review.png`, fullPage: true })
  await pg.click('button[role=tab]:text-is("Year")'); await pg.waitForTimeout(600)
  ok((await pg.locator('main').innerText()).includes('Monthly fees (like a subscription) are counted as Everyday'), 'the Year view explains the same rule')
  await s.b.close()

  s = await open('/plan', { expenses, bills }); pg = s.page
  const plan = await pg.locator('.card:has(h2:text-is("Your plan"))').innerText()
  ok(plan.includes('€400.00') || plan.includes('480.00'), 'plan shows the everyday budgets (400 + 80 = €480.00): ' + plan.replace(/\n/g, ' | ').slice(0, 160))
  ok(plan.includes('€51.67 / month') && !plan.includes('€64.66') , 'only the yearly bill is put aside (620 / 12 = €51.67), the monthly fee is not counted twice')
  ok(plan.includes('€531.67 / month'), 'total to plan for = 480 + 51.67 = €531.67 a month')
  await pg.click('button[role=tab]:text-is("Bills")'); await pg.waitForTimeout(500)
  const bt = await pg.locator('main').innerText()
  ok(bt.includes('counts in your monthly budget'), 'the monthly bill card says it counts in the monthly budget')
  ok(bt.includes('€52 a month to put aside') || bt.includes('€51.67 a month to put aside'), 'the yearly bill still shows what to put aside')
  ok(/Put aside monthly\s*€52/.test(bt), 'the "Put aside monthly" tile excludes the monthly fee: ' + (bt.match(/Put aside monthly\s*€\d+/) || [''])[0].replace(/\n/g, ' '))
  ok(s.errors.length === 0, 'no errors on Plan ' + s.errors.join('|'))
  await s.b.close()
  console.log(results.join('\n')); process.exit(failed ? 1 : 0)
})()

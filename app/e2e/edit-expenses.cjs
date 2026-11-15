const { chromium } = require('playwright')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = (o) => { const d = new Date(now.getFullYear(), now.getMonth() + o, 1); return d.toLocaleDateString('sv').slice(0, 7) }
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const K = { user_id: 'k1', family_id: 'f1', display_name: 'Mia', role: 'child', username: 'mia' }
const cats = [
  { id: 'a', name: 'Eating out', emoji: '🍕', budget_cents: 10000, archived: false }, { id: 'b', name: 'Groceries', emoji: '🛒', budget_cents: 40000, archived: false },
  { id: 'z', name: 'Old hobby', emoji: '🎨', budget_cents: 0, archived: true },
]
const mkExp = (id, who, cat, cents, note, day, extra = {}) => ({ id, member_id: who, category_id: cat, amount_cents: cents, note, spent_on: `${ym(0)}-${day}`, bill_id: null, edited_at: null, edited_by: null, ...extra })
const results = []
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) process.exitCode = 1 }

async function session(user, setup) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 1100 } })
  const reqs = [], errors = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push(m.text()) })
  const sess = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: user.user_id, email: 'a@b.c', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now.toISOString() } }
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(sess)])
  const state = { expenses: setup.expenses, patchResult: null }
  await page.route(SB + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), p = u.pathname, m = rq.method()
    const json = (x, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(x) })
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (p.startsWith('/rest/v1/rpc/')) return json(p.endsWith('settle_allowance') ? 0 : [])
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop()
    if (m === 'PATCH' || m === 'DELETE') { reqs.push({ m, tb, url: u.search, body: rq.postData() ? JSON.parse(rq.postData()) : null }); return json(state.patchResult ?? [{ id: 'ok' }]) }
    if (tb === 'expenses') { reqs.push({ m, tb, url: u.search }); return json(state.expenses) }
    const map = { categories: cats, members: [P, K], bills: [], bill_payments: [] }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    const single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object'); return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173/'); await page.waitForTimeout(1200)
  return { b, page, reqs, errors, state }
}

;(async () => {
  const exps = [
    mkExp('e1', 'p1', 'b', 12050, 'weekly shop', '03'),
    mkExp('e2', 'k1', 'a', 800, 'ice cream', '02', { edited_at: now.toISOString(), edited_by: 'p1' }),
    mkExp('e3', 'p1', 'z', 2500, 'paint', '01'),
  ]
  // ---- parent
  let s = await session(P, { expenses: exps }); const { page } = s
  ok(await page.locator('text=edited by Mum').count() === 1, 'an edited expense is tagged "edited by Mum"')
  await page.locator('[role=button]:has-text("weekly shop")').click()
  ok(await page.locator('h2:text-is("Edit expense")').isVisible(), 'tapping an expense opens the edit sheet')
  ok(await page.locator('input[inputmode=decimal]').inputValue() === '120.50', 'amount is prefilled (120.50)')
  ok(await page.locator('.chip.on:has-text("Groceries")').count() === 1, 'its category is selected')
  ok((await page.locator('.sheet').innerText()).includes('Logged by Mum'), 'sheet says who logged it')
  // no change -> nothing sent
  await page.click('button:text-is("Save changes")'); await page.waitForTimeout(500)
  ok(s.reqs.filter(r => r.m === 'PATCH').length === 0, 'saving without changes sends nothing')
  ok(await page.locator('h2:text-is("Edit expense")').count() === 0, '...and just closes the sheet')
  // fix a typo: 120.50 -> 12.05
  await page.locator('[role=button]:has-text("weekly shop")').click()
  await page.fill('input[inputmode=decimal]', '12,05'); await page.click('button:text-is("Save changes")'); await page.waitForTimeout(600)
  const patch = s.reqs.filter(r => r.m === 'PATCH')
  ok(patch.length === 1 && patch[0].url.startsWith('?id=eq.e1&') && JSON.stringify(patch[0].body) === '{"amount_cents":1205}', `typo fix sends only the amount for that expense (${JSON.stringify(patch[0]?.body)} ${patch[0]?.url})`)
  ok(s.reqs.filter(r => r.m === 'GET' && r.tb === 'expenses').length >= 2, 'the list reloads after saving')
  // change category + note + date
  await page.locator('[role=button]:has-text("weekly shop")').click()
  await page.click('.chip:has-text("Eating out")'); await page.fill('input:not([inputmode]):not([type=date])', 'pizza night'); await page.fill('input[type=date]', `${ym(0)}-02`)
  await page.click('button:text-is("Save changes")'); await page.waitForTimeout(600)
  const p2 = s.reqs.filter(r => r.m === 'PATCH')[1]
  ok(p2 && p2.body.category_id === 'a' && p2.body.note === 'pizza night' && p2.body.spent_on === `${ym(0)}-02` && !('amount_cents' in p2.body), 'category, note and date changes are sent together')
  // an archived category still shows in the editor of an expense that uses it
  await page.locator('[role=button]:has-text("paint")').click()
  ok(await page.locator('.chip.on:has-text("Old hobby")').count() === 1, 'an archived category stays selectable on the expense that uses it')
  ok(await page.locator('.chip:has-text("Old hobby")').count() === 1 && await page.locator('.chip:has-text("Groceries")').count() === 1, 'and the active ones are offered too')
  await page.click('.sheet button:text-is("Cancel")')
  // the database ignoring an edit (no rows matched) must be reported, not silently accepted
  s.state.patchResult = []
  await page.locator('[role=button]:has-text("ice cream")').click(); await page.fill('input[inputmode=decimal]', '9'); await page.click('button:text-is("Save changes")'); await page.waitForTimeout(500)
  ok((await page.locator('.sheet .error').innerText()).includes('could not be changed'), 'an edit the database ignored shows an error instead of looking saved')
  ok(await page.locator('h2:text-is("Edit expense")').isVisible(), '...and the sheet stays open')
  await page.screenshot({ path: `${S}/ui/edit-error.png` })
  // validation
  await page.fill('input[inputmode=decimal]', '0'); await page.click('button:text-is("Save changes")')
  ok((await page.locator('.sheet .error').innerText()).includes('greater than 0'), 'a zero amount is refused in the form')
  await page.click('.sheet button:text-is("Cancel")')
  s.state.patchResult = null
  // delete
  page.once('dialog', d => d.accept())
  await page.locator('[role=button]:has-text("ice cream")').click(); await page.click('button:has-text("Delete this expense")'); await page.waitForTimeout(500)
  const del = s.reqs.filter(r => r.m === 'DELETE')
  ok(del.length === 1 && del[0].url.startsWith('?id=eq.e2&'), 'delete removes exactly that expense (after confirmation)')
  // declining the confirmation deletes nothing
  page.once('dialog', d => d.dismiss())
  await page.locator('[role=button]:has-text("paint")').click(); await page.click('button:has-text("Delete this expense")'); await page.waitForTimeout(300)
  ok(s.reqs.filter(r => r.m === 'DELETE').length === 1, 'cancelling the confirmation deletes nothing')
  await page.click('.sheet button:text-is("Cancel")')
  // keyboard access
  await page.locator('[role=button]:has-text("weekly shop")').focus(); await page.keyboard.press('Enter')
  ok(await page.locator('h2:text-is("Edit expense")').isVisible(), 'an expense can be opened with the keyboard (Enter)')
  await page.click('.sheet button:text-is("Cancel")')
  // month switcher
  const before = s.reqs.length
  await page.click('button[aria-label="Previous month"]'); await page.waitForTimeout(600)
  const get = s.reqs.slice(before).find(r => r.m === 'GET' && r.tb === 'expenses')
  ok(get && get.url.includes(`spent_on=gte.${ym(-1)}-01`) && get.url.includes(`spent_on=lt.${ym(0)}-01`), `‹ loads last month (${get?.url})`)
  ok(await page.locator('button[aria-label="Next month"]').isEnabled(), 'can step forward again')
  await page.click('button[aria-label="Next month"]'); await page.waitForTimeout(400)
  ok(await page.locator('button[aria-label="Next month"]').isDisabled(), 'cannot go past the current month')
  ok(s.errors.length === 0, 'no console or page errors (parent)' + (s.errors.length ? ' ' + s.errors.join('|') : ''))
  await s.b.close()

  // ---- child: sees and edits only own (the database returns only their rows)
  s = await session(K, { expenses: [exps[1]] })
  await s.page.locator('[role=button]:has-text("ice cream")').click()
  ok((await s.page.locator('.sheet').innerText()).includes('edited by Mum'), 'a child sees when a parent changed their expense')
  await s.page.screenshot({ path: `${S}/ui/edit-kid.png` })
  ok(s.errors.length === 0, 'no errors (child)' + (s.errors.length ? ' ' + s.errors.join('|') : ''))
  await s.b.close()
  console.log(results.join('\n'))
})()

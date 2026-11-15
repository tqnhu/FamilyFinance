const { chromium } = require('playwright')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const NEW = { user_id: 'u9', family_id: 'f1', display_name: 'Hau', role: 'child', username: 'hau9' }
const results = []; let failed = false
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) failed = true }

async function open(answers) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 } })
  const calls = [], errors = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message))
  const sess = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: 'u9', email: 'phanvanhau1207@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(sess)])
  const st = { member: null }
  await page.route(SB + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), p = u.pathname
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    const json = (x, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(x) })
    if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (p.startsWith('/rest/v1/rpc/')) {
      const n = p.split('/').pop(); const body = rq.postData() ? JSON.parse(rq.postData()) : {}; calls.push({ n, body })
      if (n === 'join_family') { const a = answers.join; if (a && a.error) return json({ message: a.error, code: 'P0001' }, 400); if (a === 'parent' || a === 'child') st.member = NEW; return json(a) }
      if (n === 'create_family') { st.member = { ...NEW, role: 'parent' }; return json('fam-1') }
      return json(p.endsWith('settle_allowance') ? 0 : [])
    }
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop(); const single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (tb === 'members') return json(single ? st.member : (st.member ? [st.member] : []))
    return json(single ? null : [])
  })
  await page.goto('http://localhost:5173/'); await page.waitForSelector('h1:text-is("Welcome 👋")')
  return { b, page, calls, errors, st }
}
const msgOf = async page => (await page.locator('[role=alert]').innerText().catch(() => ''))

;(async () => {
  let s = await open({ join: 'invalid_code' }), pg = s.page
  const code = pg.locator('input[placeholder="12 letters and numbers"]')
  ok(await code.getAttribute('autocapitalize') === 'none' && await code.getAttribute('autocorrect') === 'off' && await code.getAttribute('spellcheck') === 'false', 'the code box turns off auto-capitalise, autocorrect and spellcheck (phones)')
  ok((await pg.locator('h2').allInnerTexts()).join('|').startsWith('Join your family'), 'joining comes first on the page')
  // no name yet
  await code.fill('6d105e94bee5'); await pg.click('button:text-is("Join family")')
  ok((await msgOf(pg)).includes('type your name') && s.calls.filter(c => c.n === 'join_family').length === 0, 'with no name: a clear message, and nothing is sent')
  ok(await pg.evaluate(() => document.activeElement && document.activeElement.autocomplete === 'given-name'), 'and the name box is focused')
  // no code
  await pg.fill('input[autocomplete=given-name]', 'Hau'); await code.fill(''); await pg.click('button:text-is("Join family")')
  ok((await msgOf(pg)).includes('invite code'), 'with no code: a clear message')
  // wrong code
  await code.fill('ZZZZ'); await pg.click('button:text-is("Join family")'); await pg.waitForTimeout(400)
  ok((await msgOf(pg)).includes('12 letters and numbers'), 'wrong code: says what a code looks like')
  // the code is sent exactly as typed (the server tolerates case and spaces), with the name
  await code.fill(' 6D105E94BEE5 '); await pg.click('button:text-is("Join family")'); await pg.waitForTimeout(400)
  const j = s.calls.filter(c => c.n === 'join_family').pop()
  ok(j.body.code === ' 6D105E94BEE5 ' && j.body.my_name === 'Hau', 'the code is passed on as typed (server does the cleaning) along with the name')
  ok(s.errors.length === 0, 'no page errors ' + s.errors.join('|'))
  await s.b.close()

  s = await open({ join: 'parent' }); pg = s.page
  await pg.fill('input[autocomplete=given-name]', 'Hau'); await pg.fill('input[placeholder="12 letters and numbers"]', '6d105e94bee5'); await pg.click('button:text-is("Join family")')
  await pg.waitForSelector('nav.tabs', { timeout: 8000 })
  ok(await pg.locator('h1:text-is("Welcome 👋")').count() === 0 && await pg.locator('nav.tabs').isVisible(), 'a successful join goes straight into the app')
  await s.b.close()

  for (const [ans, expect, label] of [['too_many_attempts', 'hour', 'locked out: says to wait about an hour'], ['already_member', 'information in it', 'already in a family with data: explains why it cannot be moved'], ['name_required', 'type your name', 'a name problem reported by the server'], [{ error: 'already in a family' }, 'information in it', 'an older database that raises the error still gets a friendly message']]) {
    s = await open({ join: ans }); pg = s.page
    await pg.fill('input[autocomplete=given-name]', 'Hau'); await pg.fill('input[placeholder="12 letters and numbers"]', '6d105e94bee5'); await pg.click('button:text-is("Join family")'); await pg.waitForTimeout(400)
    const m = await msgOf(pg); ok(m.includes(expect) && !m.includes('_') && !/already in a family$/.test(m), `${label}: "${m.slice(0, 60)}..."`)
    await s.b.close()
  }

  s = await open({}); pg = s.page
  await pg.fill('input[required]', 'Smith'); await pg.click('button:has-text("Create family")')
  ok((await msgOf(pg)).includes('type your name') && s.calls.filter(c => c.n === 'create_family').length === 0, 'creating a family also asks for the name first')
  await pg.fill('input[autocomplete=given-name]', '  Linh  '); await pg.click('button:has-text("Create family")'); await pg.waitForSelector('nav.tabs', { timeout: 8000 })
  ok(s.calls.find(c => c.n === 'create_family').body.my_name === 'Linh', 'creating a family sends the trimmed name')
  await s.b.close()

  s = await open({ join: 'invalid_code' }); pg = s.page
  await pg.screenshot({ path: `${S}/ui/join.png`, fullPage: true }); await s.b.close()
  console.log(results.join('\n')); process.exit(failed ? 1 : 0)
})()

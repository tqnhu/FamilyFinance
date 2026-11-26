const { chromium } = require('playwright')
const S = process.argv[2]
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const ORIGIN = 'http://localhost:5173'
const results = []; let failed = false
const ok = (c, m) => { results.push((c ? 'PASS' : 'FAIL') + ': ' + m); if (!c) failed = true }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const USER = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'alex@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const people = () => [
  { user_id: 'u1', family_id: 'f1', display_name: 'Alex', role: 'parent', username: 'alex', created_at: '2026-02-10T09:00:00Z' },
  { user_id: 'u2', family_id: 'f1', display_name: 'Bo', role: 'parent', username: 'bo', created_at: '2026-02-12T09:00:00Z' },
  { user_id: 'u3', family_id: 'f1', display_name: 'Mia', role: 'child', username: 'mia', created_at: '2026-03-01T09:00:00Z' },
]

async function open(path, o = {}) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN })
  const log = [], errors = [], dialogs = []; const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of [45]\d\d|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  page.on('dialog', async d => { dialogs.push({ type: d.type(), msg: d.message() }); if (o.declineConfirm) await d.dismiss(); else await d.accept() })
  const st = { people: people(), family: { id: 'f1', name: 'The Smiths' }, codes: { parent_code: 'aaaaaaaaaaaa', kid_code: 'bbbbbbbbbbbb' }, me: o.asKid ? 'u3' : 'u1', recoverStatus: 200, putError: false, emailFor: { alex: 'alex@example.test' }, rpcAnswer: {}, ...o }
  if (!o.signedOut && !o.hash) {
    const sess = { access_token: jwt(), refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { ...USER, id: st.me, email: o.asKid ? 'mia@example.test' : USER.email } }
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(sess)])
  }
  await page.route(SB + '/**', async route => {
    const rq = route.request(), u = new URL(rq.url()), p = u.pathname, m = rq.method()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    const json = (x, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(x) })
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (p.startsWith('/auth/v1/')) {
      const ep = p.replace('/auth/v1/', '')
      if (ep === 'recover') { log.push({ k: 'recover', body: JSON.parse(rq.postData() || '{}'), q: u.search }); return st.recoverStatus === 429 ? json({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 59 seconds.' }, 429) : st.recoverStatus === 500 ? json({ code: 500, msg: 'boom' }, 500) : json({}) }
      if (ep === 'user' && m === 'GET') return json({ ...USER, id: st.me })
      if (ep === 'user' && m === 'PUT') { log.push({ k: 'updateUser', body: JSON.parse(rq.postData() || '{}') }); return st.putError ? json({ code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' }, 422) : json({ ...USER, id: st.me }) }
      if (ep === 'logout') { log.push({ k: 'logout', q: u.search }); return route.fulfill({ status: 204, headers: cors }) }
      return json({})
    }
    if (p.startsWith('/rest/v1/rpc/')) {
      const n = p.split('/').pop(), body = rq.postData() ? JSON.parse(rq.postData()) : {}; log.push({ k: 'rpc', n, body })
      const me = st.people.find(x => x.user_id === st.me)
      if (n in st.rpcAnswer) return json(st.rpcAnswer[n])
      if (n === 'email_for_username') return json(st.emailFor[body.u] ?? null)
      if (n === 'set_my_name') { me.display_name = body.n.trim(); return json('ok') }
      if (n === 'set_username') { me.username = body.u.trim().toLowerCase(); return json('ok') }
      if (n === 'rename_family') { st.family.name = body.n.trim(); return json('ok') }
      if (n === 'family_codes') return json([st.codes])
      if (n === 'rotate_invite_codes') { st.codes = { parent_code: 'cccccccccccc', kid_code: 'dddddddddddd' }; return json([st.codes]) }
      return json(n === 'settle_allowance' ? 0 : [])
    }
    if (!p.startsWith('/rest/v1/')) return json({})
    const tb = p.split('/').pop(); const single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (tb === 'members') { const uid = u.searchParams.get('user_id'); const rows = uid ? st.people.filter(x => 'eq.' + x.user_id === uid) : (o.asKid ? st.people : st.people); return json(single ? (rows[0] ?? null) : rows) }
    if (tb === 'families') return json(single ? st.family : [st.family])
    return json(single ? null : [])
  })
  await page.goto(ORIGIN + path + (o.hash || '')); await page.waitForTimeout(1200)
  return { b, page, log, errors, dialogs, st }
}
const calls = (s, k) => s.log.filter(l => l.k === k)
const rpcs = (s, n) => s.log.filter(l => l.k === 'rpc' && l.n === n)
const text = pg => pg.locator('main').innerText()

;(async () => {
  /* ===== forgot password ===== */
  let s = await open('/', { signedOut: true }), pg = s.page
  ok(await pg.locator('button:text-is("Forgot your password?")').count() === 1, 'the sign-in screen offers "Forgot your password?"')
  const pwIn = pg.locator('input[type=password]')
  ok(await pwIn.getAttribute('minlength') === null, 'sign-in does not impose a minimum length (existing passwords still work)')
  await pg.click('button:text-is("New here? Create an account")')
  ok(await pwIn.getAttribute('minlength') === '8' && (await text(pg)).includes('At least 8 characters') && await pg.locator('button:text-is("Forgot your password?")').count() === 0, 'creating an account asks for 8+ characters and has no forgot link')
  await pg.click('button:text-is("Have an account? Sign in")'); await pg.click('button:text-is("Forgot your password?")')
  ok(await pg.locator('h1:text-is("Forgot your password?")').isVisible(), 'the forgot screen opens')
  await pg.fill('input[autocomplete=username]', '   '); await pg.click('button:text-is("Send reset link")'); await pg.waitForTimeout(300)
  ok((await pg.locator('[role=alert]').innerText()).includes('email or username') && calls(s, 'recover').length === 0, 'blank input gets a message and sends nothing')
  await pg.fill('input[autocomplete=username]', 'Someone@Example.test'); await pg.click('button:text-is("Send reset link")'); await pg.waitForTimeout(600)
  const rc = calls(s, 'recover')[0]
  ok(rc && rc.body.email === 'Someone@Example.test' && new URL(ORIGIN + '/x' + rc.q).searchParams.get('redirect_to') === ORIGIN, 'an email address asks Supabase for a reset link that returns to this app')
  const sentText = await text(pg)
  ok(sentText.includes('If an account exists for that email') && sentText.includes('spam'), 'the confirmation never says whether the account exists')
  await pg.click('button:text-is("Back to sign in")'); ok(await pg.locator('h1:text-is("💶 FamilyFinance")').count() === 1, 'Back to sign in works')
  await s.b.close()

  s = await open('/', { signedOut: true }); pg = s.page
  await pg.click('button:text-is("Forgot your password?")'); await pg.fill('input[autocomplete=username]', 'alex'); await pg.click('button:text-is("Send reset link")'); await pg.waitForTimeout(600)
  ok(rpcs(s, 'email_for_username')[0]?.body.u === 'alex' && calls(s, 'recover')[0]?.body.email === 'alex@example.test', 'a username is turned into the account\'s email first')
  const known = await text(pg); await s.b.close()
  s = await open('/', { signedOut: true }); pg = s.page
  await pg.click('button:text-is("Forgot your password?")'); await pg.fill('input[autocomplete=username]', 'nobody_here'); await pg.click('button:text-is("Send reset link")'); await pg.waitForTimeout(600)
  ok(calls(s, 'recover').length === 0 && (await text(pg)) === known, 'an unknown username sends nothing but shows exactly the same screen (nothing to find out)')
  await s.b.close()
  s = await open('/', { signedOut: true, recoverStatus: 429 }); pg = s.page
  await pg.click('button:text-is("Forgot your password?")'); await pg.fill('input[autocomplete=username]', 'a@b.test'); await pg.click('button:text-is("Send reset link")'); await pg.waitForTimeout(600)
  ok((await pg.locator('[role=alert]').innerText()).includes('wait a minute') && await pg.locator('button:text-is("Send reset link")').count() === 1, 'asking again too soon says to wait, and stays on the form')
  await s.b.close()
  s = await open('/', { signedOut: true, recoverStatus: 500 }); pg = s.page
  await pg.click('button:text-is("Forgot your password?")'); await pg.fill('input[autocomplete=username]', 'a@b.test'); await pg.click('button:text-is("Send reset link")'); await pg.waitForTimeout(600)
  ok((await pg.locator('[role=alert]').innerText()).includes('could not be sent'), 'a server problem is reported plainly')
  await s.b.close()

  /* ===== arriving from the email link ===== */
  const hash = `#access_token=${jwt()}&expires_in=3600&refresh_token=rr&token_type=bearer&type=recovery`
  s = await open('/', { hash }); pg = s.page
  ok(await pg.locator('h1:text-is("Choose a new password")').count() === 1 && await pg.locator('nav.tabs').count() === 0, 'following the emailed link shows "Choose a new password", not the app')
  await pg.fill('input[autocomplete=new-password] >> nth=0', 'short'); await pg.fill('input[autocomplete=new-password] >> nth=1', 'short'); await pg.click('button:text-is("Save new password")')
  ok((await pg.locator('[role=alert]').innerText()).includes('at least 8') && calls(s, 'updateUser').length === 0, 'a short password is refused before anything is sent')
  await pg.fill('input[autocomplete=new-password] >> nth=0', 'longenough1'); await pg.fill('input[autocomplete=new-password] >> nth=1', 'different12'); await pg.click('button:text-is("Save new password")')
  ok((await pg.locator('[role=alert]').innerText()).includes('do not match') && calls(s, 'updateUser').length === 0, 'two different passwords are refused')
  await pg.fill('input[autocomplete=new-password] >> nth=1', 'longenough1'); await pg.click('button:text-is("Save new password")'); await pg.waitForTimeout(700)
  ok(calls(s, 'updateUser')[0]?.body.password === 'longenough1' && await pg.locator('h1:has-text("Password changed")').count() === 1, 'a good password is saved and confirmed')
  await pg.screenshot({ path: `${S}/ui/acc-reset-done.png` })
  await pg.click('button:text-is("Continue")'); await pg.waitForSelector('nav.tabs')
  ok(await pg.locator('.usermenu-btn').count() === 1, 'Continue goes into the app (already signed in)')
  ok(!(pg.url().includes('access_token')), 'and the secret token is gone from the address bar')
  ok(s.errors.length === 0, 'no errors in the reset flow ' + s.errors.join('|'))
  await s.b.close()
  s = await open('/', { hash, putError: true }); pg = s.page
  await pg.fill('input[autocomplete=new-password] >> nth=0', 'longenough1'); await pg.fill('input[autocomplete=new-password] >> nth=1', 'longenough1'); await pg.click('button:text-is("Save new password")'); await pg.waitForTimeout(600)
  ok((await pg.locator('[role=alert]').innerText()).includes('should be different') && await pg.locator('h1:text-is("Choose a new password")').count() === 1, 'a refusal from the server (same password) is shown, and the form stays')
  await pg.click('button:text-is("Cancel")'); await pg.waitForTimeout(700)
  ok(calls(s, 'logout').length === 1 && await pg.locator('h1:text-is("💶 FamilyFinance")').count() === 1, 'Cancel signs out and returns to sign-in')
  await s.b.close()

  /* ===== the account menu ===== */
  s = await open('/'); pg = s.page
  const btn = pg.locator('.usermenu-btn')
  ok((await btn.innerText()).includes('Alex') && await btn.getAttribute('aria-haspopup') === 'menu' && await btn.getAttribute('aria-expanded') === 'false', 'the name at the top left is a menu button')
  ok((await pg.locator('header').innerText()).includes('The Smiths') && await pg.locator('header button:text-is("Sign out")').count() === 0, 'the family name sits on the right, and there is no loose Sign out button any more')
  await btn.click()
  ok(await btn.getAttribute('aria-expanded') === 'true' && await pg.locator('[role=menuitem]').count() === 3, 'clicking opens a menu with 3 items')
  const head = await pg.locator('.menu-head').innerText()
  ok(head.includes('Alex') && head.includes('Parent') && head.includes('The Smiths'), 'the menu says who and which family: ' + head.replace(/\n/g, ' · '))
  ok(await pg.evaluate(() => document.activeElement && document.activeElement.textContent.includes('My profile')), 'keyboard focus lands on the first item')
  await pg.keyboard.press('ArrowDown'); ok(await pg.evaluate(() => document.activeElement.textContent.includes('Family settings')), 'arrow keys move between items')
  await pg.keyboard.press('End'); ok(await pg.evaluate(() => document.activeElement.textContent.includes('Sign out')), 'End goes to the last item')
  await pg.keyboard.press('ArrowDown'); ok(await pg.evaluate(() => document.activeElement.textContent.includes('My profile')), 'and it wraps around')
  await pg.keyboard.press('Escape'); ok(await pg.locator('.menu').count() === 0 && await pg.evaluate(() => document.activeElement.classList.contains('usermenu-btn')), 'Escape closes it and returns focus to the button')
  await btn.click(); await pg.mouse.click(300, 700); ok(await pg.locator('.menu').count() === 0, 'clicking elsewhere closes it')
  await btn.click(); await pg.screenshot({ path: `${S}/ui/acc-menu.png` })
  await pg.click('[role=menuitem]:has-text("Family settings")'); await pg.waitForSelector('h1:text-is("Settings")')
  ok(new URL(pg.url()).pathname === '/settings' && new URL(pg.url()).searchParams.get('tab') === 'family' && await pg.locator('.menu').count() === 0, '"Family settings" opens the family tab and closes the menu')
  await btn.click(); await pg.click('[role=menuitem]:has-text("My profile")'); await pg.waitForTimeout(400)
  ok(new URL(pg.url()).searchParams.get('tab') === 'profile' && await pg.locator('[role=tab][aria-selected=true]:text-is("My profile")').count() === 1, '"My profile" opens the profile tab')
  await btn.click(); await pg.click('[role=menuitem]:has-text("Sign out")'); await pg.waitForTimeout(600)
  ok(calls(s, 'logout').length === 1 && await pg.locator('h1:text-is("💶 FamilyFinance")').count() === 1, 'Sign out from the menu signs out')
  await s.b.close()

  /* ===== profile ===== */
  s = await open('/settings?tab=profile'); pg = s.page
  const name = pg.locator('label:has-text("Your name") input'), uname = pg.locator('label:has-text("Username") input')
  ok(await name.inputValue() === 'Alex' && await uname.inputValue() === 'alex', 'name and username are filled in')
  const facts = await pg.locator('.facts').first().innerText()
  ok(facts.includes('alex@example.test') && facts.includes('Parent') && facts.includes('10 February 2026'), 'email, role and join date are shown: ' + facts.replace(/\n+/g, ' | '))
  ok(await pg.locator('.saverow:has(label:has-text("Your name")) button.primary').isDisabled(), 'Save is disabled until something changes')
  await name.fill('   '); await pg.click('.saverow:has(label:has-text("Your name")) button.primary'); await pg.waitForTimeout(300)
  ok((await pg.locator('.saverow:has(label:has-text("Your name")) [role=alert]').innerText()).includes('type a name') && rpcs(s, 'set_my_name').length === 0, 'a blank name is explained when you press Save, and nothing is sent')
  await name.fill('  Alex Quinn '); await pg.click('.saverow:has(label:has-text("Your name")) button.primary'); await pg.waitForTimeout(600)
  ok(rpcs(s, 'set_my_name')[0]?.body.n === 'Alex Quinn' && (await pg.locator('.saverow:has(label:has-text("Your name"))').innerText()).includes('Saved ✓'), 'saving sends the trimmed name and confirms')
  ok((await btn_text(pg)).includes('Alex Quinn'), 'the name at the top updates straight away')
  await name.fill('x'.repeat(40)); ok(await name.inputValue() === 'x'.repeat(40), 'the box stops at 40 characters (maxlength)')
  s.st.rpcAnswer.set_my_name = 'invalid'; await pg.click('.saverow:has(label:has-text("Your name")) button.primary'); await pg.waitForTimeout(500)
  ok((await pg.locator('.saverow:has(label:has-text("Your name")) [role=alert]').innerText()).includes('not valid'), 'a refusal from the database is explained')
  await uname.fill('Mia_2'); s.st.rpcAnswer.set_username = 'taken'; await pg.click('.saverow:has(label:has-text("Username")) button.primary'); await pg.waitForTimeout(500)
  ok((await pg.locator('.saverow:has(label:has-text("Username")) [role=alert]').innerText()).includes('taken'), 'a taken username says so')
  s.st.rpcAnswer.set_username = 'invalid'; await pg.click('.saverow:has(label:has-text("Username")) button.primary'); await pg.waitForTimeout(500)
  ok((await pg.locator('.saverow:has(label:has-text("Username")) [role=alert]').innerText()).includes('3 to 20'), 'an invalid username explains the rules')
  delete s.st.rpcAnswer.set_username; await pg.click('.saverow:has(label:has-text("Username")) button.primary'); await pg.waitForTimeout(500)
  ok((await pg.locator('.saverow:has(label:has-text("Username"))').innerText()).includes('Saved ✓'), 'a good username is saved')
  // password
  const pws = pg.locator('.card:has(h2:text-is("Password")) input[type=password]')
  ok(await pg.locator('button:text-is("Change password")').isDisabled(), 'Change password waits until you type one')
  await pws.nth(0).fill('abc'); await pws.nth(1).fill('abc'); await pg.click('button:text-is("Change password")')
  ok((await pg.locator('.card:has(h2:text-is("Password")) [role=alert]').innerText()).includes('8') && calls(s, 'updateUser').length === 0, 'a short new password is refused, nothing sent')
  await pws.nth(0).fill('brandnew123'); await pws.nth(1).fill('brandnew124'); await pg.click('button:text-is("Change password")')
  ok((await pg.locator('.card:has(h2:text-is("Password")) [role=alert]').innerText()).includes('do not match'), 'a mismatch is refused')
  await pws.nth(1).fill('brandnew123'); await pg.click('button:text-is("Change password")'); await pg.waitForTimeout(600)
  ok(calls(s, 'updateUser')[0]?.body.password === 'brandnew123' && (await pg.locator('.card:has(h2:text-is("Password"))').innerText()).includes('Password changed ✓') && await pws.nth(0).inputValue() === '', 'a good one is saved, confirmed, and the boxes are cleared')
  s.st.putError = true; await pws.nth(0).fill('brandnew123'); await pws.nth(1).fill('brandnew123'); await pg.click('button:text-is("Change password")'); await pg.waitForTimeout(500)
  ok((await pg.locator('.card:has(h2:text-is("Password")) [role=alert]').innerText()).includes('should be different'), 'a server refusal is shown')
  // sign out everywhere
  await pg.click('button:text-is("Sign out everywhere")'); await pg.waitForTimeout(600)
  ok(s.dialogs.some(d => d.type === 'confirm' && d.msg.includes('every device')) && calls(s, 'logout').some(l => l.q.includes('scope=global')), 'Sign out everywhere asks first, then signs out all devices')
  ok(s.errors.length === 0, 'no errors on the profile ' + s.errors.join('|'))
  await s.b.close()
  s = await open('/settings?tab=profile', { declineConfirm: true }); pg = s.page
  await pg.click('button:text-is("Sign out everywhere")'); await pg.waitForTimeout(400)
  ok(calls(s, 'logout').length === 0, 'declining the question signs nobody out')
  await s.b.close()
  s = await open('/settings?tab=profile', { asKid: true }); pg = s.page
  const kf = await pg.locator('.facts').first().innerText()
  ok(kf.includes('Child') && (await text(pg)).includes('Sees their own spending') && await pg.locator('label:has-text("Your name") input').inputValue() === 'Mia', 'a child sees their own profile with a description of their role')
  await s.b.close()

  /* ===== family settings ===== */
  s = await open('/settings?tab=family'); pg = s.page
  const fam = pg.locator('label:has-text("Family name") input')
  ok(await fam.inputValue() === 'The Smiths', 'a parent sees the family name in an editable box')
  const members = await pg.locator('.card:has(h2:has-text("Members")) .row.item').allInnerTexts()
  ok(members.length === 3 && members[0].includes('Alex') && members[0].includes('(you)') && members[1].includes('Bo') && members[2].includes('Mia') && members[2].includes('Child'), 'members are listed parents first, with (you) and roles: ' + members.map(x => x.replace(/\n+/g, ' ')).join(' | '))
  ok((await pg.locator('h2:has-text("Members")').innerText()).includes('(3)') && members[2].includes('@mia') && members[2].includes('1 March 2026'), 'with a count, username and join date')
  ok((await text(pg)).includes('Euro') && (await text(pg)).includes('English'), 'currency and language are shown')
  await fam.fill('  The Quinns '); await pg.click('.saverow:has(label:has-text("Family name")) button.primary'); await pg.waitForTimeout(600)
  ok(rpcs(s, 'rename_family')[0]?.body.n === 'The Quinns' && (await pg.locator('header').innerText()).includes('The Quinns'), 'renaming the family saves, and the header shows it at once')
  ok(await pg.locator('.codebox').count() === 2 && (await pg.locator('.codebox').allInnerTexts()).join().includes('aaaaaaaaaaaa') && (await pg.locator('.codebox').allInnerTexts()).join().includes('bbbbbbbbbbbb'), 'a parent sees the parent code and the kid code')
  await pg.click('.codebox:has-text("Kid code") button:text-is("Copy code")'); await pg.waitForTimeout(300)
  ok(await pg.evaluate(() => navigator.clipboard.readText()) === 'bbbbbbbbbbbb' && (await pg.locator('.codebox:has-text("Kid code")').innerText()).includes('Copied ✓'), 'Copy code puts the code on the clipboard and says so')
  await pg.click('.codebox:has-text("Parent code") button:text-is("Copy invitation")'); await pg.waitForTimeout(300)
  const inv = await pg.evaluate(() => navigator.clipboard.readText())
  ok(inv.includes('The Quinns') && inv.includes(ORIGIN) && inv.includes('parent code: aaaaaaaaaaaa') && inv.includes('Join your family'), 'Copy invitation gives a ready message with the link, steps and code: ' + inv.replace(/\n/g, ' / ').slice(0, 90))
  await pg.screenshot({ path: `${S}/ui/acc-family.png`, fullPage: true })
  await pg.click('button:has-text("Replace both codes")'); await pg.waitForTimeout(600)
  ok(rpcs(s, 'rotate_invite_codes').length === 1 && s.dialogs.some(d => d.type === 'confirm' && d.msg.includes('already in the family stay')), 'replacing codes asks first and explains nobody is removed')
  const after = (await pg.locator('.codebox').allInnerTexts()).join()
  ok(after.includes('cccccccccccc') && after.includes('dddddddddddd') && !after.includes('aaaaaaaaaaaa') && (await text(pg)).includes('old ones no longer work'), 'the new codes replace the old on screen, with a note')
  s.st.rpcAnswer.rename_family = 'invalid'; await fam.fill('Another'); await pg.click('.saverow:has(label:has-text("Family name")) button.primary'); await pg.waitForTimeout(500)
  ok((await pg.locator('.saverow:has(label:has-text("Family name")) [role=alert]').innerText()).includes('family name'), 'an invalid family name is explained')
  ok(s.errors.length === 0, 'no errors in family settings ' + s.errors.join('|'))
  await s.b.close()
  s = await open('/settings?tab=family', { declineConfirm: true }); pg = s.page
  await pg.click('button:has-text("Replace both codes")'); await pg.waitForTimeout(400)
  ok(rpcs(s, 'rotate_invite_codes').length === 0, 'declining the question keeps the codes')
  await s.b.close()
  s = await open('/settings?tab=family', { asKid: true }); pg = s.page
  ok(await pg.locator('h2:text-is("Invite people")').count() === 0 && await pg.locator('.codebox').count() === 0 && rpcs(s, 'family_codes').length === 0, 'a child sees no invite section and the codes are not even requested')
  ok(await pg.locator('label:has-text("Family name") input').count() === 0 && (await text(pg)).includes('The Smiths') && (await text(pg)).includes('Only parents can change'), 'a child sees the family name as text, with a reason it cannot be changed')
  ok(await pg.locator('.card:has(h2:has-text("Members")) .row.item').count() === 3, 'and the list of members')
  await s.b.close()

  /* ===== moved things still work ===== */
  s = await open('/plan?tab=family'); pg = s.page
  ok(new URL(pg.url()).pathname === '/settings' && new URL(pg.url()).searchParams.get('tab') === 'family', 'an old Plan → Family link lands on the new Family settings')
  await pg.goto(ORIGIN + '/plan'); await pg.waitForSelector('[role=tab]')
  ok(JSON.stringify(await pg.locator('main [role=tab]').allInnerTexts()) === '["Budgets","Bills","Import","Rules"]', 'Plan no longer has a Family tab')
  await s.b.close()
  s = await open('/'); pg = s.page; await pg.evaluate(() => 0)
  ok(await pg.locator('nav.tabs a').count() === 5, 'the bottom tabs are unchanged (Settings lives in the name menu)')
  await s.b.close()

  console.log(results.join('\n')); process.exit(failed ? 1 : 0)
})()
async function btn_text(pg) { return pg.locator('.usermenu-btn').innerText() }

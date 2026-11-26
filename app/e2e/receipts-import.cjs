const { chromium } = require('playwright')
const fs = require('fs')
const S = process.argv[2], FX = `${S}/fx`
const SB = 'https://jqvdmqnipozgmhecooil.supabase.co', REF = 'jqvdmqnipozgmhecooil'
const now = new Date(), ym = o => new Date(now.getFullYear(), now.getMonth() + o, 1).toLocaleDateString('sv').slice(0, 7)
const P = { user_id: 'p1', family_id: 'f1', display_name: 'Mum', role: 'parent', username: 'mum' }
const cats = [{ id: 'g', name: 'Groceries', emoji: '🛒', budget_cents: 0, archived: false }, { id: 'e', name: 'Eating out', emoji: '🍕', budget_cents: 0, archived: false },
  { id: 't', name: 'Transport', emoji: '🚌', budget_cents: 0, archived: false }, { id: 'o', name: 'Other', emoji: '📦', budget_cents: 0, archived: false }]
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
      return json(st.expenses)
    }
    const map = { categories: cats, members: [P], bills: [], bill_payments: [] }
    let rows = map[tb] || []; const uid = u.searchParams.get('user_id'); if (tb === 'members' && uid) rows = rows.filter(r => 'eq.' + r.user_id === uid)
    const single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object'); return json(single ? (rows[0] ?? null) : rows)
  })
  await page.goto('http://localhost:5173' + path); await page.waitForTimeout(1100)
  return { b, page, log, errors, dialogs, st }
}
const exp = (id, o = {}) => ({ id, family_id: 'f1', member_id: 'p1', category_id: 'g', amount_cents: 1250, note: 'weekly shop', spent_on: `${ym(0)}-03`, bill_id: null, edited_at: null, edited_by: null, receipt_path: null, ...o })
const py = (f, xy = '5,5') => require('child_process').execSync('python3 -c "from PIL import Image; im=Image.open(\'' + f + '\'); print(im.format, im.size[0], im.size[1], im.getpixel((' + xy + ')))"').toString().trim()

;(async () => {
  /* ===== receipt photos ===== */
  let s = await open('/'), pg = s.page
  await pg.click('button[aria-label="Add expense"]')
  await pg.fill('input[inputmode=decimal]', '23,45'); await pg.click('.chip:has-text("Groceries")')
  await pg.setInputFiles('input[type=file]', `${FX}/big.jpg`); await pg.waitForSelector('.receipt img', { timeout: 15000 })
  ok(await pg.locator('.receipt img').isVisible(), 'a chosen photo is previewed before saving')
  ok(await pg.locator('button:has-text("Replace photo")').count() === 1 && await pg.locator('button:has-text("Remove photo")').count() === 1, 'buttons switch to Replace / Remove')
  await pg.click('button.primary'); await pg.waitForTimeout(1500)
  const post = s.log.find(l => l.k === 'POST' && l.tb === 'expenses'), up = s.log.find(l => l.k === 'upload'), patch = s.log.find(l => l.k === 'PATCH' && l.body && l.body.receipt_path)
  ok(post && uuidRe.test(post.body.id) && !('receipt_path' in post.body), 'the new expense is created first with an id chosen by the app, and no photo path yet')
  ok(up && up.path.startsWith(`f1/${post?.body.id}/`) && up.path.endsWith('.jpg'), `the photo is stored under <family>/<expense id>/ (${up?.path})`)
  ok(patch && patch.body.receipt_path === up.path && patch.q.includes(`id=eq.${post.body.id}`), 'then the expense is pointed at the uploaded photo')
  ok(s.log.indexOf(post) < s.log.indexOf(up) && s.log.indexOf(up) < s.log.indexOf(patch), 'order: create expense, upload photo, attach path')
  const info = py(s.st.uploads[0].file); const [fmt, w, h] = info.split(' ')
  ok(fmt === 'JPEG' && Math.max(+w, +h) === 1600 && +w === 1600 && +h === 1067, `a 5.5 MB 3000x2000 photo is stored as a ${w}x${h} JPEG`)
  ok(fs.statSync(s.st.uploads[0].file).size < 900 * 1024, `...of ${(fs.statSync(s.st.uploads[0].file).size / 1024).toFixed(0)} KB (vs 5,362 KB original)`)
  ok(s.st.uploads[0].ctype === 'image/jpeg', 'uploaded with content-type image/jpeg')
  ok(await pg.locator('h2:text-is("Add expense")').count() === 0, 'the sheet closes after saving')
  ok(s.errors.length === 0, 'no errors adding a photo' + s.errors.join('|'))
  await s.b.close()

  s = await open('/'); pg = s.page
  await pg.click('button[aria-label="Add expense"]'); await pg.fill('input[inputmode=decimal]', '5'); await pg.click('.chip:has-text("Groceries")')
  await pg.setInputFiles('input[type=file]', `${FX}/transparent.png`); await pg.waitForSelector('.receipt img')
  await pg.click('button.primary'); await pg.waitForTimeout(1200)
  const px = py(s.st.uploads[0].file, '600,300'); const [r, g, b] = (px.match(/\((\d+), (\d+), (\d+)\)/) || []).slice(1).map(Number)
  ok(r > 245 && g > 245 && b > 245, 'a transparent PNG gets a white background, not black (pixel ' + px + ')')
  ok(py(s.st.uploads[0].file, '100,300').includes('(0, 0, 2'), 'while the opaque part keeps its colour')
  await s.b.close()

  s = await open('/'); pg = s.page
  await pg.click('button[aria-label="Add expense"]'); await pg.fill('input[inputmode=decimal]', '5'); await pg.click('.chip:has-text("Groceries")')
  await pg.setInputFiles('input[type=file]', `${FX}/note.txt`); await pg.waitForTimeout(500)
  ok((await pg.locator('.sheet .error').innerText()).includes('choose a photo'), 'a non-image file is refused with a message')
  await pg.setInputFiles('input[type=file]', { name: 'bad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') }); await pg.waitForTimeout(500)
  ok((await pg.locator('.sheet .error').innerText()).includes('could not be read'), 'a corrupt image is refused with a message')
  ok(s.log.filter(l => l.k === 'upload').length === 0 && await pg.locator('.receipt img').count() === 0, 'nothing is uploaded or previewed')
  await pg.click('button.primary'); await pg.waitForTimeout(800)
  ok(s.log.filter(l => l.k === 'POST').length === 1, 'the expense can still be saved without a photo')
  await s.b.close()

  s = await open('/', { failUpload: true }); pg = s.page
  await pg.click('button[aria-label="Add expense"]'); await pg.fill('input[inputmode=decimal]', '7'); await pg.click('.chip:has-text("Groceries")')
  await pg.setInputFiles('input[type=file]', `${FX}/small.jpg`); await pg.waitForSelector('.receipt img')
  await pg.click('button.primary'); await pg.waitForTimeout(1500)
  ok(s.log.filter(l => l.k === 'POST').length === 1 && s.dialogs.some(d => d.includes('could not be uploaded') && d.includes('saved')), 'if the upload fails the expense is kept and the user is told: ' + s.dialogs[0]?.slice(0, 60))
  ok(!s.log.some(l => l.k === 'PATCH'), 'no photo path is attached after a failed upload')
  await s.b.close()

  // editing
  const withPhoto = exp('e1', { receipt_path: 'f1/e1/old.jpg' }), plain = exp('e2', { note: 'bread', category_id: 'g' })
  s = await open('/', { expenses: [withPhoto, plain] }); pg = s.page
  ok(await pg.locator('[role=button]:has-text("weekly shop") >> text=📎').count() === 1 && await pg.locator('[role=button]:has-text("bread") >> text=📎').count() === 0, 'only expenses with a photo show the 📎 marker')
  await pg.locator('[role=button]:has-text("weekly shop")').click(); await pg.waitForSelector('.receipt img'); await pg.waitForTimeout(500)
  ok(s.log.some(l => l.k === 'sign' && l.path === 'f1/e1/old.jpg'), 'the saved photo is shown through a short-lived signed link')
  ok(await pg.evaluate(() => document.querySelector('.receipt img').naturalWidth > 0), 'and it actually loads')
  ok(await pg.locator('.receipt a').getAttribute('target') === '_blank', 'tap to open it full size')
  // only the note changes -> photo untouched
  await pg.fill('input:not([inputmode]):not([type=date]):not([type=file])', 'weekly shop!'); await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(700)
  const p1 = s.log.find(l => l.k === 'PATCH'); ok(p1 && JSON.stringify(p1.body) === '{"note":"weekly shop!"}' && !s.log.some(l => l.k === 'upload' || l.k === 'storage-delete'), 'changing only the note leaves the photo alone')
  // replace
  await pg.locator('[role=button]:has-text("weekly shop")').click(); await pg.waitForSelector('.receipt img')
  await pg.setInputFiles('input[type=file]', `${FX}/small.jpg`); await pg.waitForTimeout(700)
  await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(1200)
  const up2 = s.log.find(l => l.k === 'upload'), p2 = s.log.filter(l => l.k === 'PATCH')[1], del2 = s.log.find(l => l.k === 'storage-delete')
  ok(up2 && p2?.body.receipt_path === up2.path && up2.path !== 'f1/e1/old.jpg', 'replacing uploads a new file and points the expense at it')
  ok(del2 && del2.prefixes[0] === 'f1/e1/old.jpg' && s.log.indexOf(del2) > s.log.indexOf(p2), 'the old photo is deleted only after the new one is attached')
  await s.b.close()

  // remove
  s = await open('/', { expenses: [withPhoto] }); pg = s.page
  await pg.locator('[role=button]:has-text("weekly shop")').click(); await pg.waitForSelector('.receipt img')
  await pg.click('button:text-is("Remove photo")'); ok(await pg.locator('.receipt img').count() === 0, 'Remove hides the photo straight away')
  await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(900)
  const p3 = s.log.find(l => l.k === 'PATCH'); ok(p3 && p3.body.receipt_path === null && s.log.find(l => l.k === 'storage-delete')?.prefixes[0] === 'f1/e1/old.jpg', 'removing clears the path and deletes the file')
  await s.b.close()
  // remove, but cancel
  s = await open('/', { expenses: [withPhoto] }); pg = s.page
  await pg.locator('[role=button]:has-text("weekly shop")').click(); await pg.waitForSelector('.receipt img'); await pg.click('button:text-is("Remove photo")')
  await pg.click('.sheet button:text-is("Cancel")'); await pg.waitForTimeout(300)
  ok(!s.log.some(l => l.k === 'PATCH' || l.k === 'storage-delete'), 'cancelling after Remove changes nothing')
  await s.b.close()

  // edit refused by the database after upload -> the new file is cleaned up
  s = await open('/', { expenses: [withPhoto], patchResult: [] }); pg = s.page
  await pg.locator('[role=button]:has-text("weekly shop")').click(); await pg.waitForSelector('.receipt img')
  await pg.setInputFiles('input[type=file]', `${FX}/small.jpg`); await pg.waitForTimeout(600); await pg.click('button:text-is("Save changes")'); await pg.waitForTimeout(1200)
  const upX = s.log.find(l => l.k === 'upload'), delX = s.log.filter(l => l.k === 'storage-delete')
  ok((await pg.locator('.sheet .error').innerText()).includes('could not be changed') && delX.length === 1 && delX[0].prefixes[0] === upX.path, 'if the save is refused, the just-uploaded photo is removed again, and the old one is kept')
  await s.b.close()

  // delete: photo first, then the row
  s = await open('/', { expenses: [withPhoto] }); pg = s.page
  await pg.locator('[role=button]:has-text("weekly shop")').click(); await pg.waitForSelector('.receipt img')
  await pg.click('button:has-text("Delete this expense")'); await pg.waitForTimeout(1000)
  const sd = s.log.find(l => l.k === 'storage-delete'), rd = s.log.find(l => l.k === 'DELETE')
  ok(sd && rd && s.log.indexOf(sd) < s.log.indexOf(rd) && sd.prefixes[0] === 'f1/e1/old.jpg', 'deleting an expense removes its photo first (afterwards nobody would be allowed to)')
  await s.b.close()

  /* ===== CSV import ===== */
  const hist = [{ note: 'Bakkerij Kramer', category_id: 'e' }, { note: 'Bakkerij Kramer Utrecht', category_id: 'e' }]
  s = await open('/plan?tab=import', { history: hist, existing: [{ spent_on: '2026-03-15', amount_cents: 2345 }], pastRows: [
    { import_batch: 'b-old', amount_cents: 1000, spent_on: '2026-02-01', created_at: '2026-02-10T10:00:00Z' }, { import_batch: 'b-old', amount_cents: 500, spent_on: '2026-02-03', created_at: '2026-02-10T10:00:00Z' }] }); pg = s.page
  ok(await pg.locator('text=Past imports').count() === 1 && (await pg.locator('.row.item:has-text("2 expenses")').count()) === 1, 'earlier imports are listed, grouped by batch')
  await pg.setInputFiles('input[type=file]', `${FX}/ing.csv`); await pg.waitForSelector('.imp-row'); await pg.waitForTimeout(600)
  const sel = async label => pg.locator(`label:has-text("${label}") select`).first().evaluate(e => e.options[e.selectedIndex].text)
  ok(await sel('Date') === 'Datum' && (await sel('Amount')).startsWith('Bedrag') && (await sel('Description')) === 'Naam / Omschrijving', 'columns are detected from a Dutch bank file')
  ok((await pg.locator('label:has-text("Debit/credit") select').evaluate(e => e.options[e.selectedIndex].text)) === 'Af Bij', 'the Af/Bij column is picked up')
  const summary = await pg.locator('text=expenses found').innerText()
  ok(summary.includes('5 expenses found') && summary.includes('1 incoming payments skipped') && summary.includes('1 rows could not be read'), 'summary: ' + summary)
  const rowsText = await pg.locator('.imp-row').allInnerTexts()
  ok(rowsText.length === 5 && rowsText.some(t => t.includes('Zoë Müller')), 'the cp1252 file decodes (é survives)')
  const catOf = async txt => pg.locator(`.imp-row:has-text("${txt}") select`).evaluate(e => e.options[e.selectedIndex].text)
  ok((await catOf('Albert Heijn')).includes('Groceries') && (await catOf('NS Groep')).includes('Transport') && (await catOf('Thuisbezorgd')).includes('Eating out'), 'starter keywords suggest Groceries, Transport, Eating out')
  ok((await catOf('Bakkerij')).includes('Eating out') && await pg.locator('.imp-row:has-text("Bakkerij") >> text=Learned').count() === 1 && await pg.locator('.imp-row:has-text("Bakkerij") >> text=earlier expenses mentioning').count() === 1, 'a merchant seen before is categorised from the family\'s own history, labelled Learned with the reason')
  ok((await catOf('Zoë Müller')).includes('Other'), 'unknown merchants default to Other')
  ok(await pg.locator('.imp-row:has-text("Albert Heijn") >> text=possible duplicate').count() === 1 && await pg.locator('.imp-row:has-text("Albert Heijn") input[type=checkbox]').isChecked() === false, 'an expense already entered (same day and amount) is flagged and unchecked')
  ok((await pg.locator('button.primary:has-text("Import 4")').count()) === 1, 'the button says exactly what will happen (4 expenses)')
  // review: change a category, uncheck a row, clear one category
  await pg.locator('.imp-row:has-text("Thuisbezorgd") select').selectOption({ label: '🛒 Groceries' })
  await pg.locator('.imp-row:has-text("NS Groep") input[type=checkbox]').uncheck()
  await pg.locator('.imp-row:has-text("Zoë Müller") select').selectOption({ value: '' })
  ok(await pg.locator('button.primary:has-text("Import 3")').isDisabled() && await pg.locator('text=needs a category').count() === 1, 'import is blocked while a selected row has no category')
  await pg.locator('.imp-row:has-text("Zoë Müller") select').selectOption({ label: '🍕 Eating out' })
  await pg.click('button.primary:has-text("Import 3")'); await pg.waitForTimeout(1200)
  const imp = s.log.filter(l => l.k === 'POST' && l.tb === 'expenses'); const rowsIn = imp.flatMap(l => l.body)
  ok(imp.length === 1 && rowsIn.length === 3, 'the 3 chosen rows are inserted in one request')
  ok(new Set(rowsIn.map(r => r.import_batch)).size === 1 && uuidRe.test(rowsIn[0].import_batch), 'all rows share one import batch id')
  ok(rowsIn.every(r => r.member_id === 'p1' && r.family_id === 'f1' && Number.isInteger(r.amount_cents) && r.amount_cents > 0 && /^\d{4}-\d\d-\d\d$/.test(r.spent_on)), 'rows have the right owner, whole positive cents and ISO dates')
  const byNote = n => rowsIn.find(r => r.note.includes(n))
  ok(byNote('Thuisbezorgd').amount_cents === 102400 && byNote('Thuisbezorgd').category_id === 'g' && byNote('Bakkerij').category_id === 'e' && byNote('Bakkerij').amount_cents === 420, 'amounts (1.024,00 -> 102400) and the chosen categories are what was imported')
  ok(!rowsIn.some(r => r.note.includes('NS Groep') || r.note.includes('Albert')), 'unchecked and duplicate rows are not imported')
  ok(!rowsIn.some(r => 'id' in r || 'receipt_path' in r || 'bill_id' in r), 'only allowed columns are sent')
  ok(await pg.locator('text=Imported 3 expenses').count() === 1, 'a confirmation is shown')
  await pg.click('button:text-is("Undo this import")'); await pg.waitForTimeout(700)
  const ud = s.log.find(l => l.k === 'DELETE'); ok(ud && ud.q.includes(`import_batch=eq.${rowsIn[0].import_batch}`) && !ud.q.includes('b-old'), 'Undo deletes exactly that import batch')
  ok(s.errors.length === 0, 'no errors importing' + s.errors.join('|'))
  await s.b.close()

  s = await open('/plan?tab=import'); pg = s.page
  await pg.setInputFiles('input[type=file]', `${FX}/card.csv`); await pg.waitForSelector('.imp-row')
  ok((await pg.locator('label:has-text("Dates are") select').inputValue()) === 'mdy' && (await pg.locator('label:has-text("Money out is") select').inputValue()) === 'positive', 'a US credit-card file is detected: month-first dates, purchases positive')
  ok((await pg.locator('.imp-row').allInnerTexts()).some(t => t.includes('2026-03-15')), '03/15/2026 reads as 15 March')
  await pg.locator('label:has-text("Money out is") select').selectOption('negative'); await pg.waitForTimeout(300)
  ok(await pg.locator('.imp-row').count() === 1, 'flipping the sign switch re-reads the file (only the refund-like row is now an "expense")')
  await s.b.close()

  s = await open('/plan?tab=import'); pg = s.page
  for (const f of ['empty.csv', 'binary.csv']) { await pg.setInputFiles('input[type=file]', `${FX}/${f}`); await pg.waitForTimeout(500) }
  ok(s.errors.length === 0 && await pg.locator('.imp-row').count() === 0, 'an empty or binary file does not crash the page')
  ok(s.log.filter(l => l.k === 'POST').length === 0, 'and nothing is imported')
  await s.b.close()

  s = await open('/plan?tab=import'); pg = s.page
  await pg.setInputFiles('input[type=file]', `${FX}/big.csv`); await pg.waitForSelector('.imp-row'); await pg.waitForTimeout(700)
  ok(await pg.locator('.imp-row').count() === 450, '450 rows are all listed for review')
  await pg.click('button.primary:has-text("Import 450")'); await pg.waitForTimeout(2000)
  const chunks = s.log.filter(l => l.k === 'POST').map(l => l.body.length)
  ok(JSON.stringify(chunks) === '[200,200,50]', 'a large import is sent in chunks: ' + JSON.stringify(chunks))
  await s.b.close()

  s = await open('/plan?tab=import', { insertFailFrom: 2 }); pg = s.page
  await pg.setInputFiles('input[type=file]', `${FX}/big.csv`); await pg.waitForSelector('.imp-row'); await pg.waitForTimeout(500)
  await pg.click('button.primary:has-text("Import 450")'); await pg.waitForTimeout(2000)
  const em = await pg.locator('.error').first().innerText()
  ok(em.includes('Imported 200 of 450') && em.includes('Undo'), 'a failure part-way says how much went in and how to undo it: ' + em.slice(0, 70))
  await s.b.close()

  console.log(results.join('\n')); process.exit(failed ? 1 : 0)
})()

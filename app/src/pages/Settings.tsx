import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { FAMILY_NAME_MAX, NAME_MAX, PASSWORD_MIN, inviteText, nameProblem, passwordProblem, saveNameMessage, usernameMessage } from '../lib/profile'
import type { Member } from '../lib/types'

const date = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })

export default function Settings() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'family' ? 'family' : 'profile'
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <div className="seg" role="tablist">
        {([['profile', 'My profile'], ['family', 'Family']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setParams({ tab: id }, { replace: true })}>{label}</button>
        ))}
      </div>
      {tab === 'profile' ? <ProfileTab /> : <FamilyTab />}
    </>
  )
}

/** One "label, input, Save" row that reports its own result. */
function SaveRow({ label, initial, max, help, onSave, autoComplete }: {
  label: string; initial: string; max: number; help?: string; autoComplete?: string
  onSave: (value: string) => Promise<string | null> // a message when it failed, null when it worked
}) {
  const [value, setValue] = useState(initial)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setValue(initial), [initial])
  const changed = value.trim() !== initial

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const problem = await onSave(value.trim())
    setBusy(false)
    setMsg(problem ? { ok: false, text: problem } : { ok: true, text: 'Saved ✓' })
  }
  return (
    <form onSubmit={submit} className="saverow">
      <label>{label}
        <input value={value} maxLength={max} autoCapitalize="none" autoCorrect="off" autoComplete={autoComplete} onChange={e => { setValue(e.target.value); setMsg(null) }} />
      </label>
      {help && <p className="muted small">{help}</p>}
      <div className="saverow-actions">
        <button className="primary" disabled={!changed || busy}>{busy ? 'Saving…' : 'Save'}</button>
        {msg && <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'good small' : 'error small'}>{msg.text}</span>}
      </div>
    </form>
  )
}

/* ---------------- Profile ---------------- */

function ProfileTab() {
  const { session, member, refresh } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwBusy, setPwBusy] = useState(false)
  if (!member) return null

  async function saveName(v: string) {
    const problem = nameProblem(v); if (problem) return problem
    const { data, error } = await supabase.rpc('set_my_name', { n: v })
    if (error) return error.message
    const msg = saveNameMessage(data); if (msg) return msg
    await refresh(); return null
  }
  async function saveUsername(v: string) {
    const { data, error } = await supabase.rpc('set_username', { u: v })
    if (error) return error.message
    const msg = usernameMessage(data); if (msg) return msg
    await refresh(); return null
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(pw, pw2)
    if (problem) return setPwMsg({ ok: false, text: problem })
    setPwBusy(true); setPwMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setPwBusy(false)
    if (error) return setPwMsg({ ok: false, text: error.message })
    setPw(''); setPw2(''); setPwMsg({ ok: true, text: 'Password changed ✓' })
  }
  async function signOutEverywhere() {
    if (!confirm('Sign out on every device where you are signed in, this one included?')) return
    await supabase.auth.signOut({ scope: 'global' })
  }

  return (
    <>
      <section className="card">
        <h2>About you</h2>
        <SaveRow label="Your name" initial={member.display_name} max={NAME_MAX} autoComplete="name" onSave={saveName}
          help="This is how the family sees you." />
        <SaveRow label="Username" initial={member.username ?? ''} max={20} autoComplete="username" onSave={saveUsername}
          help="3 to 20 letters, numbers or underscores. You can sign in with it instead of your email." />
        <dl className="facts">
          <div><dt>Email</dt><dd>{session?.user.email ?? ''}</dd></div>
          <div><dt>Role</dt><dd><span className="tag">{member.role === 'parent' ? 'Parent' : 'Child'}</span>
            <span className="muted small"> {member.role === 'parent' ? 'Can see and manage the whole family\'s money.' : 'Sees their own spending, jars and goals.'}</span></dd></div>
          {member.created_at && <div><dt>In the family since</dt><dd>{date(member.created_at)}</dd></div>}
        </dl>
      </section>

      <section className="card">
        <h2>Password</h2>
        <form onSubmit={changePassword}>
          <label>New password<input type="password" autoComplete="new-password" value={pw} onChange={e => { setPw(e.target.value); setPwMsg(null) }} /></label>
          <label>Type it again<input type="password" autoComplete="new-password" value={pw2} onChange={e => { setPw2(e.target.value); setPwMsg(null) }} /></label>
          <p className="muted small">At least {PASSWORD_MIN} characters. Forgot it instead? Sign out and choose "Forgot your password?".</p>
          <div className="saverow-actions">
            <button className="primary" disabled={!pw || pwBusy}>{pwBusy ? 'Saving…' : 'Change password'}</button>
            {pwMsg && <span role={pwMsg.ok ? 'status' : 'alert'} className={pwMsg.ok ? 'good small' : 'error small'}>{pwMsg.text}</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Signing out</h2>
        <div className="btn-row">
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          <button onClick={signOutEverywhere}>Sign out everywhere</button>
        </div>
        <p className="muted small">"Everywhere" also signs you out on your other phones and computers, which is useful if you lost a device.</p>
      </section>
    </>
  )
}

/* ---------------- Family ---------------- */

function FamilyTab() {
  const { member, family, refresh } = useAuth()
  const [people, setPeople] = useState<Member[]>([])
  const [codes, setCodes] = useState<{ parent_code: string; kid_code: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [note, setNote] = useState('')
  const isParent = member?.role === 'parent'

  useEffect(() => {
    supabase.from('members').select('*').then(r => setPeople((r.data ?? []) as Member[]))
    if (isParent) supabase.rpc('family_codes').then(r => setCodes(r.data?.[0] ?? null))
  }, [isParent])

  if (!member || !family) return <p className="muted center-text">Loading…</p>

  async function saveFamilyName(v: string) {
    const problem = nameProblem(v, FAMILY_NAME_MAX, 'family name'); if (problem) return problem
    const { data, error } = await supabase.rpc('rename_family', { n: v })
    if (error) return error.message
    const msg = saveNameMessage(data, 'family name'); if (msg) return msg
    await refresh(); return null
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text) }
    catch { // some browsers refuse: fall back to selecting a hidden box
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setCopied(what); setTimeout(() => setCopied(c => (c === what ? '' : c)), 2000)
  }
  async function rotate() {
    if (!confirm('Replace both invite codes? The old codes stop working straight away. People already in the family stay in it.')) return
    const { data, error } = await supabase.rpc('rotate_invite_codes')
    if (error) return setNote(error.message)
    setCodes(data?.[0] ?? null); setNote('New codes created. The old ones no longer work.')
  }

  const sorted = [...people].sort((a, b) => (a.role === b.role ? a.display_name.localeCompare(b.display_name) : a.role === 'parent' ? -1 : 1))
  const url = window.location.origin
  const codeBlock = (who: 'parent' | 'kid', code: string, title: string, help: string) => (
    <div className="codebox">
      <div><strong>{title}</strong><div className="muted small">{help}</div></div>
      <code aria-label={`${title}: ${code}`}>{code}</code>
      <div className="btn-row">
        <button onClick={() => copy(code, `${who}-code`)}>{copied === `${who}-code` ? 'Copied ✓' : 'Copy code'}</button>
        <button onClick={() => copy(inviteText({ familyName: family.name, who, code, url }), `${who}-msg`)}>{copied === `${who}-msg` ? 'Copied ✓' : 'Copy invitation'}</button>
      </div>
    </div>
  )

  return (
    <>
      <section className="card">
        <h2>Your family</h2>
        {isParent
          ? <SaveRow label="Family name" initial={family.name} max={FAMILY_NAME_MAX} onSave={saveFamilyName} />
          : <p className="big-name">{family.name}</p>}
        <dl className="facts">
          <div><dt>Currency</dt><dd>Euro (€)</dd></div>
          <div><dt>Language</dt><dd>English</dd></div>
        </dl>
        {!isParent && <p className="muted small">Only parents can change the family's settings.</p>}
      </section>

      <section className="card">
        <h2>Members ({sorted.length})</h2>
        {sorted.map(p => (
          <div key={p.user_id} className="row item">
            <div>
              <div>{p.display_name}{p.user_id === member.user_id && <span className="muted"> (you)</span>}</div>
              <div className="muted small">{p.username ? `@${p.username}` : 'no username yet'}{p.created_at ? ` · joined ${date(p.created_at)}` : ''}</div>
            </div>
            <span className="tag">{p.role === 'parent' ? 'Parent' : 'Child'}</span>
          </div>
        ))}
        <p className="muted small">Everyone in the family can see these names. Only parents see everyone's spending.</p>
      </section>

      {isParent && (
        <section className="card">
          <h2>Invite people</h2>
          {codes ? (
            <>
              {codeBlock('parent', codes.parent_code, 'Parent code', 'Gives full access to the family\'s money. Share it only with another parent.')}
              {codeBlock('kid', codes.kid_code, 'Kid code', 'Kids see their own spending, jars and goals.')}
              <p className="muted small">They create an account, then choose "Join your family" and enter the code.</p>
              <button className="danger-btn" onClick={rotate}>Replace both codes…</button>
              <p className="muted small">Do this if a code was shared by mistake. People already in the family are not affected.</p>
              {note && <p className="status" role="status">{note}</p>}
            </>
          ) : <p className="muted">Loading…</p>}
        </section>
      )}
    </>
  )
}

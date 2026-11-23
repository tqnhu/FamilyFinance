import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { joinMessage } from '../lib/join'

export default function Setup() {
  const { refresh } = useAuth()
  const [name, setName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)

  /** The name is needed by both forms. Say so, rather than leaving a button that does nothing. */
  function needName(): boolean {
    if (name.trim()) return false
    setMsg('Please type your name first.')
    nameInput.current?.focus()
    return true
  }

  async function join(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    if (needName()) return
    if (!code.trim()) return setMsg('Please type the invite code.')
    setBusy(true)
    const { data, error } = await supabase.rpc('join_family', { code, my_name: name })
    setBusy(false)
    // a database that has not had the latest update raises this instead of answering with a word
    if (error) return setMsg(error.message === 'already in a family' ? joinMessage('already_member')! : error.message)
    const problem = joinMessage(data)
    if (problem) return setMsg(problem)
    await refresh()
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    if (needName()) return
    setBusy(true)
    const { error } = await supabase.rpc('create_family', { family_name: familyName, my_name: name.trim() })
    setBusy(false)
    if (error) return setMsg(error.message === 'already in a family' ? 'This account is already in a family.' : error.message)
    await refresh()
  }

  return (
    <main className="card narrow">
      <h1>Welcome 👋</h1>
      <label>Your name<input ref={nameInput} value={name} autoComplete="given-name" onChange={e => setName(e.target.value)} /></label>

      <h2>Join your family</h2>
      <p className="muted small">A parent shares an invite code with you (they find it in Settings → Family, from the menu on their name).</p>
      <form onSubmit={join}>
        <label>Invite code
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="12 letters and numbers"
            autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} inputMode="text" />
        </label>
        <button className="primary" disabled={busy}>{busy ? 'Joining…' : 'Join family'}</button>
      </form>

      <h2>Or start a new family</h2>
      <p className="muted small">Only if you are the first one here. Everyone else joins with the code above.</p>
      <form onSubmit={create}>
        <label>Family name<input required value={familyName} onChange={e => setFamilyName(e.target.value)} /></label>
        <button disabled={busy}>Create family (you become a parent)</button>
      </form>

      {msg && <p className="error" role="alert">{msg}</p>}
      <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </main>
  )
}

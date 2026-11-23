import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { PASSWORD_MIN, passwordProblem } from '../lib/profile'

/** Shown after someone follows the link in a reset-password email: they are signed in just long enough to choose a new password. */
export default function ResetPassword() {
  const { finishRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password, confirm)
    if (problem) return setMsg(problem)
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setMsg(error.message)
    setDone(true)
  }

  if (done) {
    return (
      <main className="card narrow">
        <h1>Password changed ✅</h1>
        <p className="muted">You are signed in. Use your new password from now on.</p>
        <button className="primary" onClick={finishRecovery}>Continue</button>
      </main>
    )
  }
  return (
    <main className="card narrow">
      <h1>Choose a new password</h1>
      <form onSubmit={save}>
        <label>New password<input type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label>Type it again<input type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        <p className="muted small">At least {PASSWORD_MIN} characters.</p>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
      <button className="link" onClick={() => supabase.auth.signOut()}>Cancel</button>
    </main>
  )
}

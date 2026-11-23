import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { PASSWORD_MIN, RESET_SENT, RESET_WAIT, isRateLimit } from '../lib/profile'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in')
  const [busy, setBusy] = useState(false)
  const [login, setLogin] = useState('') // email or username (sign-in); email only (sign-up)
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState(false)

  async function sendReset(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    let email = login.trim()
    if (!email) return setMsg('Please type your email or username.')
    setBusy(true)
    if (!email.includes('@')) {
      const { data: found } = await supabase.rpc('email_for_username', { u: email })
      email = found ?? '' // an unknown username gets the same answer as a known one
    }
    if (email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) {
        setBusy(false)
        return setMsg(isRateLimit(error) ? RESET_WAIT : 'The email could not be sent. Please try again in a moment.')
      }
    }
    setBusy(false)
    setSent(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    let email = login.trim()
    if (mode === 'in' && !email.includes('@')) {
      // Username: look up the account's email. Unknown usernames get the same
      // message as a wrong password, so the form does not reveal which exist.
      const { data: found } = await supabase.rpc('email_for_username', { u: email })
      if (!found) return setMsg('Wrong username or password.')
      email = found
    }
    const { error, data } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (error) setMsg(mode === 'in' && !login.includes('@') ? 'Wrong username or password.' : error.message)
    else if (mode === 'up' && !data.session) setMsg('Check your email to confirm your account, then sign in.')
  }

  function go(next: 'in' | 'up' | 'forgot') { setMode(next); setMsg(''); setSent(false) }

  if (mode === 'forgot') {
    return (
      <main className="card narrow">
        <h1>Forgot your password?</h1>
        {sent ? (
          <>
            <p role="status">{RESET_SENT}</p>
            <button className="primary" onClick={() => go('in')}>Back to sign in</button>
          </>
        ) : (
          <>
            <p className="muted">Type your email or username and we will send you a link to choose a new password.</p>
            <form onSubmit={sendReset}>
              <label>Email or username
                <input type="text" required autoCapitalize="none" autoCorrect="off" autoComplete="username" value={login} onChange={e => setLogin(e.target.value)} />
              </label>
              <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            </form>
            {msg && <p className="error" role="alert">{msg}</p>}
            <button className="link" onClick={() => go('in')}>Back to sign in</button>
          </>
        )}
      </main>
    )
  }

  return (
    <main className="card narrow">
      <h1>💶 FamilyFinance</h1>
      <p className="muted">Track spending and save together.</p>
      <form onSubmit={submit}>
        <label>{mode === 'in' ? 'Email or username' : 'Email'}
          <input type={mode === 'in' ? 'text' : 'email'} required autoCapitalize="none" autoCorrect="off" autoComplete={mode === 'in' ? 'username' : 'email'}
            value={login} onChange={e => setLogin(e.target.value)} />
        </label>
        <label>Password
          <input type="password" required minLength={mode === 'up' ? PASSWORD_MIN : undefined} autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {mode === 'up' && <p className="muted small">At least {PASSWORD_MIN} characters.</p>}
        <button className="primary">{mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
      {mode === 'in' && <button className="link" onClick={() => go('forgot')}>Forgot your password?</button>}
      <button className="link" onClick={() => go(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </main>
  )
}

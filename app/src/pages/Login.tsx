import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [login, setLogin] = useState('') // email or username (sign-in); email only (sign-up)
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

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

  return (
    <main className="card narrow">
      <h1>💶 FamilyFinance</h1>
      <p className="muted">Track spending and save together.</p>
      <form onSubmit={submit}>
        <label>{mode === 'in' ? 'Email or username' : 'Email'}
          <input type={mode === 'in' ? 'text' : 'email'} required autoCapitalize="none" autoCorrect="off"
            value={login} onChange={e => setLogin(e.target.value)} />
        </label>
        <label>Password<input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="primary">{mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
      {msg && <p className="error">{msg}</p>}
      <button className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </main>
  )
}

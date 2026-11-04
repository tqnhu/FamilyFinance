import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    const { error, data } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (error) setMsg(error.message)
    else if (mode === 'up' && !data.session) setMsg('Check your email to confirm your account, then sign in.')
  }

  return (
    <main className="card narrow">
      <h1>💶 FamilyFinance</h1>
      <p className="muted">Track spending and save together.</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
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

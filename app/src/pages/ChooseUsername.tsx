import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'

export default function ChooseUsername() {
  const { refresh } = useAuth()
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('set_username', { u: name })
    if (error) return setMsg(error.message)
    if (data === 'invalid') return setMsg('Use 3-20 letters, numbers or underscores.')
    if (data === 'taken') return setMsg('That username is taken. Try another.')
    await refresh()
  }

  return (
    <main className="card narrow">
      <h1>Choose a username</h1>
      <p className="muted">You can use it instead of your email to sign in.</p>
      <form onSubmit={save}>
        <label>Username
          <input required autoCapitalize="none" autoCorrect="off" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <button className="primary">Save</button>
      </form>
      {msg && <p className="error">{msg}</p>}
      <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </main>
  )
}

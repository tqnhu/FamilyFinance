import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'

export default function Setup() {
  const { refresh } = useAuth()
  const [name, setName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')

  async function create(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('create_family', { family_name: familyName, my_name: name })
    if (error) setMsg(error.message); else await refresh()
  }
  async function join(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('join_family', { code: code.trim(), my_name: name })
    if (error) return setMsg(error.message)
    if (data === 'invalid_code') return setMsg('That code was not recognised. Check it and try again.')
    if (data === 'too_many_attempts') return setMsg('Too many wrong codes. Please wait an hour and try again.')
    await refresh()
  }

  return (
    <main className="card narrow">
      <h1>Welcome 👋</h1>
      <label>Your name<input required value={name} onChange={e => setName(e.target.value)} /></label>
      <h2>Start a new family</h2>
      <form onSubmit={create}>
        <label>Family name<input required value={familyName} onChange={e => setFamilyName(e.target.value)} /></label>
        <button className="primary" disabled={!name}>Create family (you become a parent)</button>
      </form>
      <h2>Or join one</h2>
      <form onSubmit={join}>
        <label>Invite code<input required value={code} onChange={e => setCode(e.target.value)} /></label>
        <button disabled={!name}>Join family</button>
      </form>
      {msg && <p className="error">{msg}</p>}
      <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </main>
  )
}

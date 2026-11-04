import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { configured, supabase } from './lib/supabase'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import Budgets from './pages/Budgets'

function Shell() {
  const { session, member, loading } = useAuth()
  if (!configured) return <main className="card narrow"><h1>Setup needed</h1><p>Copy <code>.env.example</code> to <code>.env</code> and add your Supabase URL and anon key.</p></main>
  if (loading) return <p className="muted center">Loading…</p>
  if (!session) return <Login />
  if (!member) return <Setup />
  return (
    <>
      <header>
        <strong>💶 {member.display_name}</strong>
        <nav>
          <NavLink to="/" end>Home</NavLink>
          {member.role === 'parent' && <NavLink to="/budgets">Budgets</NavLink>}
          <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {member.role === 'parent' && <Route path="/budgets" element={<Budgets />} />}
        </Routes>
      </main>
    </>
  )
}

export default function App() {
  return <BrowserRouter><AuthProvider><Shell /></AuthProvider></BrowserRouter>
}

import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { configured, supabase } from './lib/supabase'
import Login from './pages/Login'
import Setup from './pages/Setup'
import ChooseUsername from './pages/ChooseUsername'
import Dashboard from './pages/Dashboard'
import Budgets from './pages/Budgets'
import Jars from './pages/Jars'
import Goals from './pages/Goals'
import Review from './pages/Review'

function Shell() {
  const { session, member, loading } = useAuth()
  if (!configured) return <main className="card narrow"><h1>Setup needed</h1><p>Copy <code>.env.example</code> to <code>.env</code> and add your Supabase URL and anon key.</p></main>
  if (loading) return <p className="muted center">Loading…</p>
  if (!session) return <Login />
  if (!member) return <Setup />
  if (member.username === null) return <ChooseUsername /> // undefined = migration 003 not applied yet
  return (
    <>
      <header>
        <strong>💶 {member.display_name}</strong>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jars" element={<Jars />} />
          <Route path="/goals" element={<Goals />} />
          {member.role === 'parent' && <Route path="/review" element={<Review />} />}
          {member.role === 'parent' && <Route path="/budgets" element={<Budgets />} />}
        </Routes>
      </main>
      <nav className="tabs">
        <NavLink to="/" end><span>🏠</span>Home</NavLink>
        <NavLink to="/jars"><span>🫙</span>Jars</NavLink>
        <NavLink to="/goals"><span>🎯</span>Goals</NavLink>
        {member.role === 'parent' && <NavLink to="/review"><span>📊</span>Review</NavLink>}
        {member.role === 'parent' && <NavLink to="/budgets"><span>⚙️</span>Budgets</NavLink>}
      </nav>
    </>
  )
}

export default function App() {
  return <BrowserRouter><AuthProvider><Shell /></AuthProvider></BrowserRouter>
}

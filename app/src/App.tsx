import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { configured } from './lib/supabase'
import Login from './pages/Login'
import Setup from './pages/Setup'
import ChooseUsername from './pages/ChooseUsername'
import Dashboard from './pages/Dashboard'
import Plan from './pages/Plan'
import Jars from './pages/Jars'
import Goals from './pages/Goals'
import Review from './pages/Review'
import Settings from './pages/Settings'
import ResetPassword from './pages/ResetPassword'
import UserMenu from './components/UserMenu'

function Shell() {
  const { session, member, family, loading, recovering } = useAuth()
  if (!configured) return <main className="card narrow"><h1>Setup needed</h1><p>Copy <code>.env.example</code> to <code>.env</code> and add your Supabase URL and anon key.</p></main>
  if (loading) return <p className="muted center">Loading…</p>
  if (session && recovering) return <ResetPassword /> // followed a reset-password email: choose a new password first
  if (!session) return <Login />
  if (!member) return <Setup />
  if (member.username === null) return <ChooseUsername /> // undefined = migration 003 not applied yet
  return (
    <>
      <header>
        <UserMenu />
        {family && <span className="muted small header-family">{family.name}</span>}
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jars" element={<Jars />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/review" element={<Review />} />
          <Route path="/settings" element={<Settings />} />
          {member.role === 'parent' && <Route path="/plan" element={<Plan />} />}
          <Route path="/budgets" element={<Navigate to="/plan" replace />} />
        </Routes>
      </main>
      <nav className="tabs">
        <NavLink to="/" end><span>🏠</span>Home</NavLink>
        <NavLink to="/jars"><span>🫙</span>Jars</NavLink>
        <NavLink to="/goals"><span>🎯</span>Goals</NavLink>
        {member.role === 'parent' && <NavLink to="/review"><span>📊</span>Review</NavLink>}
        {member.role === 'parent' && <NavLink to="/plan"><span>📋</span>Plan</NavLink>}
      </nav>
    </>
  )
}

export default function App() {
  return <BrowserRouter><AuthProvider><Shell /></AuthProvider></BrowserRouter>
}

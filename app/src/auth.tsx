import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Member } from './lib/types'

type Ctx = { session: Session | null; member: Member | null; loading: boolean; refresh: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null!)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadMember(s: Session | null) {
    if (!s) return setMember(null)
    const { data } = await supabase.from('members').select('*').eq('user_id', s.user.id).maybeSingle()
    setMember(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadMember(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      void loadMember(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthCtx.Provider value={{ session, member, loading, refresh: () => loadMember(session) }}>
      {children}
    </AuthCtx.Provider>
  )
}

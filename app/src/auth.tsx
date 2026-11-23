import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Member } from './lib/types'

export type Family = { id: string; name: string }
type Ctx = {
  session: Session | null; member: Member | null; family: Family | null; loading: boolean; refresh: () => Promise<void>
  /** True while someone who followed a reset-password email must choose a new password. */
  recovering: boolean; finishRecovery: () => void
}
const AuthCtx = createContext<Ctx>(null!)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [family, setFamily] = useState<Family | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadMember(s: Session | null) {
    if (!s) { setMember(null); setFamily(null); return }
    const { data } = await supabase.from('members').select('*').eq('user_id', s.user.id).maybeSingle()
    setMember(data)
    if (!data) return setFamily(null)
    const { data: fam } = await supabase.from('families').select('id, name').maybeSingle() // row-level security returns only your own family
    setFamily(fam)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadMember(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true) // arrived from a reset-password email
      if (event === 'SIGNED_OUT') setRecovering(false)
      setSession(s)
      void loadMember(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthCtx.Provider value={{ session, member, family, loading, refresh: () => loadMember(session), recovering, finishRecovery: () => setRecovering(false) }}>
      {children}
    </AuthCtx.Provider>
  )
}

import { useEffect } from 'react'
import { useAuth } from '../auth'
import { announceChange, jarsSeenKey } from '../lib/badges'
import { jarsVisitedKey } from '../lib/checklist'
import { setLocal } from '../lib/local'
import { useJars } from '../lib/jars'
import ChildView from '../components/ChildView'
import ParentView from '../components/ParentView'

export default function Jars() {
  const { member } = useAuth()
  const data = useJars()
  const isChild = member?.role === 'child'
  useEffect(() => {
    if (!isChild || data.loading || !member) return
    const now = new Date().toISOString()
    setLocal(jarsSeenKey(member.user_id), now); setLocal(jarsVisitedKey(member.user_id), '1') // they have now seen their answers and their jars
    announceChange()
  }, [isChild, data.loading, member])
  if (data.loading) return <p className="muted center-text">Loading…</p>
  if (data.error) return <p className="error">Could not load jars: {data.error}. Has the latest SQL migration been run?</p>
  return member?.role === 'parent'
    ? <ParentView data={data} onChange={data.reload} />
    : <ChildView childId={member!.user_id} data={data} onChange={data.reload} />
}

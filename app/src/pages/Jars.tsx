import { useAuth } from '../auth'
import { useJars } from '../lib/jars'
import ChildView from '../components/ChildView'
import ParentView from '../components/ParentView'

export default function Jars() {
  const { member } = useAuth()
  const data = useJars()
  if (data.loading) return <p className="muted center-text">Loading…</p>
  if (data.error) return <p className="error">Could not load jars: {data.error}. Has the latest SQL migration been run?</p>
  return member?.role === 'parent'
    ? <ParentView data={data} onChange={data.reload} />
    : <ChildView childId={member!.user_id} data={data} onChange={data.reload} />
}

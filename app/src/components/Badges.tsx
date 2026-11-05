import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BADGES } from '../lib/goals'

type Stats = { streak: number; best_streak: number; badges: { id: string }[] }

/** Streak + badges for one child. A child passes nothing; a parent passes the child's id. */
export default function Badges({ childId }: { childId?: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    supabase.rpc('child_stats', { c: childId ?? null }).then(r => { if (!r.error) setStats(r.data as Stats) })
  }, [childId])
  if (!stats) return null
  const earned = new Set(stats.badges.map(b => b.id))
  return (
    <section className="card">
      <h2>Badges</h2>
      {stats.streak > 0 && <p className="good">🔥 {stats.streak}-week saving streak!</p>}
      <div className="badges">
        {Object.entries(BADGES).map(([id, b]) => (
          <div key={id} className={`badge ${earned.has(id) ? 'on' : ''}`} title={b.how}>
            <div className="badge-emoji">{earned.has(id) ? b.emoji : '🔒'}</div>
            <div className="badge-name">{b.name}</div>
            <div className="muted small">{b.how}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

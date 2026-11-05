import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Goal = {
  id: string; name: string; emoji: string; target_cents: number; deadline: string | null
  status: 'active' | 'reached' | 'cancelled'; created_at: string; reached_on: string | null
}
export type Contribution = { id: string; goal_id: string; member_id: string; amount_cents: number; source: 'cash' | 'save_jar'; created_at: string }

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [contribs, setContribs] = useState<Contribution[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    const [g, c, m] = await Promise.all([
      supabase.from('goals').select('*').order('created_at', { ascending: false }),
      supabase.from('goal_contributions').select('*').order('created_at'),
      supabase.from('members').select('user_id, display_name'),
    ])
    const failed = [g, c, m].find(x => x.error)
    if (failed?.error) setError(failed.error.message)
    setGoals(g.data ?? []); setContribs(c.data ?? [])
    setNames(Object.fromEntries((m.data ?? []).map(x => [x.user_id, x.display_name])))
    setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { goals, contribs, names, loading, error, reload }
}

const DAY = 86_400_000
const WINDOW_WEEKS = 8

export type Estimate = { perWeek: number; weeksLeft: number; date: Date } | null

/**
 * Pace = money added per week, averaged over the last 8 weeks (or since the first contribution
 * if that was more recent, never less than one week). `extraPerWeek` powers the "what if" slider.
 */
export function estimate(contribs: { amount_cents: number; created_at: string }[], remainingCents: number, now = new Date(), extraPerWeek = 0): Estimate {
  if (remainingCents <= 0) return null
  const since = now.getTime() - WINDOW_WEEKS * 7 * DAY
  const recent = contribs.filter(c => new Date(c.created_at).getTime() >= since)
  let pace = 0
  if (recent.length) {
    const first = Math.min(...recent.map(c => new Date(c.created_at).getTime()))
    const weeks = Math.min(WINDOW_WEEKS, Math.max(1, (now.getTime() - first) / (7 * DAY)))
    pace = recent.reduce((s, c) => s + c.amount_cents, 0) / weeks
  }
  const perWeek = pace + extraPerWeek
  if (perWeek <= 0) return null
  const weeksLeft = remainingCents / perWeek
  return { perWeek, weeksLeft, date: new Date(now.getTime() + Math.ceil(weeksLeft * 7) * DAY) }
}

/** Cents per week needed to reach the goal by its deadline (null when there is no usable deadline). */
export function neededPerWeek(remainingCents: number, deadline: string | null, now = new Date()): number | null {
  if (!deadline || remainingCents <= 0) return null
  const weeks = (new Date(deadline + 'T23:59:59').getTime() - now.getTime()) / (7 * DAY)
  return weeks > 0 ? remainingCents / weeks : null
}

export const BADGES: Record<string, { emoji: string; name: string; how: string }> = {
  first_save: { emoji: '🌱', name: 'First saver', how: 'Moved money into Save' },
  streak_4: { emoji: '🔥', name: '4-week streak', how: 'Saved 4 weeks in a row' },
  generous: { emoji: '💝', name: 'Generous', how: 'Gave to others' },
  goal_getter: { emoji: '🎯', name: 'Goal getter', how: 'Helped a family goal' },
  goal_reached: { emoji: '🏆', name: 'Goal reached', how: 'Part of a finished goal' },
  big_saver: { emoji: '💎', name: 'Big saver', how: '€50 in the Save jar' },
}

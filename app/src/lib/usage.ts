import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase'

/** The screens that are counted (the same list the database accepts). Only which screen, never what was on it. */
export type Screen = 'home' | 'review' | 'plan' | 'jars' | 'goals' | 'settings'

/** Which counted screen an address belongs to, or null (the old /budgets redirect, unknown addresses). */
export function screenOf(pathname: string): Screen | null {
  if (pathname === '/' || pathname === '') return 'home'
  const first = pathname.split('/')[1]
  return (['review', 'plan', 'jars', 'goals', 'settings'] as const).find(s => s === first) ?? null
}

const sent = new Set<string>()

/**
 * Tells the database a screen was opened (first-party usage counts for the KPI queries, see docs/kpi-queries.sql).
 * Once per screen and person per page load, in the background; a failure is ignored and never shown.
 */
export function useTrackScreens(memberId: string | undefined) {
  const { pathname } = useLocation()
  useEffect(() => {
    const screen = screenOf(pathname)
    if (!memberId || !screen) return
    const key = `${memberId}:${screen}`
    if (sent.has(key)) return
    sent.add(key)
    void Promise.resolve(supabase.rpc('record_usage', { screen })).catch(() => sent.delete(key))
  }, [memberId, pathname])
}

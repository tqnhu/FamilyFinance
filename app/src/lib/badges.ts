import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from '../auth'
import { SOON_DAYS, dueBillCount, upcoming, type Bill, type Payment } from './bills'
import { getLocal } from './local'
import { DATA_CHANGED, announceChange } from './events'

export { DATA_CHANGED, announceChange }

/** When a child last looked at their Jars page, kept on this device. */
export const jarsSeenKey = (userId: string) => `ff:jars-seen:${userId}`

/** "" for none, the number up to 9, then "9+". */
export const badgeText = (n: number) => (n <= 0 ? '' : n > 9 ? '9+' : String(n))

const DAY = 86_400_000
export const DECISION_WINDOW_DAYS = 14
export const BILL_WINDOW_DAYS = SOON_DAYS

/**
 * How many of a child's requests were answered (yes or no) since they last looked at Jars.
 * Answers older than two weeks never count, so a new device does not greet a child with a pile of old news.
 */
export function unseenAnswers(rows: { status: string; decided_at: string | null }[], lastSeen: string | null, now = new Date()): number {
  const floor = Math.max(now.getTime() - DECISION_WINDOW_DAYS * DAY, lastSeen ? new Date(lastSeen).getTime() || 0 : 0)
  return rows.filter(r => (r.status === 'approved' || r.status === 'declined') && r.decided_at && new Date(r.decided_at).getTime() > floor).length
}

export type Badges = { jars: number; plan: number }
const none: Badges = { jars: 0, plan: 0 }

/**
 * Counts for the tab bar. Parents: purchase requests waiting for them (Jars), and bills overdue or due within a week (Plan).
 * Children: answers to their requests that they have not seen (Jars). Refreshes on navigation, when the app comes back to the
 * front, and when a page announces a change. It never polls.
 */
export function useBadges(): Badges {
  const { member } = useAuth()
  const loc = useLocation()
  const [badges, setBadges] = useState<Badges>(none)

  const refresh = useCallback(async () => {
    if (!member) return setBadges(none)
    if (member.role === 'parent') {
      const [req, bills, pays] = await Promise.all([
        supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bills').select('*'),
        supabase.from('bill_payments').select('id, bill_id, due_on, expense_id'),
      ])
      const due = dueBillCount(upcoming((bills.data ?? []) as Bill[], (pays.data ?? []) as unknown as Payment[], new Date(), BILL_WINDOW_DAYS))
      setBadges({ jars: req.count ?? 0, plan: due })
    } else {
      const since = new Date(Date.now() - DECISION_WINDOW_DAYS * DAY).toISOString()
      const { data } = await supabase.from('purchase_requests').select('status, decided_at').in('status', ['approved', 'declined']).gt('decided_at', since)
      setBadges({ jars: unseenAnswers(data ?? [], getLocal(jarsSeenKey(member.user_id))), plan: 0 })
    }
  }, [member])

  useEffect(() => { void refresh() }, [refresh, loc.pathname])
  useEffect(() => {
    const again = () => { if (document.visibilityState !== 'hidden') void refresh() }
    window.addEventListener('focus', again); document.addEventListener('visibilitychange', again); window.addEventListener(DATA_CHANGED, again)
    return () => { window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); window.removeEventListener(DATA_CHANGED, again) }
  }, [refresh])
  return badges
}

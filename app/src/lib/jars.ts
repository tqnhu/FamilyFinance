import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Allowance, JarEntry, Member, PurchaseRequest, Jar } from './types'

export const JARS: { id: Jar; label: string; emoji: string; hint: string }[] = [
  { id: 'spend', label: 'Spend', emoji: '🛍️', hint: 'for things I want now' },
  { id: 'save', label: 'Save', emoji: '🐷', hint: 'for something big later' },
  { id: 'give', label: 'Give', emoji: '🎁', hint: 'to share with others' },
]

export type JarData = {
  kids: Member[]
  balances: Record<string, Record<Jar, number>> // child id -> jar -> cents
  requests: PurchaseRequest[]
  entries: JarEntry[]
  allowances: Record<string, Allowance>
}

const empty: JarData = { kids: [], balances: {}, requests: [], entries: [], allowances: {} }

/** Loads everything the Jars screens need. RLS decides what each person can see. */
export function useJars() {
  const [data, setData] = useState<JarData>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    await supabase.rpc('settle_allowance') // pays any allowance that is due; safe to repeat
    const [k, b, r, e, a] = await Promise.all([
      supabase.from('members').select('*').eq('role', 'child').order('display_name'),
      supabase.from('jar_balances').select('child_id, jar, balance_cents'),
      supabase.from('purchase_requests').select('*').order('created_at', { ascending: false }).limit(60),
      supabase.from('jar_entries').select('*').order('created_at', { ascending: false }).limit(150),
      supabase.from('allowances').select('*'),
    ])
    const failed = [k, b, r, e, a].find(x => x.error)
    if (failed?.error) setError(failed.error.message)
    const balances: JarData['balances'] = {}
    for (const row of b.data ?? []) {
      balances[row.child_id] ??= { spend: 0, save: 0, give: 0 }
      balances[row.child_id][row.jar as Jar] = row.balance_cents
    }
    setData({
      kids: k.data ?? [], balances, requests: r.data ?? [], entries: e.data ?? [],
      allowances: Object.fromEntries((a.data ?? []).map(x => [x.child_id, x])),
    })
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])
  return { ...data, loading, error, reload }
}

export const zero = { spend: 0, save: 0, give: 0 }

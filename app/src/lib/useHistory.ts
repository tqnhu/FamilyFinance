import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { buildHistory, type History } from './classify'

/**
 * What this person's family has already categorised (their latest 1,000 notes), as the index the suggestions learn from.
 * What comes back follows the database's row-level rules, so a child only gets their own history.
 */
export function useHistory(enabled = true): History {
  const [history, setHistory] = useState<History>(new Map())
  useEffect(() => {
    if (!enabled) return
    let alive = true
    void supabase.from('expenses').select('note, category_id').not('category_id', 'is', null).order('spent_on', { ascending: false }).limit(1000)
      .then(r => { if (alive) setHistory(buildHistory(r.data ?? [])) })
    return () => { alive = false }
  }, [enabled])
  return history
}

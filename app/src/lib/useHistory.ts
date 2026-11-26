import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { buildHistory, type History } from './classify'

export type Note = { note: string; category_id: string | null }

/**
 * What this person's family has already categorised (their latest 1,000 notes), as the index the suggestions learn from,
 * and the notes themselves (used to spot patterns worth turning into rules).
 * What comes back follows the database's row-level rules, so a child only gets their own history.
 */
export function useHistory(enabled = true): { history: History; notes: Note[] } {
  const [state, setState] = useState<{ history: History; notes: Note[] }>({ history: new Map(), notes: [] })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    void supabase.from('expenses').select('note, category_id').not('category_id', 'is', null).order('spent_on', { ascending: false }).limit(1000)
      .then(r => { if (alive) { const notes = (r.data ?? []) as Note[]; setState({ history: buildHistory(notes), notes }) } })
    return () => { alive = false }
  }, [enabled])
  return state
}

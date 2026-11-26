import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../auth'

export type Tag = { id: string; name: string; archived: boolean }

/** The family's tags, and a way to make a new one. Tags are family-wide: everyone can see and use them. */
export function useTags() {
  const { member } = useAuth()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('tags').select('id, name, archived').order('name')
    setTags((data ?? []) as Tag[]); setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])

  /** Creates a tag, or returns the existing one with the same name (ignoring case and spaces). */
  const create = useCallback(async (raw: string): Promise<Tag> => {
    const name = raw.trim().replace(/\s+/g, ' ')
    if (!name) throw new Error('Type a name for the tag.')
    if (name.length > 40) throw new Error('A tag name can have at most 40 characters.')
    const same = (t: Tag) => t.name.trim().toLowerCase() === name.toLowerCase()
    const known = tags.find(same)
    if (known) { if (known.archived) await supabase.from('tags').update({ archived: false }).eq('id', known.id); void reload(); return { ...known, archived: false } }
    const { data, error } = await supabase.from('tags').insert({ family_id: member!.family_id, name, created_by: member!.user_id }).select('id, name, archived').single()
    if (error) {
      if (error.code === '23505') { // someone else just made it
        const { data: again } = await supabase.from('tags').select('id, name, archived').order('name')
        const hit = (again ?? []).find(same); if (hit) { setTags(again as Tag[]); return hit as Tag }
      }
      throw new Error(error.message)
    }
    void reload()
    return data as Tag
  }, [tags, member, reload])

  return { tags, loading, reload, create }
}

import { supabase } from './supabase'
import { chunk } from './expense'

/** An expense can carry up to this many tags (the database enforces it too). */
export const MAX_TAGS = 5

/** The columns to ask for so every expense comes with its tags (from the join table expense_tags). */
export const WITH_TAGS = '*, expense_tags(tag_id)'

/** Turns the embedded join rows into a plain `tag_ids` list. */
export function withTags<T extends object>(rows: T[] | null | undefined): (Omit<T, 'expense_tags'> & { tag_ids: string[] })[] {
  return (rows ?? []).map(r => {
    const { expense_tags, ...rest } = r as T & { expense_tags?: { tag_id: string }[] | null }
    return { ...rest, tag_ids: (expense_tags ?? []).map(x => x.tag_id) } as Omit<T, 'expense_tags'> & { tag_ids: string[] }
  })
}

/** Difference between the saved tags and the chosen ones. */
export const tagDiff = (old: string[], now: string[]) => ({
  add: now.filter(t => !old.includes(t)),
  remove: old.filter(t => !now.includes(t)),
})

const REQUEST = 100

/** Saves the tags of one expense: removes the ones taken off, adds the new ones. Returns an error message, or null. */
export async function saveTags(expenseId: string, old: string[], now: string[]): Promise<string | null> {
  const { add, remove } = tagDiff(old, now)
  if (remove.length) {
    const r = await supabase.from('expense_tags').delete().eq('expense_id', expenseId).in('tag_id', remove)
    if (r.error) return r.error.message
  }
  if (add.length) {
    const r = await supabase.from('expense_tags').insert(add.map(tag_id => ({ expense_id: expenseId, tag_id })))
    if (r.error) return r.error.message
  }
  return null
}

/** Puts the tag on many expenses (the ones that already have it are left alone). Returns how many now carry it, or the error. */
export async function addTagToMany(ids: string[], tagId: string): Promise<{ n: number; error?: string }> {
  let n = 0
  for (const part of chunk(ids, REQUEST)) {
    const r = await supabase.from('expense_tags').upsert(part.map(expense_id => ({ expense_id, tag_id: tagId })), { onConflict: 'expense_id,tag_id', ignoreDuplicates: true }).select('expense_id')
    if (r.error) return { n, error: r.error.message }
    n += part.length
  }
  return { n }
}

/** Takes one tag (or every tag, when none is given) off many expenses. */
export async function removeTagFromMany(ids: string[], tagId?: string): Promise<{ n: number; error?: string }> {
  let n = 0
  for (const part of chunk(ids, REQUEST)) {
    let q = supabase.from('expense_tags').delete().in('expense_id', part)
    if (tagId) q = q.eq('tag_id', tagId)
    const r = await q.select('expense_id')
    if (r.error) return { n, error: r.error.message }
    n += new Set((r.data ?? []).map(x => x.expense_id as string)).size
  }
  return { n }
}

/**
 * The expenses of a period that carry ALL the chosen tags (or none at all, when asked for untagged), newest first,
 * with all their tags. `error` is set when a request failed.
 */
export async function fetchByTags(from: string, to: string, ids: string[], untagged: boolean, limit: number): Promise<{ rows: (Record<string, unknown> & { id: string; tag_ids: string[] })[]; error?: string }> {
  const r = await supabase.rpc('expenses_with_tags', { from_d: from, to_d: to, tag_ids: ids, include_untagged: untagged, max_rows: limit })
  if (r.error) return { rows: [], error: r.error.message }
  const found = (r.data ?? []) as (Record<string, unknown> & { id: string })[]
  const tagsBy = new Map<string, string[]>()
  for (const part of chunk(found.map(x => x.id), 100)) {
    const t = await supabase.from('expense_tags').select('expense_id, tag_id').in('expense_id', part)
    if (t.error) return { rows: [], error: t.error.message }
    for (const y of t.data ?? []) tagsBy.set(y.expense_id as string, [...(tagsBy.get(y.expense_id as string) ?? []), y.tag_id as string])
  }
  return { rows: found.map(x => ({ ...x, tag_ids: tagsBy.get(x.id) ?? [] })) }
}

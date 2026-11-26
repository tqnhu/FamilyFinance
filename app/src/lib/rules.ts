import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../auth'
import { normalizeText, type Rule } from './classify'

export type { Rule } from './classify'

/** The family's classification rules. Everyone in the family can read them (suggestions are shown to children too). */
export function useRules(enabled = true) {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    if (!enabled) return
    const { data } = await supabase.from('classification_rules').select('id, pattern, min_cents, max_cents, category_id, tag_id, annual_fee, status').order('created_at', { ascending: false })
    setRules((data ?? []) as Rule[]); setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { rules, loading, reload }
}

export type RuleInput = { pattern: string; min_cents: number | null; max_cents: number | null; category_id: string; tag_id: string | null; annual_fee: boolean }

/** Checks what a person typed. Returns the cleaned rule or a sentence to show. */
export function checkRule(input: { pattern: string; min: string; max: string; category: string; tag: string; annual: boolean }, parse: (s: string) => number | null): RuleInput | string {
  const pattern = normalizeText(input.pattern)
  if (pattern.length < 2) return 'Type at least 2 characters that appear in the description.'
  if (pattern.length > 60) return 'The text to look for can have at most 60 characters.'
  const min = input.min.trim() ? parse(input.min) : null, max = input.max.trim() ? parse(input.max) : null
  if (input.min.trim() && min === null) return 'The smallest amount is not a valid amount.'
  if (input.max.trim() && max === null) return 'The largest amount is not a valid amount.'
  if (min !== null && max !== null && min > max) return 'The smallest amount cannot be more than the largest.'
  if (!input.category) return 'Choose a category.'
  return { pattern, min_cents: min, max_cents: max, category_id: input.category, tag_id: input.tag || null, annual_fee: input.annual }
}

/** Adds a rule as the signed-in parent. Resolves to an error message, or null when it worked. */
export function useRuleActions(reload: () => Promise<void>) {
  const { member } = useAuth()
  const add = useCallback(async (r: RuleInput, status: 'on' | 'dismissed' = 'on'): Promise<string | null> => {
    const { error } = await supabase.from('classification_rules').insert({ ...r, family_id: member!.family_id, created_by: member!.user_id, status })
    if (error) return error.code === '23505' ? 'There is already a rule with the same text and amounts.' : error.message
    await reload(); return null
  }, [member, reload])
  const change = useCallback(async (id: string, patch: Partial<RuleInput> & { status?: 'on' | 'off' | 'dismissed' }): Promise<string | null> => {
    const { data, error } = await supabase.from('classification_rules').update(patch).eq('id', id).select('id')
    if (error) return error.code === '23505' ? 'There is already a rule with the same text and amounts.' : error.message
    if (!data?.length) return 'That rule could not be changed. You may not be allowed to.'
    await reload(); return null
  }, [reload])
  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { data, error } = await supabase.from('classification_rules').delete().eq('id', id).select('id')
    if (error) return error.message
    if (!data?.length) return 'That rule could not be deleted. You may not be allowed to.'
    await reload(); return null
  }, [reload])
  return { add, change, remove }
}

import type { Tag } from './tags'

/**
 * The tag filter on Review. A choice is a list of tag ids, or just the word 'none' for "No tag". Empty means everything.
 * Several tags narrow the view: an expense shows only when it has ALL the chosen tags. "No tag" stands alone (an expense cannot
 * have a tag and no tag), so choosing it clears the tags and choosing a tag clears it.
 */
export const NO_TAG_CHOICE = 'none'

export const matchesTags = (x: { tag_ids?: string[] }, choice: string[]): boolean => {
  if (choice.length === 0) return true
  if (choice.includes(NO_TAG_CHOICE)) return !x.tag_ids?.length
  return choice.every(t => x.tag_ids?.includes(t))
}

export const filterByTags = <T extends { tag_ids?: string[] }>(rows: T[], choice: string[]): T[] =>
  choice.length === 0 ? rows : rows.filter(x => matchesTags(x, choice))

/** For the database: the tag ids, and whether untagged expenses are included. */
export const splitChoice = (choice: string[]) => ({ ids: choice.filter(c => c !== NO_TAG_CHOICE), untagged: choice.includes(NO_TAG_CHOICE) })

export const toggleChoice = (choice: string[], id: string): string[] =>
  choice.includes(id) ? choice.filter(c => c !== id) : id === NO_TAG_CHOICE ? [NO_TAG_CHOICE] : [...choice.filter(c => c !== NO_TAG_CHOICE), id]

/** "#Vietnam trip", "#Party and no tag", "#A, #B and #C". A tag that no longer exists is left out. */
export function describeChoice(choice: string[], tags: Pick<Tag, 'id' | 'name'>[]): string {
  const names = choice.map(c => (c === NO_TAG_CHOICE ? 'no tag' : tags.find(t => t.id === c) ? `#${tags.find(t => t.id === c)!.name}` : '')).filter(Boolean)
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

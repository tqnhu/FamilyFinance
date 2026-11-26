import type { Tag } from './tags'

/**
 * The tag filter on Review. A choice is a list of tag ids, and the word 'none' for "No tag". Empty means everything.
 * Several choices are a union: an expense shows when it has ANY chosen tag. An expense with several tags still shows once.
 */
export const NO_TAG_CHOICE = 'none'

export const matchesTags = (x: { tag_ids?: string[] }, choice: string[]): boolean =>
  choice.length === 0 || (x.tag_ids?.length ? x.tag_ids.some(t => choice.includes(t)) : choice.includes(NO_TAG_CHOICE))

export const filterByTags = <T extends { tag_ids?: string[] }>(rows: T[], choice: string[]): T[] =>
  choice.length === 0 ? rows : rows.filter(x => matchesTags(x, choice))

/** For the database: the tag ids, and whether untagged expenses are included. */
export const splitChoice = (choice: string[]) => ({ ids: choice.filter(c => c !== NO_TAG_CHOICE), untagged: choice.includes(NO_TAG_CHOICE) })

export const toggleChoice = (choice: string[], id: string): string[] => (choice.includes(id) ? choice.filter(c => c !== id) : [...choice, id])

/** "#Vietnam trip", "#Party and no tag", "#A, #B and #C". A tag that no longer exists is left out. */
export function describeChoice(choice: string[], tags: Pick<Tag, 'id' | 'name'>[]): string {
  const names = choice.map(c => (c === NO_TAG_CHOICE ? 'no tag' : tags.find(t => t.id === c) ? `#${tags.find(t => t.id === c)!.name}` : '')).filter(Boolean)
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

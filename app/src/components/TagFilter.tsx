import type { Tag } from '../lib/tags'
import { NO_TAG_CHOICE, toggleChoice } from '../lib/tagfilter'

/** Chips under the period arrows: All spending, then each tag, then No tag. Several tags can be on: an expense must have all of them. */
export default function TagFilter({ tags, choice, onChange }: { tags: Tag[]; choice: string[]; onChange: (c: string[]) => void }) {
  const shown = tags.filter(t => !t.archived || choice.includes(t.id))
  return (
    <div className="tagfilter" role="group" aria-label="Filter by tag">
      <span className="tagfilter-label">Tag</span>
      <div className="tagfilter-chips">
        <button className={`chip ${choice.length === 0 ? 'on' : ''}`} aria-pressed={choice.length === 0} onClick={() => onChange([])}>All spending</button>
        {shown.map(t => {
          const on = choice.includes(t.id)
          return <button key={t.id} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(toggleChoice(choice, t.id))}>{on ? '✓ ' : ''}#{t.name}{t.archived ? ' (archived)' : ''}</button>
        })}
        <button className={`chip ${choice.includes(NO_TAG_CHOICE) ? 'on' : ''}`} aria-pressed={choice.includes(NO_TAG_CHOICE)} onClick={() => onChange(toggleChoice(choice, NO_TAG_CHOICE))}>{choice.includes(NO_TAG_CHOICE) ? '✓ ' : ''}No tag</button>
      </div>
    </div>
  )
}

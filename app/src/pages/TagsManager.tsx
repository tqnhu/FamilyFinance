import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTags, type Tag } from '../lib/tags'

/** Settings → Configuration: rename, archive and restore tags. Tags are made while adding an expense, in the import and on bills. */
export default function TagsManager() {
  const { tags, reload } = useTags()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [showArchived, setShowArchived] = useState(false)
  const [msg, setMsg] = useState('')

  const loadCounts = useCallback(async () => {
    const r = await supabase.rpc('tag_totals', { from_d: null, to_d: null })
    if (r.error) return
    setCounts(Object.fromEntries(((r.data ?? []) as { tag_id: string | null; n: number }[]).filter(x => x.tag_id).map(x => [x.tag_id!, Number(x.n)])))
  }, [])
  useEffect(() => { void loadCounts() }, [loadCounts])

  const active = tags.filter(t => !t.archived), archived = tags.filter(t => t.archived)
  const count = (t: Tag) => { const n = counts[t.id] ?? 0; return `${n} ${n === 1 ? 'expense' : 'expenses'}` }

  async function rename(t: Tag) {
    const name = prompt('Rename this tag', t.name)?.trim().replace(/\s+/g, ' ')
    if (!name || name === t.name) return
    if (name.length > 40) return setMsg('A tag name can have at most 40 characters.')
    const { error } = await supabase.from('tags').update({ name }).eq('id', t.id)
    setMsg(error ? (error.code === '23505' ? 'You already have a tag with that name.' : error.message) : '')
    if (!error) void reload()
  }
  async function archive(t: Tag) {
    if (!confirm(`Archive "${t.name}"? Its expenses keep the tag and stay in the totals. It just stops being offered for new expenses.`)) return
    const { error } = await supabase.from('tags').update({ archived: true }).eq('id', t.id)
    setMsg(error ? error.message : ''); if (!error) void reload()
  }
  async function restore(t: Tag) {
    const { error } = await supabase.from('tags').update({ archived: false }).eq('id', t.id)
    setMsg(error ? error.message : ''); if (!error) void reload()
  }

  return (
    <>
      <section className="card">
        <div className="row"><h2>Tags</h2><span className="muted small">{active.length} in use</span></div>
        <p className="muted small">Tags group expenses, such as a trip or a project. Choose one in Review to see what it cost. Archiving hides a tag from new expenses; its expenses keep it and stay in the totals.</p>
        {msg && <p className="error" role="alert">{msg}</p>}
        {active.length === 0 && <p className="muted">No tags yet. Make one while adding an expense.</p>}
        {active.map(t => (
          <div key={t.id} className="item tag-row">
            <div className="tag-name"><strong>#{t.name}</strong><span className="muted small">{count(t)}</span></div>
            <button onClick={() => void rename(t)} aria-label={`Rename #${t.name}`}>Rename</button>
            <button onClick={() => void archive(t)} aria-label={`Archive #${t.name}`}>Archive</button>
          </div>
        ))}
        {archived.length > 0 && (
          <>
            <button className="bd-row static-toggle" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>
              <span>Archived tags ({archived.length})</span><span aria-hidden="true">{showArchived ? '⌃' : '⌄'}</span>
            </button>
            {showArchived && archived.map(t => (
              <div key={t.id} className="item tag-row">
                <div className="tag-name"><strong className="muted">#{t.name}</strong><span className="muted small">{count(t)}</span></div>
                <button onClick={() => void rename(t)} aria-label={`Rename #${t.name}`}>Rename</button>
                <button onClick={() => void restore(t)} aria-label={`Restore #${t.name}`}>Restore</button>
              </div>
            ))}
          </>
        )}
      </section>
    </>
  )
}

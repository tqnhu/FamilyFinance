import type { Slice } from '../lib/breakdown'

/** One bar that shows every slice at once. */
export default function ShareBar({ slices, label }: { slices: Slice[]; label: string }) {
  return (
    <div className="bd-bar" role="img" aria-label={label}>
      {slices.map(s => <div key={s.id} title={`${s.name} ${s.pct.toFixed(1)}%`} style={{ flex: `${s.cents} 1 0%`, background: s.color }} />)}
    </div>
  )
}

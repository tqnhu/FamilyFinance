import { euro } from '../lib/money'

/** A budget progress bar: green, amber from 80%, red when over. */
export default function Bar({ spent, budget, label }: { spent: number; budget: number; label?: string }) {
  const pct = Math.min(100, Math.round((spent / budget) * 100))
  const state = spent > budget ? 'over' : spent >= budget * 0.8 ? 'warn' : 'ok'
  return (
    <div>
      <div className="bar"><div className={`fill ${state}`} style={{ width: `${pct}%` }} /></div>
      {label && <div className="muted small">{label}</div>}
      {state === 'over' && <div className="small error">Over budget by {euro(spent - budget)}</div>}
    </div>
  )
}

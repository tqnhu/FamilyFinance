import type { Chart } from '../lib/chartChoice'

/** Bars | Pie (| Flow on wide screens). */
export default function ChartToggle({ value, onChange, flow = false }: { value: Chart; onChange: (c: Chart) => void; flow?: boolean }) {
  const opts: [Chart, string][] = [['bars', 'Bars'], ['pie', 'Pie'], ...(flow ? [['flow', 'Flow'] as [Chart, string]] : [])]
  return (
    <div className="seg small-seg" role="group" aria-label="How to show it">
      {opts.map(([id, label]) => <button key={id} aria-pressed={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>)}
    </div>
  )
}

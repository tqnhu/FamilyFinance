import { pieLayout, type PieInput } from '../lib/pie'

/** Shares as a pie. Every slice has a leader line with its name and share, so it reads without a legend. */
export default function PieChart({ slices, label }: { slices: PieInput[]; label: string }) {
  const p = pieLayout(slices)
  return (
    <svg className="pie" viewBox={`0 0 ${p.width} ${p.height}`} role="img" aria-label={label}>
      {p.slices.map(s => <path key={s.id} d={s.d} fill={s.color} className="pie-slice" />)}
      {p.slices.map(s => (
        <g key={s.id}>
          <polyline points={s.label.line} className="pie-lead" />
          <text x={s.label.x} y={s.label.y - 1} textAnchor={s.label.side === 'r' ? 'start' : 'end'} className="pie-name">{s.label.name}</text>
          <text x={s.label.x} y={s.label.y + 12} textAnchor={s.label.side === 'r' ? 'start' : 'end'} className="pie-pct">{s.label.pct}</text>
        </g>
      ))}
    </svg>
  )
}

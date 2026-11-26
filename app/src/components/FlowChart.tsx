import { flowLayout } from '../lib/flow'
import { euroTidy } from '../lib/money'
import type { Slice } from '../lib/breakdown'

/** All spending flowing into its categories. Heights are drawn to scale; the list below the chart has the same numbers. */
export default function FlowChart({ slices, total, title }: { slices: Slice[]; total: number; title: string }) {
  const f = flowLayout(slices.map(s => ({ id: s.id, name: s.name, color: s.color, cents: s.cents, pct: s.pct })))
  const label = `${title}: ${euroTidy(total)} flowing into ${slices.map(s => `${s.name} ${euroTidy(s.cents)}`).join(', ')}`
  return (
    <svg className="flow" viewBox={`0 0 ${f.width} ${f.height}`} role="img" aria-label={label}>
      {f.ribbons.map(r => <path key={r.id} d={r.d} fill={r.color} fillOpacity={0.28} />)}
      <rect x={f.leftX} y={f.left.y} width={f.leftW} height={f.left.h} className="flow-total" />
      {f.nodes.map(n => (
        <g key={n.id}>
          <rect x={f.rightX} y={n.y} width={f.rightW} height={Math.max(n.h, 2)} fill={n.color} />
          <text x={f.rightX + f.rightW + 10} y={n.labelY - 3} className="flow-name">{n.name}</text>
          <text x={f.rightX + f.rightW + 10} y={n.labelY + 14} className="flow-val">{euroTidy(n.cents)} · {n.pct.toFixed(1)}%</text>
        </g>
      ))}
      <text x={f.leftX + f.leftW + 10} y={f.left.y + f.left.h / 2 - 3} className="flow-name">{euroTidy(total)}</text>
      <text x={f.leftX + f.leftW + 10} y={f.left.y + f.left.h / 2 + 14} className="flow-val">spent</text>
    </svg>
  )
}

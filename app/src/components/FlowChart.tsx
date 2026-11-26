import { flowLayout } from '../lib/flow'
import { euroTidy } from '../lib/money'
import type { Slice } from '../lib/breakdown'

/** All spending flowing into its categories. Heights are drawn to scale; the list below the chart has the same numbers. */
export default function FlowChart({ slices, total, title, pickedId }: { slices: Slice[]; total: number; title: string; pickedId?: string }) {
  // With a picked category the diagram has a third level (what that category is made of) and uses the width of a wide screen.
  const picked = pickedId ? slices.find(s => s.id === pickedId) : undefined
  const detail = picked && picked.details.length ? { id: picked.id, items: picked.details.map(d => ({ id: `${picked.id}/${d.name}`, name: d.name, color: picked.color, cents: d.cents, pct: d.pct })) } : undefined
  const f = pickedId
    ? flowLayout(slices.map(s => ({ id: s.id, name: s.name, color: s.color, cents: s.cents, pct: s.pct })), { width: 760, bodyHeight: 380, gap: 14, pad: 17, col2: 270, col3: 540, detail })
    : flowLayout(slices.map(s => ({ id: s.id, name: s.name, color: s.color, cents: s.cents, pct: s.pct })))
  const parts = picked && f.detail ? `. ${picked.name} is made of ${picked.details.map(d => `${d.name} ${euroTidy(d.cents)}`).join(', ')}` : ''
  const label = `${title}: ${euroTidy(total)} flowing into ${slices.map(s => `${s.name} ${euroTidy(s.cents)}`).join(', ')}${parts}`
  const pctText = (p: number) => (picked?.group ? `${p.toFixed(1)}%` : `${Math.round(p)}%`)
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
      {f.detail && f.nodes.filter(n => n.id === f.detail!.pickedId).map(n => <rect key="pick" x={f.rightX - 2} y={n.y - 2} width={f.rightW + 4} height={n.h + 4} className="flow-pick" rx={2} />)}
      {f.detail && (
        <g>
          {f.detail.ribbons.map(r => <path key={r.id} d={r.d} fill={picked!.color} fillOpacity={0.28} />)}
          {f.detail.nodes.map(n => (
            <g key={n.id}>
              <rect x={f.detail!.x} y={n.y} width={f.detail!.w} height={Math.max(n.h, 2)} fill={picked!.color} />
              <text x={f.detail!.x + f.detail!.w + 10} y={n.labelY + 4} className="flow-val"><tspan className="flow-strong">{n.name}</tspan> {euroTidy(n.cents)} · {pctText(n.pct)}</text>
            </g>
          ))}
          <text x={f.detail.x} y={Math.max(...f.detail.nodes.map(n => n.y + n.h)) + 28} className="flow-note">
            <tspan x={f.detail.x}>{picked!.group ? `Inside ${picked!.name}` : `Tags in ${picked!.name}`}</tspan>
            <tspan x={f.detail.x} dy="16">{picked!.group ? 'share of all spending' : 'share of the category'}</tspan>
            <tspan x={f.detail.x} dy="16">Pick another category to see its tags.</tspan>
          </text>
        </g>
      )}
      <text x={f.leftX + f.leftW + 10} y={f.left.y + f.left.h / 2 - 3} className="flow-name">{euroTidy(total)}</text>
      <text x={f.leftX + f.leftW + 10} y={f.left.y + f.left.h / 2 + 14} className="flow-val">spent</text>
    </svg>
  )
}

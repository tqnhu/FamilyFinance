/** Geometry for the pie chart: one slice per category, each with a leader line to its name and share. */

export type PieInput = { id: string; name: string; cents: number; pct: number; color: string }
export type PieLabel = { name: string; pct: string; side: 'l' | 'r'; line: string; x: number; y: number }
export type PieSlice = PieInput & { d: string; label: PieLabel }
export type Pie = { width: number; height: number; slices: PieSlice[] }

const r2 = (n: number) => Math.round(n * 100) / 100
const short = (s: string) => (s.length > 18 ? s.slice(0, 17) + '…' : s)

export function pieLayout(items: PieInput[], o: { width?: number; height?: number; r?: number; lead?: number; tick?: number; gap?: number } = {}): Pie {
  const width = o.width ?? 340, height = o.height ?? 250, r = o.r ?? 78, lead = o.lead ?? 16, tick = o.tick ?? 10, gap = o.gap ?? 28
  const cx = width / 2, cy = height / 2 - 3
  const live = items.filter(i => i.cents > 0)
  const total = live.reduce((s, i) => s + i.cents, 0)
  if (total <= 0) return { width, height, slices: [] }
  const pt = (a: number, rad: number): [number, number] => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)]

  let start = 0
  const raw = live.map(it => {
    const frac = it.cents / total, a0 = start * 2 * Math.PI, a1 = (start + frac) * 2 * Math.PI
    start += frac
    const mid = (a0 + a1) / 2
    let d: string
    if (frac >= 0.9999) d = `M${cx} ${r2(cy - r)} A${r} ${r} 0 1 1 ${cx} ${r2(cy + r)} A${r} ${r} 0 1 1 ${cx} ${r2(cy - r)} Z`
    else { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); d = `M${cx} ${cy} L${r2(x0)} ${r2(y0)} A${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${r2(x1)} ${r2(y1)} Z` }
    const side: 'l' | 'r' = Math.sin(mid) >= 0 ? 'r' : 'l'
    const edge = pt(mid, r), elbow = pt(mid, r + lead)
    return { it, d, side, edge, elbow, y: elbow[1], endX: elbow[0] + (side === 'r' ? tick : -tick) }
  })

  // labels on one side must not touch: push them apart, keeping them inside the picture
  for (const side of ['l', 'r'] as const) {
    const col = raw.filter(x => x.side === side).sort((a, b) => a.y - b.y)
    const lo = 14, hi = height - 18
    col.forEach((x, i) => { x.y = Math.min(Math.max(x.y, lo), hi); if (i > 0 && x.y < col[i - 1].y + gap) x.y = col[i - 1].y + gap })
    for (let i = col.length - 1; i >= 0; i--) { if (col[i].y > hi) col[i].y = hi; if (i < col.length - 1 && col[i].y > col[i + 1].y - gap) col[i].y = col[i + 1].y - gap }
  }

  return {
    width, height,
    slices: raw.map(x => ({
      ...x.it, d: x.d,
      label: {
        name: short(x.it.name), pct: `${x.it.pct.toFixed(1)}%`, side: x.side,
        line: `${r2(x.edge[0])},${r2(x.edge[1])} ${r2(x.elbow[0])},${r2(x.elbow[1])} ${r2(x.endX)},${r2(x.y)}`,
        x: r2(x.endX + (x.side === 'r' ? 4 : -4)), y: r2(x.y),
      },
    })),
  }
}

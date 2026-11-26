/** Geometry for the flow diagram: one block on the left (all spending) splitting into one block per slice on the right. */

export type FlowInput = { id: string; name: string; color: string; cents: number; pct: number }
export type FlowNode = { id: string; name: string; color: string; cents: number; pct: number; y: number; h: number; labelY: number }
export type FlowLayout = {
  width: number; height: number; leftX: number; leftW: number; rightX: number; rightW: number
  left: { y: number; h: number }
  nodes: FlowNode[]
  ribbons: { id: string; color: string; d: string }[]
  /** A third level: what one category is made of (its tags), drawn to the same scale. */
  detail: { x: number; w: number; pickedId: string; nodes: FlowNode[]; ribbons: { id: string; color: string; d: string }[] } | null
}

const r = (n: number) => Math.round(n * 100) / 100

/**
 * Heights are proportional to the money (one scale for both sides), so a block twice as tall is twice the spending.
 * The right side has small gaps between blocks, and the left block is centred against it.
 */
export function flowLayout(items: FlowInput[], opt: { width?: number; bodyHeight?: number; gap?: number; pad?: number; col2?: number; col3?: number; detail?: { id: string; items: FlowInput[] } } = {}): FlowLayout {
  const width = opt.width ?? 520, body = opt.bodyHeight ?? 340, gap = opt.gap ?? 12, pad = opt.pad ?? 8
  const leftX = 0, leftW = 14, rightW = 14, rightX = opt.col2 ?? Math.round(width * 0.58)
  const live = items.filter(i => i.cents > 0)
  const total = live.reduce((s, i) => s + i.cents, 0)
  const scale = total > 0 ? body / total : 0
  const rightH = body + gap * Math.max(0, live.length - 1)
  const height = rightH + pad * 2
  const leftY = pad + (rightH - body) / 2
  let ly = leftY, ry = pad
  const nodes: FlowNode[] = [], ribbons: FlowLayout['ribbons'] = []
  const mid = (leftX + leftW + rightX) / 2
  for (const it of live) {
    const h = it.cents * scale
    nodes.push({ id: it.id, name: it.name, color: it.color, cents: it.cents, pct: it.pct, y: r(ry), h: r(h), labelY: r(ry + h / 2) })
    ribbons.push({
      id: it.id, color: it.color,
      d: `M${leftX + leftW} ${r(ly)} C${mid} ${r(ly)} ${mid} ${r(ry)} ${rightX} ${r(ry)} L${rightX} ${r(ry + h)} C${mid} ${r(ry + h)} ${mid} ${r(ly + h)} ${leftX + leftW} ${r(ly + h)} Z`,
    })
    ly += h; ry += h + gap
  }
  // the third level: the picked category's parts, stacked from the top of its block, with small gaps
  let detail: FlowLayout['detail'] = null
  const picked = opt.detail && nodes.find(n => n.id === opt.detail!.id)
  if (opt.detail && picked) {
    const x3 = opt.col3 ?? Math.round(width * 0.71), dgap = Math.max(4, Math.round(gap * 0.7)), x2 = rightX + rightW
    const parts = opt.detail.items.filter(i => i.cents > 0)
    const dn: FlowNode[] = [], dr: { id: string; color: string; d: string }[] = []
    const mid3 = (x2 + x3) / 2
    let sy = picked.y, ty = picked.y
    for (const it of parts) {
      const h = it.cents * scale
      dn.push({ id: it.id, name: it.name, color: it.color, cents: it.cents, pct: it.pct, y: r(ty), h: r(h), labelY: r(ty + h / 2) })
      dr.push({ id: it.id, color: it.color, d: `M${x2} ${r(sy)} C${mid3} ${r(sy)} ${mid3} ${r(ty)} ${x3} ${r(ty)} L${x3} ${r(ty + h)} C${mid3} ${r(ty + h)} ${mid3} ${r(sy + h)} ${x2} ${r(sy + h)} Z` })
      sy += h; ty += h + dgap
    }
    // keep the extra gaps inside the picture
    const bottom = ty - dgap
    detail = { x: x3, w: rightW, pickedId: picked.id, nodes: dn, ribbons: dr }
    if (bottom > height - pad) return { width, height: Math.ceil(bottom + pad), leftX, leftW, rightX, rightW, left: { y: r(leftY), h: r(body) }, nodes, ribbons, detail }
  }
  return { width, height, leftX, leftW, rightX, rightW, left: { y: r(leftY), h: r(body) }, nodes, ribbons, detail }
}

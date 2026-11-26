/** Geometry for the flow diagram: one block on the left (all spending) splitting into one block per slice on the right. */

export type FlowInput = { id: string; name: string; color: string; cents: number; pct: number }
export type FlowNode = { id: string; name: string; color: string; cents: number; pct: number; y: number; h: number; labelY: number }
export type FlowLayout = {
  width: number; height: number; leftX: number; leftW: number; rightX: number; rightW: number
  left: { y: number; h: number }
  nodes: FlowNode[]
  ribbons: { id: string; color: string; d: string }[]
}

const r = (n: number) => Math.round(n * 100) / 100

/**
 * Heights are proportional to the money (one scale for both sides), so a block twice as tall is twice the spending.
 * The right side has small gaps between blocks, and the left block is centred against it.
 */
export function flowLayout(items: FlowInput[], opt: { width?: number; bodyHeight?: number; gap?: number; pad?: number } = {}): FlowLayout {
  const width = opt.width ?? 520, body = opt.bodyHeight ?? 340, gap = opt.gap ?? 12, pad = opt.pad ?? 8
  const leftX = 0, leftW = 14, rightW = 14, rightX = Math.round(width * 0.58)
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
  return { width, height, leftX, leftW, rightX, rightW, left: { y: r(leftY), h: r(body) }, nodes, ribbons }
}

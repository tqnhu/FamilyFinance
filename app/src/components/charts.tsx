import { useState, type ReactNode } from 'react'
import { euroWhole } from '../lib/money'
import { MONTHS } from '../lib/bills'
import { niceAxis, type CatTotal, type YearModel } from '../lib/year'

/* Geometry of the monthly chart, in SVG units. The SVG scales to the card width. */
const W = 360, H = 230, ML = 46, MR = 8, MT = 20, MB = 24
const PW = W - ML - MR, PH = H - MT - MB, SLOT = PW / 12, COL = 18, GAP = 2, RADIUS = 4

/** A column segment: square at the baseline, 4px rounded at the data end when it is the top of the stack. */
export function segPath(x: number, top: number, w: number, h: number, roundTop: boolean): string {
  if (h <= 0) return ''
  const r = roundTop ? Math.min(RADIUS, h, w / 2) : 0
  const b = top + h
  return r
    ? `M${x},${b} V${top + r} A${r},${r} 0 0 1 ${x + r},${top} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${top + r} V${b} Z`
    : `M${x},${b} V${top} H${x + w} V${b} Z`
}

const axisLabel = (cents: number, compact: boolean) => (compact ? `€${cents / 100000}K` : euroWhole(cents))

function Tip({ style, children }: { style: React.CSSProperties; children: ReactNode }) {
  return <div className="tip" style={style} role="status">{children}</div>
}
const dash = (cents: number) => (cents ? euroWhole(cents) : '–')

function Key({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return <span className="key"><i className={line ? 'key-line' : 'key-box'} style={{ background: color }} />{label}</span>
}

/** Twelve stacked columns (everyday + yearly bills) with the monthly budget as a reference line. */
export function MonthlyChart({ model, year }: { model: YearModel; year: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const budget = model.monthlyBudget
  const maxVal = Math.max(...model.months.map(m => m.total), budget)
  const { top, ticks } = niceAxis(maxVal)
  const compact = top >= 1_000_000
  const y = (v: number) => MT + PH - (v / top) * PH
  const peak = model.topMonth?.month

  if (model.total === 0) return <p className="muted">No spending recorded in {year} yet.</p>

  return (
    <div className="viz">
      <div className="legend">
        <Key color="var(--s1)" label="Everyday" />
        <Key color="var(--s2)" label="Yearly bills" />
        {budget > 0 && <Key color="var(--ink-2)" line label={`Budget ${euroWhole(budget)}/month`} />}
      </div>

      {!table ? (
        <div className="plot" onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Spending by month in ${year}`}>
            {ticks.map(t => (
              <g key={t}>
                <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
                <text x={ML - 6} y={y(t) + 3} textAnchor="end" className="tick">{axisLabel(t, compact)}</text>
              </g>
            ))}
            {model.months.map((m, i) => {
              const x = ML + i * SLOT + (SLOT - COL) / 2
              const hE = (m.everyday / top) * PH, hB = (m.bills / top) * PH
              const hasBoth = hE > 0 && hB > 0
              const yE = y(0) - hE
              const yB = yE - (hasBoth ? GAP : 0) - hB
              return (
                <g key={m.month}>
                  {hover === i && <rect x={ML + i * SLOT} y={MT} width={SLOT} height={PH} className="wash" />}
                  <path d={segPath(x, yE, COL, hE, !hB)} fill="var(--s1)" />
                  <path d={segPath(x, yB, COL, hB, true)} fill="var(--s2)" />
                  {m.month === peak && <text x={x + COL / 2} y={Math.min(yB, yE) - 5} textAnchor="middle" className="peak">{euroWhole(m.total)}</text>}
                  <text x={x + COL / 2} y={H - 8} textAnchor="middle" className="tick">{MONTHS[i]}</text>
                </g>
              )
            })}
            {budget > 0 && <line x1={ML} x2={W - MR} y1={y(budget)} y2={y(budget)} className="ref" />}
            {model.months.map((m, i) => (
              <rect key={m.month} x={ML + i * SLOT} y={MT} width={SLOT} height={PH + MB} fill="transparent" tabIndex={0}
                role="img" aria-label={`${MONTHS[i]}: everyday ${euroWhole(m.everyday)}, yearly bills ${euroWhole(m.bills)}, total ${euroWhole(m.total)}`}
                onPointerMove={() => setHover(i)} onPointerDown={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            ))}
          </svg>
          {hover !== null && (() => {
            const m = model.months[hover]
            const center = ((ML + (hover + 0.5) * SLOT) / W) * 100
            return (
              // beside the column (on the emptier side of the chart), so the bar being read stays visible
              <Tip style={center < 50 ? { left: `calc(${center}% + 18px)`, top: 0 } : { right: `calc(${100 - center}% + 18px)`, top: 0 }}>
                <div className="tip-head">{MONTHS[hover]} {year}</div>
                <div className="tip-row"><i className="key-line" style={{ background: 'var(--s1)' }} /><strong>{euroWhole(m.everyday)}</strong><span>Everyday</span></div>
                <div className="tip-row"><i className="key-line" style={{ background: 'var(--s2)' }} /><strong>{euroWhole(m.bills)}</strong><span>Yearly bills</span></div>
                <div className="tip-row total"><strong>{euroWhole(m.total)}</strong><span>Total</span></div>
                {budget > 0 && <div className="tip-row"><strong>{euroWhole(budget)}</strong><span>Everyday budget</span></div>}
              </Tip>
            )
          })()}
        </div>
      ) : (
        <table className="vtable">
          <thead><tr><th>Month</th><th>Everyday</th><th>Yearly bills</th><th>Total</th></tr></thead>
          <tbody>{model.months.map((m, i) => <tr key={m.month}><td>{MONTHS[i]}</td><td>{dash(m.everyday)}</td><td>{dash(m.bills)}</td><td>{dash(m.total)}</td></tr>)}</tbody>
        </table>
      )}
      <button className="link small" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show as table'}</button>
    </div>
  )
}

/** Ranked horizontal bars: everyday spending per category for the year, with the yearly budget as a tick. */
export function CategoryBars({ categories }: { categories: CatTotal[] }) {
  const [tip, setTip] = useState<{ c: CatTotal; x: number; y: number } | null>(null)
  const [table, setTable] = useState(false)
  if (!categories.length) return <p className="muted">No everyday spending yet.</p>
  const max = Math.max(...categories.flatMap(c => [c.spent, c.budget]), 1)
  const anyBudget = categories.some(c => c.budget > 0)

  return (
    <div className="viz">
      <div className="legend">
        <Key color="var(--s1)" label="Spent this year" />
        {anyBudget && <span className="key"><i className="key-tick" />Yearly budget (monthly × 12)</span>}
      </div>
      {!table ? (
        <div className="bars" onPointerLeave={() => setTip(null)}>
          {categories.map(c => (
            <div key={c.id ?? 'none'} className="bar-row" tabIndex={0}
              aria-label={`${c.name}: ${euroWhole(c.spent)} spent${c.budget ? ` of ${euroWhole(c.budget)} yearly budget` : ''}`}
              onPointerMove={e => { const r = e.currentTarget.parentElement!.getBoundingClientRect(); setTip({ c, x: e.clientX - r.left, y: e.clientY - r.top }) }}
              onFocus={e => setTip({ c, x: 120, y: e.currentTarget.offsetTop })} onBlur={() => setTip(null)}>
              <span className="bar-name">{c.emoji} {c.name}</span>
              <span className="bar-track">
                <i className="bar-fill" style={{ width: `${(c.spent / max) * 100}%` }} />
                {c.budget > 0 && <i className="bar-tick" style={{ left: `${(c.budget / max) * 100}%` }} />}
              </span>
              <span className="bar-val">{euroWhole(c.spent)}</span>
            </div>
          ))}
          {tip && (
            <Tip style={{ left: Math.min(tip.x + 16, 150), top: Math.max(0, tip.y - 76) }}>
              <div className="tip-head">{tip.c.emoji} {tip.c.name}</div>
              <div className="tip-row"><i className="key-line" style={{ background: 'var(--s1)' }} /><strong>{euroWhole(tip.c.spent)}</strong><span>Spent</span></div>
              {tip.c.budget > 0 && <>
                <div className="tip-row"><strong>{euroWhole(tip.c.budget)}</strong><span>Yearly budget</span></div>
                <div className="tip-row"><strong>{Math.round((tip.c.spent / tip.c.budget) * 100)}%</strong><span>Used</span></div>
              </>}
            </Tip>
          )}
        </div>
      ) : (
        <table className="vtable">
          <thead><tr><th>Category</th><th>Spent</th><th>Yearly budget</th><th>Used</th></tr></thead>
          <tbody>{categories.map(c => <tr key={c.id ?? 'none'}><td>{c.emoji} {c.name}</td><td>{euroWhole(c.spent)}</td><td>{c.budget ? euroWhole(c.budget) : '–'}</td><td>{c.budget ? `${Math.round((c.spent / c.budget) * 100)}%` : '–'}</td></tr>)}</tbody>
        </table>
      )}
      <button className="link small" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show as table'}</button>
    </div>
  )
}

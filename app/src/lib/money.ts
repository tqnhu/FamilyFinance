const fmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
export const euro = (cents: number) => fmt.format(cents / 100)

/** "12.5", "12,50" -> 1250. Returns null when invalid or not positive. */
export function parseEuro(input: string): number | null {
  const n = Number(input.trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

export const monthStart = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv')
export const nextMonthStart = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('sv')
export const today = () => new Date().toLocaleDateString('sv')

const whole = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
/** Whole euros, for overviews where cents are noise. */
export const euroWhole = (cents: number) => whole.format(cents / 100)

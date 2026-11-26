import { useState } from 'react'
import { getLocal, setLocal } from './local'

export type Chart = 'pie' | 'bars' | 'flow'
const KEY = 'ff-review-chart'

/** How the Review screens draw shares. Pie to start with; the choice is remembered on this device. */
export function readChart(): Chart {
  const v = getLocal(KEY)
  return v === 'bars' || v === 'flow' ? v : 'pie'
}
export function useChart(): [Chart, (c: Chart) => void] {
  const [chart, set] = useState<Chart>(readChart)
  return [chart, (c: Chart) => { set(c); setLocal(KEY, c) }]
}

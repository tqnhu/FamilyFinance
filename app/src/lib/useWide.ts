import { useEffect, useState } from 'react'

/** True on screens at least `min` px wide (600 by default, where the flow diagram fits; 900 for the two-column Review). */
export function useWide(min = 600): boolean {
  const q = `(min-width: ${min}px)`
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(q).matches))
  useEffect(() => {
    const m = window.matchMedia?.(q); if (!m) return
    const f = () => setWide(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [q])
  return wide
}

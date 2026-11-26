import { useEffect, useState } from 'react'

/** True on screens at least 600 px wide (where the flow diagram fits). */
export function useWide(): boolean {
  const q = '(min-width: 600px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(q).matches))
  useEffect(() => {
    const m = window.matchMedia?.(q); if (!m) return
    const f = () => setWide(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [])
  return wide
}

import { useEffect, useState } from 'react'

/** Chrome and Edge let an app offer its own "install" button through this event. It fires once, early, so it is caught here at load. */
interface InstallEvent extends Event { prompt: () => Promise<void> }
let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach(l => l()) })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(l => l()) })
}

/** True when the app is already running from the home screen. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function useInstall() {
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump(n => n + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return {
    standalone: isStandalone(),
    canPrompt: deferred !== null,
    async prompt() { if (!deferred) return; const e = deferred; deferred = null; await e.prompt(); listeners.forEach(l => l()) },
  }
}

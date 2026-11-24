/** Small per-device settings (dismissed cards, "seen" times). Browsers can refuse storage (private mode, blocked data), so nothing here may throw. */
export function getLocal(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
export function setLocal(key: string, value: string): void {
  try { window.localStorage.setItem(key, value) } catch { /* the setting just does not stick */ }
}
export function removeLocal(key: string): void {
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}

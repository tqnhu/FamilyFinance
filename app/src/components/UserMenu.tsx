import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'

/** The person's name at the top left. It opens a menu to their profile, the family settings, Configuration (tags and rules, parents only), and sign out. */
export default function UserMenu() {
  const { member, family } = useAuth()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const loc = useLocation()

  useEffect(() => setOpen(false), [loc.pathname, loc.search]) // leaving for a page closes the menu

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus() // keyboard users land on the first item
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'Escape') { setOpen(false); button.current?.focus(); return }
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const move = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus() }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(items.length - 1)
    else if (e.key === 'Tab') setOpen(false)
  }

  if (!member) return null
  return (
    <div className="usermenu" ref={root} onKeyDown={onKeyDown}>
      <button ref={button} className="usermenu-btn" aria-haspopup="menu" aria-expanded={open} aria-controls="user-menu" onClick={() => setOpen(!open)}>
        <span aria-hidden>💶</span> <strong>{member.display_name}</strong> <span aria-hidden className="muted">▾</span>
        <span className="sr-only"> account menu</span>
      </button>
      {open && (
        <div id="user-menu" className="menu" role="menu" aria-label="Account">
          <div className="menu-head">
            <strong>{member.display_name}</strong>
            <span className="muted small">{member.role === 'parent' ? 'Parent' : 'Child'}{family ? ` · ${family.name}` : ''}</span>
          </div>
          <Link role="menuitem" to="/settings?tab=profile">👤 My profile</Link>
          <Link role="menuitem" to="/settings?tab=family">🏠 Family settings</Link>
          {member?.role === 'parent' && <Link role="menuitem" to="/settings?tab=config">⚙️ Configuration</Link>}
          <button role="menuitem" className="menu-out" onClick={() => supabase.auth.signOut()}>↩ Sign out</button>
        </div>
      )}
    </div>
  )
}

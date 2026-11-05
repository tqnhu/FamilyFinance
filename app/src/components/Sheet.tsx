import type { ReactNode } from 'react'

/** Bottom sheet used for small forms. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <button type="button" className="link" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

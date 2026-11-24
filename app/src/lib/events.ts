/**
 * Pages dispatch this after something changed that a badge might count, so the badges update without a reload.
 * Kept in its own file with no imports: the data hooks and the badge hook both need it, and importing it from
 * either of them would make them import each other.
 */
export const DATA_CHANGED = 'ff:data-changed'
export const announceChange = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED)) }

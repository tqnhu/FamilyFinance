import { Link } from 'react-router-dom'
import { euro } from '../lib/money'
import { upcoming, useBills } from '../lib/bills'

const when = (days: number) => (days < 0 ? `${-days} ${days === -1 ? 'day' : 'days'} overdue` : days === 0 ? 'due today' : `in ${days} ${days === 1 ? 'day' : 'days'}`)

/** Parents only: yearly bills that are overdue or due in the next 30 days. */
export default function DueSoon() {
  const { bills, payments, loading } = useBills()
  if (loading) return null
  const due = upcoming(bills, payments)
  if (!due.length) return null
  return (
    <section className="card attention">
      <h2>🧾 Bills coming up</h2>
      {due.slice(0, 5).map(d => (
        <div key={d.bill.id + d.due} className="row item">
          <div><div>{d.bill.name}</div><div className="muted small">{d.due}</div></div>
          <div className="right"><strong>{euro(d.bill.amount_cents)}</strong><div className={`small ${d.overdue ? 'error' : 'muted'}`}>{d.overdue ? '⚠️ ' : ''}{when(d.days)}</div></div>
        </div>
      ))}
      <Link className="small" to="/plan?tab=bills">Open yearly bills →</Link>
    </section>
  )
}

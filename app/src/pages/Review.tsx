import { Navigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth'
import MonthTab from './MonthTab'
import YearTab from './YearTab'
import { useTags } from '../lib/tags'
import CategoryDetail from './CategoryDetail'

function ReviewTabs() {
  const [tab, setTab] = useState<'month' | 'year'>('month')
  const { tags } = useTags()
  const [choice, setChoice] = useState<string[]>([]) // the tag filter is kept when moving between Month and Year
  return (
    <div className="review-wide">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'month'} className={tab === 'month' ? 'on' : ''} onClick={() => setTab('month')}>Month</button>
        <button role="tab" aria-selected={tab === 'year'} className={tab === 'year' ? 'on' : ''} onClick={() => setTab('year')}>Year</button>
      </div>
      {tab === 'month' ? <MonthTab tags={tags} choice={choice} setChoice={setChoice} /> : <YearTab tags={tags} choice={choice} setChoice={setChoice} />}
    </div>
  )
}

/** The Review page: Month and Year for parents, or one category's expenses when opened from Home. */
export default function Review() {
  const [params] = useSearchParams()
  const { member } = useAuth()
  const category = params.get('category')
  if (category) return <CategoryDetail categoryId={category} />
  if (member?.role !== 'parent') return <Navigate to="/" replace /> // children only come here through a category on Home
  return <ReviewTabs />
}

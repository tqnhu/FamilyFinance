import { Navigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth'
import MonthTab from './MonthTab'
import YearTab from './YearTab'
import TagsView from './TagsView'
import CategoryDetail from './CategoryDetail'

function ReviewTabs() {
  const [tab, setTab] = useState<'month' | 'year' | 'tags'>('month')
  return (
    <>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'month'} className={tab === 'month' ? 'on' : ''} onClick={() => setTab('month')}>Month</button>
        <button role="tab" aria-selected={tab === 'year'} className={tab === 'year' ? 'on' : ''} onClick={() => setTab('year')}>Year</button>
        <button role="tab" aria-selected={tab === 'tags'} className={tab === 'tags' ? 'on' : ''} onClick={() => setTab('tags')}>Tags</button>
      </div>
      {tab === 'month' ? <MonthTab /> : tab === 'year' ? <YearTab /> : <TagsView />}
    </>
  )
}

/** The Review page: Month, Year and Tags for parents, or one category's expenses when opened from Home. */
export default function Review() {
  const [params] = useSearchParams()
  const { member } = useAuth()
  const category = params.get('category')
  if (category) return <CategoryDetail categoryId={category} />
  if (member?.role !== 'parent') return <Navigate to="/" replace /> // children only come here through a category on Home
  return <ReviewTabs />
}

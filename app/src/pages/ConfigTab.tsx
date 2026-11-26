import { useState } from 'react'
import TagsManager from './TagsManager'
import RulesTab from './RulesTab'

/** Settings → Configuration (parents): the tags, then the automatic-category rules. While tidying Other, that screen has the page to itself. */
export default function ConfigTab() {
  const [tidying, setTidying] = useState(false)
  return (
    <>
      {!tidying && <TagsManager />}
      <RulesTab onTidying={setTidying} />
    </>
  )
}

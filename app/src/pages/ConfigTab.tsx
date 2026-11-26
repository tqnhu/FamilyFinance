import TagsManager from './TagsManager'
import RulesTab from './RulesTab'

/** Settings → Configuration (parents): the tags, then the automatic-category rules. */
export default function ConfigTab() {
  return (
    <>
      <TagsManager />
      <RulesTab />
    </>
  )
}

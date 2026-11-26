// Test stubs: the app asks for each expense together with its tags (expense_tags(tag_id)). A fixture says which tags it has with
// `tag_ids: [...]` (or the older single `tag_id`); this turns that into what the database would send.
const tagsOf = x => x.tag_ids ?? (x.tag_id ? [x.tag_id] : [])
const withEt = rows => (Array.isArray(rows) ? rows.map(x => ({ ...x, expense_tags: tagsOf(x).map(tag_id => ({ tag_id })) })) : rows)
const flat = rows => rows.flatMap(x => tagsOf(x).map(tag_id => ({ expense_id: x.id, tag_id })))
module.exports = { tagsOf, withEt, flat }

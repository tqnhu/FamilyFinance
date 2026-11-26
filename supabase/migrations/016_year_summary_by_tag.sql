-- Migration 016: a year's spending by month and category, limited to some tags. Apply after 015.
-- Same rows and rules as year_summary (is_bill = kept apart from everyday spending), but only for expenses carrying one of the
-- given tags, and optionally the ones with no tag. Used by Review → Year when a tag filter is chosen.
-- Parents only, counted in the database so a long history never hits a row limit.

create function year_summary_by_tag(y integer, tag_ids uuid[], include_untagged boolean default false)
returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, ((e.bill_id is not null and not e.monthly_fee) or e.annual_fee), sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
    and ((e.tag_id is not null and e.tag_id = any(coalesce(tag_ids, '{}'::uuid[]))) or (include_untagged and e.tag_id is null))
  group by 1, 2, 3
$$;
revoke execute on function year_summary_by_tag(integer, uuid[], boolean) from public, anon;
grant execute on function year_summary_by_tag(integer, uuid[], boolean) to authenticated;

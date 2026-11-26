-- Choosing several tags now means an expense must carry ALL of them (not any). "No tag" is its own choice and is not mixed with tags.
-- tag_ids empty and include_untagged true: only expenses without any tag. tag_ids given: only expenses with every one of those tags.
create or replace function year_summary_by_tag(y integer, tag_ids uuid[], include_untagged boolean default false)
returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, ((e.bill_id is not null and not e.monthly_fee) or e.annual_fee), sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
    and (case when cardinality(coalesce(tag_ids, '{}'::uuid[])) > 0
         then not exists (select 1 from unnest(tag_ids) t where not exists (select 1 from expense_tags et where et.expense_id = e.id and et.tag_id = t))
         else include_untagged and not exists (select 1 from expense_tags et where et.expense_id = e.id) end)
  group by 1, 2, 3
$$;

create or replace function tags_total(tag_ids uuid[], include_untagged boolean default false, from_d date default null, to_d date default null)
returns table (total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(e.amount_cents), 0)::bigint, count(*)::bigint
  from expenses e
  where is_parent() and e.family_id = my_family()
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
    and (case when cardinality(coalesce(tag_ids, '{}'::uuid[])) > 0
         then not exists (select 1 from unnest(tag_ids) t where not exists (select 1 from expense_tags et where et.expense_id = e.id and et.tag_id = t))
         else include_untagged and not exists (select 1 from expense_tags et where et.expense_id = e.id) end)
$$;

-- The expenses of a period with all the chosen tags, or with none, newest first. Runs as the caller, so row security still applies.
create function expenses_with_tags(from_d date, to_d date, tag_ids uuid[], include_untagged boolean default false, max_rows integer default 300)
returns setof expenses
language sql stable security invoker set search_path = public as $$
  select e.* from expenses e
  where e.spent_on >= from_d and e.spent_on < to_d
    and (case when cardinality(coalesce(tag_ids, '{}'::uuid[])) > 0
         then not exists (select 1 from unnest(tag_ids) t where not exists (select 1 from expense_tags et where et.expense_id = e.id and et.tag_id = t))
         else include_untagged and not exists (select 1 from expense_tags et where et.expense_id = e.id) end)
  order by e.spent_on desc, e.created_at desc
  limit least(greatest(max_rows, 1), 1000)
$$;
revoke execute on function expenses_with_tags(date, date, uuid[], boolean, integer) from public, anon;
grant execute on function expenses_with_tags(date, date, uuid[], boolean, integer) to authenticated;

-- An expense can carry up to 5 tags. Join table expense_tags(expense_id, tag_id); expenses.tag_id is removed.
-- Under every tag an expense counts at its full amount, so tag totals may add up to more than the total
-- spending; a filter over several tags counts each expense once (union).
create table expense_tags (
  expense_id uuid not null references expenses on delete cascade,
  tag_id uuid not null references tags on delete cascade,   -- deleting a tag just untags
  primary key (expense_id, tag_id)
);
create index on expense_tags (tag_id, expense_id);

alter table expense_tags enable row level security;
-- You see the tags of the expenses you can see.
create policy "read expense tags" on expense_tags for select
  using (exists (select 1 from expenses e where e.id = expense_id));
-- You change the tags of the expenses you may edit (bill payments are tagged by mark_bill_paid), with a tag of the same family.
create policy "add expense tags" on expense_tags for insert
  with check (exists (select 1 from expenses e where e.id = expense_id and e.family_id = my_family() and e.bill_id is null
                        and (is_parent() or e.member_id = auth.uid()))
    and exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family()));
create policy "remove expense tags" on expense_tags for delete
  using (exists (select 1 from expenses e where e.id = expense_id and e.family_id = my_family() and e.bill_id is null
                   and (is_parent() or e.member_id = auth.uid())));
revoke all on expense_tags from anon, authenticated;
grant select on expense_tags to authenticated;
grant insert (expense_id, tag_id) on expense_tags to authenticated;
grant delete on expense_tags to authenticated;

-- At most 5 tags per expense (the row is locked so two fast inserts cannot both slip past).
create function limit_expense_tags() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from expenses where id = new.expense_id for update;
  if (select count(*) from expense_tags where expense_id = new.expense_id) >= 5 then
    raise exception 'an expense can have at most 5 tags';
  end if;
  return new;
end $$;
create trigger expense_tags_limit before insert on expense_tags for each row execute function limit_expense_tags();

-- Existing single tags move over; the old column goes.
insert into expense_tags (expense_id, tag_id) select id, tag_id from expenses where tag_id is not null;

drop policy "add own expenses" on expenses;
create policy "add own expenses" on expenses for insert
  with check (family_id = my_family() and member_id = auth.uid()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));
drop policy "edit expenses" on expenses;
create policy "edit expenses" on expenses for update
  using (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid()))
  with check (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid())
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));
drop index expenses_tag_id_idx;
alter table expenses drop column tag_id;

-- Paying a bill copies the bill's tag onto the payment.
create or replace function mark_bill_paid(bill uuid, due date, cents integer, paid date) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bills; eid uuid; step integer; last_day integer;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select * into b from bills where id = bill and family_id = my_family() for update;
  if b.id is null then raise exception 'bill not found'; end if;
  if b.archived then raise exception 'this bill has ended'; end if;
  step := 12 / b.times_per_year;
  last_day := extract(day from ((date_trunc('month', due) + interval '1 month' - interval '1 day')::date))::integer;
  if due <> make_date(extract(year from due)::integer, extract(month from due)::integer, least(b.due_day, last_day))
     or (((extract(month from due)::integer - b.due_month) % step) + step) % step <> 0 then
    raise exception 'that is not a due date for this bill';
  end if;
  if cents is null or cents <= 0 or cents > 100000000 then raise exception 'amount out of range'; end if;
  if paid is null or paid > current_date then raise exception 'the payment date cannot be in the future'; end if;
  if exists (select 1 from bill_payments where bill_id = b.id and due_on = due) then raise exception 'already marked as paid'; end if;
  insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on, bill_id, monthly_fee)
  values (b.family_id, auth.uid(), b.category_id, cents, b.name, paid, b.id, b.times_per_year = 12) returning id into eid;
  if b.tag_id is not null then insert into expense_tags (expense_id, tag_id) values (eid, b.tag_id); end if;
  insert into bill_payments (bill_id, family_id, due_on, expense_id) values (b.id, b.family_id, due, eid);
  return eid;
end $$;

-- Totals per tag (tag_id null = no tag). An expense with several tags is counted in full under each of them.
create or replace function tag_totals(from_d date default null, to_d date default null)
returns table (tag_id uuid, total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select et.tag_id, sum(e.amount_cents)::bigint, count(*)::bigint
  from expenses e left join expense_tags et on et.expense_id = e.id
  where is_parent() and e.family_id = my_family()
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
  group by et.tag_id
$$;

create or replace function tag_months(tag uuid, from_d date default null, to_d date default null)
returns table (month date, total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', e.spent_on)::date, sum(e.amount_cents)::bigint, count(*)::bigint
  from expenses e join expense_tags et on et.expense_id = e.id and et.tag_id = tag
  where is_parent() and e.family_id = my_family()
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
  group by 1 order by 1
$$;

-- Any of the chosen tags (and, if asked, no tag at all): each expense is counted once.
create or replace function year_summary_by_tag(y integer, tag_ids uuid[], include_untagged boolean default false)
returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, ((e.bill_id is not null and not e.monthly_fee) or e.annual_fee), sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
    and (exists (select 1 from expense_tags et where et.expense_id = e.id and et.tag_id = any(coalesce(tag_ids, '{}'::uuid[])))
         or (include_untagged and not exists (select 1 from expense_tags et where et.expense_id = e.id)))
  group by 1, 2, 3
$$;

-- The total of everything carrying ANY of the chosen tags (and, if asked, nothing tagged at all), each expense once.
-- A null bound means unbounded, so (null, null) is all time.
create function tags_total(tag_ids uuid[], include_untagged boolean default false, from_d date default null, to_d date default null)
returns table (total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(e.amount_cents), 0)::bigint, count(*)::bigint
  from expenses e
  where is_parent() and e.family_id = my_family()
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
    and (exists (select 1 from expense_tags et where et.expense_id = e.id and et.tag_id = any(coalesce(tag_ids, '{}'::uuid[])))
         or (include_untagged and not exists (select 1 from expense_tags et where et.expense_id = e.id)))
$$;
revoke execute on function tags_total(uuid[], boolean, date, date) from public, anon;
grant execute on function tags_total(uuid[], boolean, date, date) to authenticated;

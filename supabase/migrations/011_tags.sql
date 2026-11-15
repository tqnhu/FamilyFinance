-- Migration 011: tags. Apply after 010.
-- A tag is a family-wide label ("Vietnam trip", "Kitchen") on any expense, one tag per expense so the totals of all
-- tags and "no tag" add up to the overall total. A bill can carry a default tag that its payments inherit.

create table tags (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  archived boolean not null default false,
  created_by uuid references members(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index tags_family_name on tags (family_id, lower(btrim(name)));

alter table tags enable row level security;
-- Everyone in the family can see the tag names and make new ones; only parents rename, archive or delete.
create policy "read tags" on tags for select using (family_id = my_family());
create policy "add tags" on tags for insert with check (family_id = my_family() and created_by = auth.uid());
create policy "parents change tags" on tags for update using (family_id = my_family() and is_parent())
  with check (family_id = my_family() and is_parent());
create policy "parents delete tags" on tags for delete using (family_id = my_family() and is_parent());
revoke insert, update on tags from anon, authenticated;
grant insert (family_id, name, created_by) on tags to authenticated;
grant update (name, archived) on tags to authenticated;

alter table expenses add column tag_id uuid references tags on delete set null;   -- deleting a tag just untags
create index on expenses (tag_id) where tag_id is not null;
grant insert (tag_id) on expenses to authenticated;
grant update (tag_id) on expenses to authenticated;

-- The tag must belong to the same family (as the category already must).
drop policy "add own expenses" on expenses;
create policy "add own expenses" on expenses for insert
  with check (family_id = my_family() and member_id = auth.uid()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family()))
    and (tag_id is null or exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family())));
drop policy "edit expenses" on expenses;
create policy "edit expenses" on expenses for update
  using (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid()))
  with check (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid())
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family()))
    and (tag_id is null or exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family())));

alter table bills add column tag_id uuid references tags on delete set null;
drop policy "parents manage bills" on bills;
create policy "parents manage bills" on bills for all
  using (family_id = my_family() and is_parent())
  with check (family_id = my_family() and is_parent()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family()))
    and (tag_id is null or exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family())));

-- Marking a bill paid copies the bill's tag onto the payment.
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
  insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on, bill_id, monthly_fee, tag_id)
  values (b.family_id, auth.uid(), b.category_id, cents, b.name, paid, b.id, b.times_per_year = 12, b.tag_id) returning id into eid;
  insert into bill_payments (bill_id, family_id, due_on, expense_id) values (b.id, b.family_id, due, eid);
  return eid;
end $$;

-- Totals per tag (tag_id null = no tag) for a period [from_d, to_d); a null bound means unbounded, so
-- (null, null) is all time. Parents only; counted in the database so a long history never hits a row limit.
create function tag_totals(from_d date default null, to_d date default null)
returns table (tag_id uuid, total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select e.tag_id, sum(e.amount_cents)::bigint, count(*)::bigint from expenses e
  where is_parent() and e.family_id = my_family()
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
  group by e.tag_id
$$;

-- One tag's total per calendar month inside the period.
create function tag_months(tag uuid, from_d date default null, to_d date default null)
returns table (month date, total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', e.spent_on)::date, sum(e.amount_cents)::bigint, count(*)::bigint from expenses e
  where is_parent() and e.family_id = my_family() and e.tag_id = tag
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
  group by 1 order by 1
$$;
revoke execute on function tag_totals(date, date), tag_months(uuid, date, date) from public, anon;
grant execute on function tag_totals(date, date), tag_months(uuid, date, date) to authenticated;

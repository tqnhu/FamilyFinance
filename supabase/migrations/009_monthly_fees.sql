-- Migration 009: monthly fees count as ordinary spending. Apply after 008.
-- A payment of a bill that is charged every month is recorded as a monthly fee. It counts in the month it was
-- charged and in its category, like any other expense. Bills charged less often stay separate (yearly bills).
-- The flag is a snapshot taken when the payment is marked paid, so changing a bill later never rewrites history.

alter table expenses add column monthly_fee boolean not null default false;   -- clients cannot write it (not in any column grant)
update expenses e set monthly_fee = true from bills b where b.id = e.bill_id and b.times_per_year = 12;

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
  insert into bill_payments (bill_id, family_id, due_on, expense_id) values (b.id, b.family_id, due, eid);
  return eid;
end $$;

-- is_bill now means "a yearly-type bill kept apart from everyday spending"; monthly fees are everyday spending.
create or replace function year_summary(y integer) returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, (e.bill_id is not null and not e.monthly_fee), sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
  group by 1, 2, 3
$$;

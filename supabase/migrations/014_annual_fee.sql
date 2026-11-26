-- Migration 014: an expense can be marked as an annual fee, so it is not counted as monthly spending. Apply after 013.
-- Meant for things like a yearly membership or insurance that arrives through a bank import (or is typed in) rather than
-- through the Plan page's bills. It is kept apart exactly like a yearly bill payment: left out of the month's total, the
-- budgets and the category and breakdown shares, and shown in the Year view as a yearly bill. It stays an ordinary
-- expense that can be edited, tagged and deleted, and the flag can be turned off again.
-- Nothing changes for existing expenses (the flag starts off).

alter table expenses add column annual_fee boolean not null default false;
grant insert (annual_fee) on expenses to authenticated;
grant update (annual_fee) on expenses to authenticated;

-- "is_bill" now means "kept apart from everyday spending": a yearly-type bill payment or an expense marked as an annual fee.
create or replace function year_summary(y integer) returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, ((e.bill_id is not null and not e.monthly_fee) or e.annual_fee), sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
  group by 1, 2, 3
$$;

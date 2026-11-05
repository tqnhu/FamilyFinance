-- Migration 006: category management, recurring bills (yearly, half-yearly, quarterly, monthly), yearly summary.
-- Apply after 005.
--
-- A bill is a planned payment, e.g. "Car insurance, €620, due 1 March, once a year". Marking a due date as paid
-- creates a normal expense flagged with bill_id. Flagged expenses are kept out of the everyday monthly budgets
-- (so one big insurance payment doesn't blow the "Home" budget) but count in yearly totals.

alter table categories add column archived boolean not null default false;
create unique index categories_family_name on categories (family_id, lower(btrim(name)));

create table bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  category_id uuid references categories on delete set null,
  amount_cents integer not null check (amount_cents between 1 and 100000000),   -- per payment
  times_per_year integer not null default 1 check (times_per_year in (1, 2, 4, 12)),
  due_month integer not null check (due_month between 1 and 12),                 -- first due month
  due_day integer not null check (due_day between 1 and 31),                     -- clamped to short months
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on bills (family_id);

alter table expenses add column bill_id uuid references bills;   -- no cascade: history is kept, bills are archived

create table bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills,
  family_id uuid not null references families on delete cascade,
  due_on date not null,
  expense_id uuid not null references expenses on delete cascade,   -- deleting the expense makes the due date unpaid again
  created_at timestamptz not null default now(),
  unique (bill_id, due_on)
);

alter table bills enable row level security;
alter table bill_payments enable row level security;
-- Bills are private to parents.
create policy "parents manage bills" on bills for all
  using (family_id = my_family() and is_parent())
  with check (family_id = my_family() and is_parent()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));
create policy "parents read bill payments" on bill_payments for select using (family_id = my_family() and is_parent());
revoke insert, update, delete on bill_payments from anon, authenticated;

-- Nobody can flag their own expense as a bill payment (that would hide it from the budgets):
-- clients may write every expense column except bill_id.
revoke insert, update on expenses from anon, authenticated;
grant insert (family_id, member_id, category_id, amount_cents, note, spent_on) on expenses to authenticated;
grant update (category_id, amount_cents, note, spent_on) on expenses to authenticated;

create function mark_bill_paid(bill uuid, due date, cents integer, paid date) returns uuid
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
  insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on, bill_id)
  values (b.family_id, auth.uid(), b.category_id, cents, b.name, paid, b.id) returning id into eid;
  insert into bill_payments (bill_id, family_id, due_on, expense_id) values (b.id, b.family_id, due, eid);
  return eid;
end $$;

create function unmark_bill_paid(payment uuid) returns void language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select expense_id into eid from bill_payments where id = payment and family_id = my_family();
  if eid is null then raise exception 'payment not found'; end if;
  delete from expenses where id = eid;   -- cascades to bill_payments
end $$;

-- Spending per month, category and kind (everyday vs bill) for one calendar year. Parents only: a child
-- gets no rows. Aggregated in the database so a busy year never hits the row limit of a plain query.
create function year_summary(y integer) returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, e.bill_id is not null, sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
  group by 1, 2, 3
$$;

revoke execute on function mark_bill_paid(uuid, date, integer, date), unmark_bill_paid(uuid), year_summary(integer) from public, anon;
grant execute on function mark_bill_paid(uuid, date, integer, date), unmark_bill_paid(uuid), year_summary(integer) to authenticated;

-- Monthly fee tests. Run AFTER jars.sql, goals.sql, bills.sql, edit_expenses.sql and receipts.sql.
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set Q '''00000000-0000-0000-0000-000000000004'''

select t.as_user(:P);
select id as cat from categories where name = 'Fun' and family_id = (select family_id from members where user_id = :P) \gset
insert into bills (family_id, name, category_id, amount_cents, times_per_year, due_month, due_day)
  select family_id, 'Streaming', :'cat'::uuid, 1299, 12, 1, 5 from members where user_id = auth.uid();
insert into bills (family_id, name, category_id, amount_cents, times_per_year, due_month, due_day)
  select family_id, 'Dentist plan', :'cat'::uuid, 12000, 4, 2, 10 from members where user_id = auth.uid();
select id as monthly from bills where name = 'Streaming' \gset
select id as quarterly from bills where name = 'Dentist plan' \gset

select mark_bill_paid(:'monthly'::uuid, '2026-03-05', 1299, '2026-03-05') as m1 \gset
select mark_bill_paid(:'monthly'::uuid, '2026-04-05', 1349, '2026-04-06') as m2 \gset
select mark_bill_paid(:'quarterly'::uuid, '2026-02-10', 12000, '2026-02-10') as q1 \gset
select t.ok((select monthly_fee from expenses where id = :'m1'::uuid), 'a payment of a monthly bill is recorded as a monthly fee');
select t.ok(not (select monthly_fee from expenses where id = :'q1'::uuid), 'a quarterly bill payment is not');
select t.ok((select bill_id from expenses where id = :'m1'::uuid) = :'monthly'::uuid, 'a monthly fee still links to its bill (so it can be undone)');

-- the yearly summary: monthly fees are everyday spending, in the month charged and in their category
select t.ok((select total_cents from year_summary(2026) where month = 3 and not is_bill and category_id = :'cat'::uuid) = 1299, 'March: the monthly fee counts as everyday spending in its category');
select t.ok((select total_cents from year_summary(2026) where month = 4 and not is_bill and category_id = :'cat'::uuid) = 1349, 'April: charged on the 6th, so it counts in April, with the amount actually charged');
select t.ok((select count(*) from year_summary(2026) where is_bill and month in (3, 4) and category_id = :'cat'::uuid) = 0, 'no monthly fee is reported as a separate bill');
select t.ok((select total_cents from year_summary(2026) where month = 2 and is_bill and category_id = :'cat'::uuid) = 12000, 'a quarterly bill is still reported separately');
select t.ok((select count(*) from year_summary(2026) where month = 2 and not is_bill and category_id = :'cat'::uuid) = 0, 'and is not mixed into February''s everyday spending');

-- clients cannot set the flag
select t.fails(format($q$update expenses set monthly_fee = true where id = %L::uuid$q$, :'q1'), 'the flag cannot be changed through the API');
select t.fails($q$insert into expenses (family_id, member_id, amount_cents, monthly_fee) select family_id, user_id, 100, true from members where user_id = auth.uid()$q$, 'a new expense cannot be created as a monthly fee');
select t.as_user(:C1);
select t.fails($q$insert into expenses (family_id, member_id, amount_cents, monthly_fee) select family_id, user_id, 100, true from members where user_id = auth.uid()$q$, 'a child cannot create one either');

-- history is a snapshot: changing the bill later does not rewrite old months
select t.as_user(:P);
update bills set times_per_year = 1, due_month = 3 where id = :'monthly'::uuid;
select t.ok((select monthly_fee from expenses where id = :'m1'::uuid), 'changing a bill''s frequency later leaves past payments as they were');
select t.ok((select total_cents from year_summary(2026) where month = 3 and not is_bill and category_id = :'cat'::uuid) = 1299, 'and past months keep their numbers');
update bills set times_per_year = 12, due_month = 1 where id = :'monthly'::uuid;

-- undo still works for a monthly fee
select unmark_bill_paid((select id from bill_payments where expense_id = :'m2'::uuid));
select t.ok(not exists (select 1 from expenses where id = :'m2'::uuid), 'a monthly fee payment can be undone');
select t.ok((select count(*) from year_summary(2026) where month = 4 and category_id = :'cat'::uuid) = 0, 'and April is empty again');

-- privacy and isolation are unchanged
select t.as_user(:C1);
select t.ok((select count(*) from year_summary(2026)) = 0, 'a child still gets no yearly summary');
select t.ok((select count(*) from expenses where bill_id is not null) = 0, 'and still cannot see bill payments');
select t.as_user(:Q);
select t.ok((select count(*) from year_summary(2026)) = 0, 'another family sees nothing');

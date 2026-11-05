-- Phase 4 tests (bills, category management, year summary). Run AFTER jars.sql and goals.sql.
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set Q '''00000000-0000-0000-0000-000000000004'''

-- privacy: only parents see or write bills
select t.as_user(:P);
select id as cat from categories where name = 'Home & bills' and family_id = (select family_id from members where user_id = :P) \gset
select t.ok((select count(*) from categories where name = 'Home & bills') = 1, 'seeded category found');
insert into bills (family_id, name, category_id, amount_cents, times_per_year, due_month, due_day)
  select family_id, 'Car insurance', :'cat'::uuid, 62000, 1, 3, 15 from members where user_id = auth.uid();
insert into bills (family_id, name, category_id, amount_cents, times_per_year, due_month, due_day)
  select family_id, 'Water', null, 9000, 4, 2, 31 from members where user_id = auth.uid();
select t.ok((select count(*) from bills) = 2, 'parent created two bills');
select t.as_user(:C1);
select t.ok((select count(*) from bills) = 0, 'kid cannot see bills');
select t.fails($q$insert into bills (family_id, name, amount_cents, due_month, due_day) select family_id,'x',100,1,1 from members where user_id = auth.uid()$q$, 'kid cannot create bills');
select t.as_user(:Q);
select t.ok((select count(*) from bills) = 0, 'outside family sees no bills');
select t.fails(format($q$insert into bills (family_id, name, amount_cents, due_month, due_day, category_id) select family_id,'x',100,1,1,%L::uuid from members where user_id = auth.uid()$q$, :'cat'), 'bill cannot use another family''s category');
select t.as_user(:P);
select t.fails($q$insert into bills (family_id, name, amount_cents, times_per_year, due_month, due_day) select family_id,'x',100,3,1,1 from members where user_id = auth.uid()$q$, 'only 1, 2, 4 or 12 payments a year');
select t.fails($q$insert into bills (family_id, name, amount_cents, due_month, due_day) select family_id,'x',100,13,1 from members where user_id = auth.uid()$q$, 'month must be 1-12');
select t.fails($q$insert into bills (family_id, name, amount_cents, due_month, due_day) select family_id,'  ',100,1,1 from members where user_id = auth.uid()$q$, 'blank bill name rejected');

-- marking paid
select id as car from bills where name = 'Car insurance' \gset
select id as water from bills where name = 'Water' \gset
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 62000, current_date)', :'car', '2026-04-15'), 'wrong month is not a due date');
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 62000, current_date)', :'car', '2026-03-14'), 'wrong day is not a due date');
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 0, current_date)', :'car', '2026-03-15'), 'zero amount rejected');
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 62000, current_date + 1)', :'car', '2026-03-15'), 'future payment date rejected');
select mark_bill_paid(:'car'::uuid, '2026-03-15', 60500, '2026-03-10') as e1 \gset
select t.ok((select amount_cents from expenses where id = :'e1'::uuid) = 60500, 'expense created with the actual amount paid');
select t.ok((select bill_id from expenses where id = :'e1'::uuid) = :'car'::uuid, 'expense is flagged with the bill');
select t.ok((select category_id from expenses where id = :'e1'::uuid) = :'cat'::uuid, 'expense uses the bill''s category');
select t.ok((select spent_on from expenses where id = :'e1'::uuid) = '2026-03-10', 'expense dated on the payment date');
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 60500, current_date)', :'car', '2026-03-15'), 'cannot pay the same due date twice');
-- quarterly bill due on the 31st: clamps to short months (Feb 28, Aug 31, Nov 30, May 31)
select mark_bill_paid(:'water'::uuid, '2026-02-28', 9000, '2026-02-27');
select mark_bill_paid(:'water'::uuid, '2026-11-30', 9000, '2026-11-01') as e2 \gset
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 9000, current_date)', :'water', '2026-03-31'), 'quarterly: March is not a due month');
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 9000, current_date)', :'water', '2026-11-29'), 'quarterly: day must be the clamped due day');
select t.ok((select count(*) from bill_payments) = 3, 'three payments recorded');

-- who can do what
select t.as_user(:C1);
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 100, current_date)', :'car', '2027-03-15'), 'kid cannot mark bills paid');
select t.ok((select count(*) from bill_payments) = 0, 'kid cannot see payments');
select t.fails($q$insert into expenses (family_id, member_id, amount_cents, bill_id) select family_id, user_id, 100, (select id from bills limit 1) from members where user_id = auth.uid()$q$, 'kid cannot flag an expense as a bill');
select t.fails($q$update expenses set bill_id = null$q$, 'nobody can change bill_id through the API');
select t.as_user(:P);
select t.fails($q$update expenses set bill_id = null$q$, 'not even a parent can unflag an expense through the API');
select t.as_user(:Q);
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 100, current_date)', :'car', '2027-03-15'), 'outside parent cannot pay another family''s bill');
select t.fails(format('select unmark_bill_paid((select id from bill_payments limit 1))'), 'outside parent: no payment visible');

-- ordinary expenses still work for kids (column grants allow the normal columns)
select t.as_user(:C1);
select t.ok(true, 'before kid insert');
insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on)
  select family_id, user_id, null, 250, 'ice cream', '2026-07-04' from members where user_id = auth.uid();
select t.ok((select count(*) from expenses where note = 'ice cream') = 1, 'kid can still log a normal expense');

-- undo
select t.as_user(:P);
select t.ok(exists (select 1 from expenses where id = :'e2'::uuid), 'bill expense exists before undo');
select unmark_bill_paid((select id from bill_payments where expense_id = :'e2'::uuid));
select t.ok(not exists (select 1 from expenses where id = :'e2'::uuid), 'undo removes the expense');
select t.ok((select count(*) from bill_payments) = 2, 'and the payment record');
select mark_bill_paid(:'water'::uuid, '2026-11-30', 9000, '2026-11-02');
select t.ok(true, 'can be paid again after undo');
-- deleting the expense directly also makes it unpaid
delete from expenses where id = (select expense_id from bill_payments where due_on = '2026-11-30');
select t.ok((select count(*) from bill_payments where due_on = '2026-11-30') = 0, 'deleting the expense frees the due date');

-- ended bills
select t.su(); update bills set archived = true where id = :'water'::uuid;
select t.as_user(:P);
select t.fails(format('select mark_bill_paid(%L::uuid, %L::date, 100, current_date)', :'water', '2026-05-31'), 'ended bill cannot be paid');
select t.fails(format('delete from bills where id = %L::uuid', :'water'), 'a bill with payment history cannot be deleted');

-- category management
select t.fails($q$insert into categories (family_id, name) select family_id, ' groceries ' from members where user_id = auth.uid()$q$, 'duplicate category name (any case) rejected');
insert into categories (family_id, name, emoji) select family_id, 'Pets', '🐶' from members where user_id = auth.uid();
select t.ok(true, 'parent adds a category');
update categories set archived = true where name = 'Pets';
select t.ok((select archived from categories where name = 'Pets'), 'parent archives a category');
select t.as_user(:C1);
select t.fails($q$insert into categories (family_id, name) select family_id, 'Sweets' from members where user_id = auth.uid()$q$, 'kid cannot add categories');
update categories set budget_cents = 99999999;   -- RLS hides every row from a child: no error, but no effect
select t.su();
select t.ok((select max(budget_cents) from categories) < 99999999, 'kid cannot change budgets (the update touches no rows)');

-- year summary
select t.su();
insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on)
  select family_id, user_id, null, 1000, 'a', '2026-01-10' from members where user_id = :P;
insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on)
  select family_id, user_id, null, 500, 'b', '2026-01-20' from members where user_id = :P;
insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on)
  select family_id, user_id, null, 700, 'c', '2025-12-31' from members where user_id = :P;
select t.as_user(:P);
select t.ok((select total_cents from year_summary(2026) where month = 1 and not is_bill) = 1500, 'January everyday total sums same-category rows');
select t.ok((select total_cents from year_summary(2026) where month = 3 and is_bill) = 60500, 'March bill payment shown separately');
select t.ok((select count(*) from year_summary(2026) where month = 12) = 0, 'other years are excluded');
select t.ok((select total_cents from year_summary(2025) where month = 12) = 700, 'year boundary is exact (31 Dec belongs to 2025)');
select t.as_user(:C1);
select t.ok((select count(*) from year_summary(2026)) = 0, 'a child gets no yearly summary');
select t.as_user(:Q);
select t.ok((select count(*) from year_summary(2026)) = 0, 'another family''s parent sees none of it');
select t.su();
select t.ok((select count(*) from expenses e join bill_payments bp on bp.expense_id = e.id where e.bill_id <> bp.bill_id) = 0, 'every payment matches its expense''s bill');

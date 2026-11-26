-- Annual fee tests. Run AFTER jars.sql, goals.sql, bills.sql, edit_expenses.sql, receipts.sql, monthly_fees.sql and tags.sql.
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set Q '''00000000-0000-0000-0000-000000000004'''

select t.su();
select family_id as fam from members where user_id = :P \gset
select id as cat from categories where family_id = :'fam'::uuid and name = 'Groceries' \gset

-- clients can mark an expense as an annual fee when adding it
select t.as_user(:P);
insert into expenses (id, family_id, member_id, category_id, amount_cents, note, spent_on, annual_fee)
  values ('aa222222-0000-0000-0000-000000000001', :'fam'::uuid, :P, :'cat'::uuid, 9900, 'Sports club, annual fee', '2026-09-03', true);
insert into expenses (id, family_id, member_id, category_id, amount_cents, note, spent_on)
  values ('aa222222-0000-0000-0000-000000000002', :'fam'::uuid, :P, :'cat'::uuid, 1000, 'ordinary', '2026-09-04');
select t.ok((select annual_fee from expenses where id = 'aa222222-0000-0000-0000-000000000001'), 'an expense can be added as an annual fee');
select t.ok(not (select annual_fee from expenses where id = 'aa222222-0000-0000-0000-000000000002'), 'the flag starts off');

-- the yearly summary keeps it apart, like a yearly bill
select t.ok((select total_cents from year_summary(2026) where month = 9 and is_bill and category_id = :'cat'::uuid) = 9900, 'September: the annual fee is reported as kept apart');
select t.ok((select total_cents from year_summary(2026) where month = 9 and not is_bill and category_id = :'cat'::uuid) = 1000, 'and is not part of September''s everyday spending');

-- it can be turned off and on again, and edits still work
update expenses set annual_fee = false where id = 'aa222222-0000-0000-0000-000000000001';
select t.ok((select total_cents from year_summary(2026) where month = 9 and not is_bill and category_id = :'cat'::uuid) = 10900, 'turned off: it is everyday spending again');
update expenses set annual_fee = true, note = 'Sports club (yearly)' where id = 'aa222222-0000-0000-0000-000000000002';
select t.ok((select total_cents from year_summary(2026) where month = 9 and is_bill and category_id = :'cat'::uuid) = 1000, 'an existing expense can be marked afterwards');
update expenses set annual_fee = false where id = 'aa222222-0000-0000-0000-000000000002';

-- a child can mark their own, not other people's
select t.as_user(:C1);
insert into expenses (id, family_id, member_id, category_id, amount_cents, note, spent_on, annual_fee)
  values ('aa222222-0000-0000-0000-000000000003', :'fam'::uuid, :C1, :'cat'::uuid, 2000, 'game pass, yearly', '2026-09-05', true);
update expenses set annual_fee = true where id = 'aa222222-0000-0000-0000-000000000002';
select t.su();
select t.ok((select annual_fee from expenses where id = 'aa222222-0000-0000-0000-000000000003'), 'a child can mark their own expense');
select t.ok(not (select annual_fee from expenses where id = 'aa222222-0000-0000-0000-000000000002'), 'but not a parent''s (no effect)');

-- nobody outside the family can touch it
select t.as_user(:Q);
update expenses set annual_fee = false where id = 'aa222222-0000-0000-0000-000000000003';
select t.su();
select t.ok((select annual_fee from expenses where id = 'aa222222-0000-0000-0000-000000000003'), 'another family cannot change the flag (no effect)');

-- bill payments cannot be flagged (their record is changed by undoing the payment), and bill_id is still not writable
select t.as_user(:P);
select id as bill_expense from expenses where bill_id is not null and family_id = :'fam'::uuid limit 1 \gset
update expenses set annual_fee = true where id = :'bill_expense'::uuid;
select t.su();
select t.ok(not (select annual_fee from expenses where id = :'bill_expense'::uuid), 'a bill payment cannot be flagged (no effect)');
select t.as_user(:P);
select t.fails(format($q$insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on, bill_id) values (%L::uuid, %L::uuid, %L::uuid, 100, 'x', '2026-09-06', %L::uuid)$q$, :'fam', :P, :'cat', (select id from bills limit 1)), 'the bill link still cannot be set through the API');

-- the flag does not count as a "correction" (the edited stamp is about amount, category, note and date)
select t.su();
select t.ok((select edited_at from expenses where id = 'aa222222-0000-0000-0000-000000000003') is null, 'marking a fee does not stamp the expense as edited');
\echo annual fee tests done

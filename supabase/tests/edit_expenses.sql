-- Expense editing tests. Run AFTER jars.sql, goals.sql and bills.sql (reuses their users and family).
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set C2 '''00000000-0000-0000-0000-000000000003'''
\set Q '''00000000-0000-0000-0000-000000000004'''

select t.su();
select family_id as fam from members where user_id = :P \gset
select id as cat from categories where family_id = :'fam'::uuid and name = 'Groceries' \gset
select id as qcat from categories where name = 'Groceries' and family_id <> :'fam'::uuid limit 1 \gset
insert into expenses (id, family_id, member_id, category_id, amount_cents, note, spent_on) values
  ('11111111-0000-0000-0000-000000000001', :'fam'::uuid, :C1, :'cat'::uuid, 1250, 'sweets', '2026-05-01'),
  ('11111111-0000-0000-0000-000000000002', :'fam'::uuid, :C2, :'cat'::uuid, 800, 'book', '2026-05-02'),
  ('11111111-0000-0000-0000-000000000003', :'fam'::uuid, :P, :'cat'::uuid, 4000, 'shopping', '2026-05-03');
select t.ok((select edited_at from expenses where id = '11111111-0000-0000-0000-000000000001') is null, 'new expenses have no edit stamp');

-- a kid fixes their own typo
select t.as_user(:C1);
update expenses set amount_cents = 125, note = 'sweets (fixed)' where id = '11111111-0000-0000-0000-000000000001';
select t.ok((select amount_cents from expenses where id = '11111111-0000-0000-0000-000000000001') = 125, 'kid can correct their own amount');
select t.ok((select edited_by from expenses where id = '11111111-0000-0000-0000-000000000001') = :C1, 'edit is stamped with who edited');
select t.ok((select edited_at from expenses where id = '11111111-0000-0000-0000-000000000001') > now() - interval '1 minute', 'and when');

-- but not someone else's
update expenses set amount_cents = 1 where id = '11111111-0000-0000-0000-000000000002';
update expenses set amount_cents = 1 where id = '11111111-0000-0000-0000-000000000003';
select t.su();
select t.ok((select amount_cents from expenses where id = '11111111-0000-0000-0000-000000000002') = 800, 'kid cannot edit a sibling''s expense (no effect)');
select t.ok((select amount_cents from expenses where id = '11111111-0000-0000-0000-000000000003') = 4000, 'kid cannot edit a parent''s expense (no effect)');

-- a parent can fix anyone's, and the stamp names the parent
select t.as_user(:P);
update expenses set amount_cents = 850, spent_on = '2026-05-04' where id = '11111111-0000-0000-0000-000000000002';
select t.ok((select amount_cents from expenses where id = '11111111-0000-0000-0000-000000000002') = 850, 'parent can correct a child''s expense');
select t.ok((select edited_by from expenses where id = '11111111-0000-0000-0000-000000000002') = :P, 'stamp names the parent');
select t.ok((select member_id from expenses where id = '11111111-0000-0000-0000-000000000002') = :C2, 'the original author is kept');

-- a no-op save does not create a stamp
update expenses set note = 'shopping' where id = '11111111-0000-0000-0000-000000000003';
select t.ok((select edited_at from expenses where id = '11111111-0000-0000-0000-000000000003') is null, 'saving without changes leaves no edit mark');

-- fields clients may never touch
select t.as_user(:C1);
select t.fails($q$update expenses set member_id = (select user_id from members where role = 'parent' limit 1) where id = '11111111-0000-0000-0000-000000000001'$q$, 'cannot reassign who spent it');
select t.fails($q$update expenses set family_id = gen_random_uuid() where id = '11111111-0000-0000-0000-000000000001'$q$, 'cannot move an expense to another family');
select t.fails($q$update expenses set edited_by = null, edited_at = null where id = '11111111-0000-0000-0000-000000000001'$q$, 'cannot erase the edit stamp');
select t.fails($q$update expenses set bill_id = null where id = '11111111-0000-0000-0000-000000000001'$q$, 'cannot touch bill_id');

-- value rules still apply
select t.fails($q$update expenses set amount_cents = 0 where id = '11111111-0000-0000-0000-000000000001'$q$, 'zero amount rejected on edit');
select t.fails($q$update expenses set amount_cents = -5 where id = '11111111-0000-0000-0000-000000000001'$q$, 'negative amount rejected on edit');
select t.fails(format($q$update expenses set category_id = %L::uuid where id = '11111111-0000-0000-0000-000000000001'$q$, :'qcat'), 'cannot file an expense under another family''s category');
update expenses set category_id = null where id = '11111111-0000-0000-0000-000000000001';
select t.ok((select category_id from expenses where id = '11111111-0000-0000-0000-000000000001') is null, 'can clear the category');

-- bill payments are not editable here
select t.as_user(:P);
select id as billexp from expenses where bill_id is not null limit 1 \gset
update expenses set amount_cents = 1 where id = :'billexp'::uuid;
select t.su();
select t.ok((select amount_cents from expenses where id = :'billexp'::uuid) <> 1, 'a bill payment cannot be edited through the API');

-- outsiders
select t.as_user(:Q);
update expenses set amount_cents = 1 where id = '11111111-0000-0000-0000-000000000003';
select t.su();
select t.ok((select amount_cents from expenses where id = '11111111-0000-0000-0000-000000000003') = 4000, 'another family cannot edit it');

-- deleting
select t.as_user(:C1);
delete from expenses where id = '11111111-0000-0000-0000-000000000002';
delete from expenses where id = '11111111-0000-0000-0000-000000000001';
select t.su();
select t.ok(exists (select 1 from expenses where id = '11111111-0000-0000-0000-000000000002'), 'kid cannot delete a sibling''s expense');
select t.ok(not exists (select 1 from expenses where id = '11111111-0000-0000-0000-000000000001'), 'kid can delete their own');
select t.as_user(:P);
delete from expenses where id = '11111111-0000-0000-0000-000000000002';
select t.su();
select t.ok(not exists (select 1 from expenses where id = '11111111-0000-0000-0000-000000000002'), 'parent can delete a child''s expense');

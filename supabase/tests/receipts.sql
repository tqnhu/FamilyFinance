-- Receipt photo and import-batch tests. Run AFTER jars.sql, goals.sql, bills.sql and edit_expenses.sql.
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set C2 '''00000000-0000-0000-0000-000000000003'''
\set Q '''00000000-0000-0000-0000-000000000004'''

select t.su();
select family_id as fam from members where user_id = :P \gset
select family_id as qfam from members where user_id = :Q \gset
insert into expenses (id, family_id, member_id, amount_cents, note, spent_on) values
  ('22222222-0000-0000-0000-000000000001', :'fam'::uuid, :C1, 500, 'kid1', '2026-06-01'),
  ('22222222-0000-0000-0000-000000000002', :'fam'::uuid, :C2, 600, 'kid2', '2026-06-01'),
  ('22222222-0000-0000-0000-000000000003', :'fam'::uuid, :P, 700, 'parent', '2026-06-01');
select t.ok((select public from storage.buckets where id = 'receipts') = false, 'the receipts bucket is private');
select t.ok((select file_size_limit from storage.buckets where id = 'receipts') <= 5242880, 'the bucket has a size limit');
select t.ok((select allowed_mime_types from storage.buckets where id = 'receipts') = array['image/jpeg'], 'only JPEG photos are accepted');

-- uploading
select t.as_user(:C1);
insert into storage.objects (bucket_id, name) values ('receipts', :'fam' || '/22222222-0000-0000-0000-000000000001/a.jpg');
select t.ok(true, 'a kid can upload to their own expense');
select t.fails(format($q$insert into storage.objects (bucket_id, name) values ('receipts', %L)$q$, :'fam' || '/22222222-0000-0000-0000-000000000002/a.jpg'), 'a kid cannot upload to a sibling''s expense');
select t.fails(format($q$insert into storage.objects (bucket_id, name) values ('receipts', %L)$q$, :'fam' || '/22222222-0000-0000-0000-000000000003/a.jpg'), 'a kid cannot upload to a parent''s expense');
select t.fails(format($q$insert into storage.objects (bucket_id, name) values ('receipts', %L)$q$, :'fam' || '/99999999-0000-0000-0000-000000000009/a.jpg'), 'cannot upload for an expense that does not exist');
select t.fails(format($q$insert into storage.objects (bucket_id, name) values ('receipts', %L)$q$, :'qfam' || '/22222222-0000-0000-0000-000000000001/a.jpg'), 'cannot upload into another family''s folder');
select t.fails($q$insert into storage.objects (bucket_id, name) values ('receipts', 'loose.jpg')$q$, 'a file outside an expense folder is refused');
select t.as_user(:P);
insert into storage.objects (bucket_id, name) values ('receipts', :'fam' || '/22222222-0000-0000-0000-000000000002/b.jpg');
insert into storage.objects (bucket_id, name) values ('receipts', :'fam' || '/22222222-0000-0000-0000-000000000001/b.jpg');
select t.ok(true, 'a parent can upload to any family expense');
select t.as_user(:Q);
select t.fails(format($q$insert into storage.objects (bucket_id, name) values ('receipts', %L)$q$, :'fam' || '/22222222-0000-0000-0000-000000000003/x.jpg'), 'another family cannot upload to ours');

-- who can see which photo
select t.as_user(:C1); select t.ok((select count(*) from storage.objects where bucket_id = 'receipts') = 2, 'kid 1 sees only the 2 photos on their own expense');
select t.as_user(:C2); select t.ok((select count(*) from storage.objects where bucket_id = 'receipts') = 1, 'kid 2 sees only the 1 photo on their own expense');
select t.as_user(:P);  select t.ok((select count(*) from storage.objects where bucket_id = 'receipts') = 3, 'a parent sees all the family''s photos');
select t.as_user(:Q);  select t.ok((select count(*) from storage.objects where bucket_id = 'receipts') = 0, 'another family sees none');

-- changing and deleting
select t.as_user(:C2);
delete from storage.objects where name like '%000000000001/a.jpg';
update storage.objects set name = :'fam' || '/22222222-0000-0000-0000-000000000002/stolen.jpg' where name like '%000000000001/b.jpg';
select t.su();
select t.ok((select count(*) from storage.objects where name like '%000000000001/%') = 2, 'a kid cannot delete or rename a sibling''s photo');
select t.as_user(:C1);
update storage.objects set name = :'fam' || '/22222222-0000-0000-0000-000000000001/renamed.jpg' where name like '%000000000001/a.jpg';
select t.su();
select t.ok(not exists (select 1 from storage.objects where name like '%renamed.jpg'), 'photos cannot be renamed or moved (no update policy)');
select t.as_user(:C1);
delete from storage.objects where name like '%000000000001/a.jpg';
select t.ok((select count(*) from storage.objects where name like '%000000000001/a.jpg') = 0, 'a kid can delete their own photo');
select t.as_user(:P);
delete from storage.objects where name like '%000000000002/b.jpg';
select t.ok((select count(*) from storage.objects where name like '%000000000002/b.jpg') = 0, 'a parent can delete a child''s photo');

-- the path stored on the expense
select t.as_user(:C1);
update expenses set receipt_path = :'fam' || '/22222222-0000-0000-0000-000000000001/b.jpg' where id = '22222222-0000-0000-0000-000000000001';
select t.ok((select receipt_path from expenses where id = '22222222-0000-0000-0000-000000000001') is not null, 'a kid can attach a photo path to their expense');
select t.fails(format($q$update expenses set receipt_path = %L where id = '22222222-0000-0000-0000-000000000001'$q$, :'fam' || '/22222222-0000-0000-0000-000000000002/b.jpg'), 'a path into another expense''s folder is rejected');
select t.fails(format($q$update expenses set receipt_path = %L where id = '22222222-0000-0000-0000-000000000001'$q$, :'qfam' || '/22222222-0000-0000-0000-000000000001/b.jpg'), 'a path into another family''s folder is rejected');
update expenses set receipt_path = :'fam' || '/22222222-0000-0000-0000-000000000002/z.jpg' where id = '22222222-0000-0000-0000-000000000002';
select t.su();
select t.ok((select receipt_path from expenses where id = '22222222-0000-0000-0000-000000000002') is null, 'a kid cannot attach a photo to a sibling''s expense (no effect)');
select t.as_user(:C1);
update expenses set receipt_path = null where id = '22222222-0000-0000-0000-000000000001';
select t.ok((select receipt_path from expenses where id = '22222222-0000-0000-0000-000000000001') is null, 'the photo path can be cleared');
select t.fails(format($q$insert into expenses (family_id, member_id, amount_cents, receipt_path) select family_id, user_id, 100, 'x/y/z.jpg' from members where user_id = %L$q$, :C1), 'a new expense cannot be created with a photo path already set');
select t.as_user(:P);
select t.ok((select edited_at from expenses where id = '22222222-0000-0000-0000-000000000001') is null, 'adding or removing a photo does not count as editing the expense');

-- ids chosen by the client, and import batches
select t.as_user(:C1);
insert into expenses (id, family_id, member_id, amount_cents, note, spent_on, import_batch)
  select '33333333-0000-0000-0000-000000000001', family_id, user_id, 100, 'kid import', '2026-06-02', '44444444-0000-0000-0000-000000000001' from members where user_id = :C1;
select t.ok(exists (select 1 from expenses where id = '33333333-0000-0000-0000-000000000001'), 'an expense can be created with a client-chosen id and batch');
select t.fails($q$insert into expenses (id, family_id, member_id, amount_cents) select '33333333-0000-0000-0000-000000000001', family_id, user_id, 100 from members where user_id = auth.uid()$q$, 'a duplicate id is refused');
select t.as_user(:P);
insert into expenses (family_id, member_id, amount_cents, note, spent_on, import_batch)
  select family_id, user_id, 200 + g, 'bank row', '2026-06-03', '44444444-0000-0000-0000-000000000001' from members, generate_series(1, 3) g where user_id = :P;
insert into expenses (family_id, member_id, amount_cents, note, spent_on, import_batch)
  select family_id, user_id, 900, 'other import', '2026-06-03', '44444444-0000-0000-0000-000000000002' from members where user_id = :P;
select t.ok((select count(*) from expenses where import_batch = '44444444-0000-0000-0000-000000000001') = 4, 'a batch groups its rows (including a kid''s)');
select t.as_user(:C2);
delete from expenses where import_batch = '44444444-0000-0000-0000-000000000001';
select t.su();
select t.ok((select count(*) from expenses where import_batch = '44444444-0000-0000-0000-000000000001') = 4, 'a kid cannot undo someone else''s import');
select t.as_user(:Q);
delete from expenses where import_batch = '44444444-0000-0000-0000-000000000001';
select t.su();
select t.ok((select count(*) from expenses where import_batch = '44444444-0000-0000-0000-000000000001') = 4, 'another family cannot undo our import');
select t.as_user(:P);
delete from expenses where import_batch = '44444444-0000-0000-0000-000000000001';
select t.ok((select count(*) from expenses where import_batch = '44444444-0000-0000-0000-000000000001') = 0, 'a parent can undo a whole import');
select t.ok((select count(*) from expenses where import_batch = '44444444-0000-0000-0000-000000000002') = 1, 'and other imports are untouched');

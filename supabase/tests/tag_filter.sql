-- Year summary by tag tests. Run AFTER jars.sql ... annual_fee.sql and classification_rules.sql (reuses their users and families).
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set Q '''00000000-0000-0000-0000-000000000004'''

select t.su();
select family_id as fam from members where user_id = :P \gset
select family_id as qfam from members where user_id = :Q \gset
select id as cat from categories where family_id = :'fam'::uuid and name = 'Fun' \gset
select id as cat2 from categories where family_id = :'fam'::uuid and name = 'Groceries' \gset
insert into tags (id, family_id, name, created_by) values
  ('dd000000-0000-0000-0000-000000000001', :'fam'::uuid, 'Trip', :P), ('dd000000-0000-0000-0000-000000000002', :'fam'::uuid, 'Party', :P),
  ('dd000000-0000-0000-0000-000000000003', :'qfam'::uuid, 'Theirs', :Q) on conflict do nothing;
insert into expenses (id, family_id, member_id, category_id, amount_cents, note, spent_on, annual_fee) values
  ('ee000000-0000-0000-0000-000000000001', :'fam'::uuid, :P, :'cat'::uuid, 10000, 'flight', '2031-03-05', false),
  ('ee000000-0000-0000-0000-000000000002', :'fam'::uuid, :P, :'cat2'::uuid, 2500, 'snacks', '2031-03-09', false),
  ('ee000000-0000-0000-0000-000000000003', :'fam'::uuid, :P, :'cat'::uuid, 4000, 'cake', '2031-03-20', false),
  ('ee000000-0000-0000-0000-000000000004', :'fam'::uuid, :P, :'cat'::uuid, 900, 'untagged', '2031-04-02', false),
  ('ee000000-0000-0000-0000-000000000005', :'fam'::uuid, :P, :'cat'::uuid, 60000, 'club fee', '2031-04-03', true),
  ('ee000000-0000-0000-0000-000000000006', :'fam'::uuid, :P, :'cat'::uuid, 700, 'last year', '2030-12-31', false),
  ('ee000000-0000-0000-0000-000000000007', :'fam'::uuid, :P, :'cat'::uuid, 3000, 'party trip', '2031-03-21', false);
insert into expense_tags (expense_id, tag_id) values
  ('ee000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001'), ('ee000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000001'),
  ('ee000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000002'), ('ee000000-0000-0000-0000-000000000005', 'dd000000-0000-0000-0000-000000000001'),
  ('ee000000-0000-0000-0000-000000000006', 'dd000000-0000-0000-0000-000000000001'),
  ('ee000000-0000-0000-0000-000000000007', 'dd000000-0000-0000-0000-000000000001'), ('ee000000-0000-0000-0000-000000000007', 'dd000000-0000-0000-0000-000000000002');

select t.as_user(:P);
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[]) where not is_bill) = 15500, 'one tag: only its everyday spending is added up (including the party trip tagged with both)');
select t.ok((select total_cents from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[]) where is_bill) = 60000, 'a tagged annual fee is reported as kept apart, as everywhere else');
select t.ok((select count(*) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[]) where month = 3 and category_id = :'cat2'::uuid) = 1 and (select total_cents from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[]) where month = 3 and category_id = :'cat2'::uuid) = 2500, 'rows are per month and category');
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002']::uuid[]) where not is_bill) = 19500, 'several tags: an expense carrying two of them is counted once (12,500 + 4,000 + 3,000)');
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array[]::uuid[], true) where not is_bill) = 900, 'only the untagged ones');
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000002']::uuid[], true) where not is_bill) = 7900, 'a tag plus the untagged');
select t.ok((select count(*) from year_summary_by_tag(2031, null, false)) = 0 and (select count(*) from year_summary_by_tag(2031, array[]::uuid[], false)) = 0, 'nothing chosen: nothing returned');
select t.ok((select sum(total_cents) from year_summary_by_tag(2030, array['dd000000-0000-0000-0000-000000000001']::uuid[])) = 700, 'the year boundary is exact (31 Dec belongs to 2030)');
select t.ok((select count(*) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000003']::uuid[])) = 0, 'another family''s tag matches nothing');
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002']::uuid[], true)) = (select sum(total_cents) from year_summary(2031)), 'every tag plus untagged adds up to the whole year');

select t.ok((select total_cents from tags_total(array['dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002']::uuid[], false, '2031-03-01', '2031-04-01')) = 19500 and (select n from tags_total(array['dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002']::uuid[], false, '2031-03-01', '2031-04-01')) = 4, 'all time or a period: an expense with two chosen tags is counted once');
select t.ok((select total_cents from tags_total(array[]::uuid[], true)) = (select sum(amount_cents) from expenses e where not exists (select 1 from expense_tags x where x.expense_id = e.id)), 'untagged only');
select t.ok((select total_cents from tags_total(null)) = 0, 'nothing chosen adds up to nothing');

select t.as_user(:C1);
select t.ok((select total_cents from tags_total(array['dd000000-0000-0000-0000-000000000001']::uuid[])) = 0, 'a child gets no total');
select t.ok((select count(*) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[])) = 0, 'a child gets nothing');
select t.as_user(:Q);
select t.ok((select count(*) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[], true)) = 0, 'another family''s parent sees none of it');
select t.su();
\echo tag filter tests done

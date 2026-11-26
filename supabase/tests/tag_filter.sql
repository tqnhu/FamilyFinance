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
insert into expenses (id, family_id, member_id, category_id, amount_cents, note, spent_on, tag_id, annual_fee) values
  ('ee000000-0000-0000-0000-000000000001', :'fam'::uuid, :P, :'cat'::uuid, 10000, 'flight', '2031-03-05', 'dd000000-0000-0000-0000-000000000001', false),
  ('ee000000-0000-0000-0000-000000000002', :'fam'::uuid, :P, :'cat2'::uuid, 2500, 'snacks', '2031-03-09', 'dd000000-0000-0000-0000-000000000001', false),
  ('ee000000-0000-0000-0000-000000000003', :'fam'::uuid, :P, :'cat'::uuid, 4000, 'cake', '2031-03-20', 'dd000000-0000-0000-0000-000000000002', false),
  ('ee000000-0000-0000-0000-000000000004', :'fam'::uuid, :P, :'cat'::uuid, 900, 'untagged', '2031-04-02', null, false),
  ('ee000000-0000-0000-0000-000000000005', :'fam'::uuid, :P, :'cat'::uuid, 60000, 'club fee', '2031-04-03', 'dd000000-0000-0000-0000-000000000001', true),
  ('ee000000-0000-0000-0000-000000000006', :'fam'::uuid, :P, :'cat'::uuid, 700, 'last year', '2030-12-31', 'dd000000-0000-0000-0000-000000000001', false);

select t.as_user(:P);
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[]) where not is_bill) = 12500, 'one tag: only its everyday spending is added up');
select t.ok((select total_cents from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[]) where is_bill) = 60000, 'a tagged annual fee is reported as kept apart, as everywhere else');
select t.ok((select count(*) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[]) where month = 3 and category_id = :'cat2'::uuid) = 1 and (select total_cents from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[]) where month = 3 and category_id = :'cat2'::uuid) = 2500, 'rows are per month and category');
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002']::uuid[]) where not is_bill) = 16500, 'several tags add up (one tag per expense, so nothing is counted twice)');
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array[]::uuid[], true) where not is_bill) = 900, 'only the untagged ones');
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000002']::uuid[], true) where not is_bill) = 4900, 'a tag plus the untagged');
select t.ok((select count(*) from year_summary_by_tag(2031, null, false)) = 0 and (select count(*) from year_summary_by_tag(2031, array[]::uuid[], false)) = 0, 'nothing chosen: nothing returned');
select t.ok((select sum(total_cents) from year_summary_by_tag(2030, array['dd000000-0000-0000-0000-000000000001']::uuid[])) = 700, 'the year boundary is exact (31 Dec belongs to 2030)');
select t.ok((select count(*) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000003']::uuid[])) = 0, 'another family''s tag matches nothing');
select t.ok((select sum(total_cents) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002']::uuid[], true)) = (select sum(total_cents) from year_summary(2031)), 'every tag plus untagged adds up to the whole year');

select t.as_user(:C1);
select t.ok((select count(*) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[])) = 0, 'a child gets nothing');
select t.as_user(:Q);
select t.ok((select count(*) from year_summary_by_tag(2031, array['dd000000-0000-0000-0000-000000000001']::uuid[], true)) = 0, 'another family''s parent sees none of it');
select t.su();
\echo tag filter tests done

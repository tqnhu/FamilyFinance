-- Tag tests. Run AFTER jars.sql ... monthly_fees.sql (reuses their users and family).
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set C2 '''00000000-0000-0000-0000-000000000003'''
\set Q '''00000000-0000-0000-0000-000000000004'''

select t.su();
select family_id as fam from members where user_id = :P \gset
select family_id as qfam from members where user_id = :Q \gset

-- creating and managing tags
select t.as_user(:P);
insert into tags (family_id, name, created_by) values (:'fam'::uuid, 'Vietnam trip', :P);
select t.ok(true, 'a parent creates a tag');
select t.fails(format($q$insert into tags (family_id, name, created_by) values (%L::uuid, ' vietnam TRIP ', %L::uuid)$q$, :'fam', :P), 'a duplicate name (any case, any spaces) is refused');
select t.fails(format($q$insert into tags (family_id, name, created_by) values (%L::uuid, '   ', %L::uuid)$q$, :'fam', :P), 'a blank name is refused');
select t.fails(format($q$insert into tags (family_id, name, created_by) values (%L::uuid, %L, %L::uuid)$q$, :'fam', repeat('x', 41), :P), 'a name over 40 characters is refused');
select t.fails(format($q$insert into tags (family_id, name, created_by) values (%L::uuid, 'Fake author', %L::uuid)$q$, :'fam', :C1), 'a tag cannot be created in someone else''s name');
select t.fails(format($q$insert into tags (family_id, name, created_by) values (%L::uuid, 'Elsewhere', %L::uuid)$q$, :'qfam', :P), 'a tag cannot be created in another family');
select t.as_user(:C1);
insert into tags (family_id, name, created_by) values (:'fam'::uuid, 'School trip', :C1);
select t.ok(true, 'a child can create a tag too');
select t.ok((select count(*) from tags) = 2, 'everyone in the family sees all the tags');
update tags set name = 'Renamed by kid', archived = true;
delete from tags;
select t.su();
select t.ok((select count(*) from tags where name in ('Vietnam trip', 'School trip') and not archived) = 2, 'a child cannot rename, archive or delete tags (no effect)');
select t.as_user(:Q); select t.ok((select count(*) from tags) = 0, 'another family sees no tags');
insert into tags (family_id, name, created_by) values (:'qfam'::uuid, 'Vietnam trip', :Q);
select t.ok(true, 'the same name can exist in another family');
select t.su(); select id as vn from tags where name = 'Vietnam trip' and family_id = :'fam'::uuid \gset
select id as school from tags where name = 'School trip' \gset
select id as qtag from tags where family_id = :'qfam'::uuid \gset
select t.as_user(:P);
update tags set name = 'Vietnam 2026' where id = :'vn'::uuid;
select t.ok((select name from tags where id = :'vn'::uuid) = 'Vietnam 2026', 'a parent can rename a tag');
select t.fails(format($q$update tags set family_id = %L::uuid where id = %L::uuid$q$, :'qfam', :'vn'), 'a tag cannot be moved to another family');
select t.fails(format($q$update tags set created_by = null where id = %L::uuid$q$, :'vn'), 'created_by cannot be rewritten');

-- tagging expenses
select t.su();
insert into expenses (id, family_id, member_id, amount_cents, note, spent_on) values
  ('55555555-0000-0000-0000-000000000001', :'fam'::uuid, :P,  10000, 'flights',  '2026-03-10'),
  ('55555555-0000-0000-0000-000000000002', :'fam'::uuid, :P,   2500, 'hotel',    '2026-03-20'),
  ('55555555-0000-0000-0000-000000000003', :'fam'::uuid, :P,   4000, 'food',     '2026-04-02'),
  ('55555555-0000-0000-0000-000000000004', :'fam'::uuid, :P,   1000, 'old trip', '2025-12-30'),
  ('55555555-0000-0000-0000-000000000005', :'fam'::uuid, :C1,   700, 'excursion','2026-03-25'),
  ('55555555-0000-0000-0000-000000000006', :'fam'::uuid, :P,    900, 'untagged', '2026-03-26');
select t.as_user(:P);
insert into expense_tags (expense_id, tag_id) select id, :'vn'::uuid from expenses where id in ('55555555-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000004');
select t.ok((select count(*) from expense_tags where tag_id = :'vn'::uuid) = 4, 'a parent tags expenses');
select t.fails(format($q$insert into expense_tags (expense_id, tag_id) values ('55555555-0000-0000-0000-000000000006', %L::uuid)$q$, :'qtag'), 'an expense cannot get another family''s tag');
select t.fails(format($q$insert into expense_tags (expense_id, tag_id) values ('55555555-0000-0000-0000-000000000001', %L::uuid)$q$, :'vn'), 'the same tag cannot be put on an expense twice');
select t.as_user(:C1);
insert into expense_tags (expense_id, tag_id) values ('55555555-0000-0000-0000-000000000005', :'school'::uuid);
select t.ok((select count(*) from expense_tags where expense_id = '55555555-0000-0000-0000-000000000005' and tag_id = :'school'::uuid) = 1, 'a child tags their own expense');
select t.fails($q$insert into expense_tags (expense_id, tag_id) select '55555555-0000-0000-0000-000000000006', id from tags limit 1$q$, 'but not a parent''s expense');
select t.ok((select count(*) from expense_tags where expense_id = '55555555-0000-0000-0000-000000000001') = 0, 'and a child does not even see the tags of a parent''s expense');
insert into expenses (id, family_id, member_id, amount_cents, note, spent_on) values ('55555555-0000-0000-0000-000000000007', :'fam'::uuid, :C1, 300, 'new with tag', '2026-03-27');
insert into expense_tags (expense_id, tag_id) values ('55555555-0000-0000-0000-000000000007', :'school'::uuid);
select t.ok(true, 'a child can create an expense and tag it');
select t.fails($q$update expenses set edited_at = now()$q$, 'tagging goes through the same protected columns (edit stamp still locked)');
select t.as_user(:P);
select t.ok((select edited_at from expenses where id = '55555555-0000-0000-0000-000000000001') is null, 'tagging is not an edit: no "edited by" mark appears on the expense');

-- the totals
select t.as_user(:P);
select t.ok((select total_cents from tag_totals('2026-03-01', '2026-04-01') where tag_id = :'vn'::uuid) = 12500, 'March 2026: flights + hotel = 12,500');
select t.ok((select n from tag_totals('2026-03-01', '2026-04-01') where tag_id = :'vn'::uuid) = 2, 'with a count of 2');
select t.ok((select total_cents from tag_totals('2026-01-01', '2027-01-01') where tag_id = :'vn'::uuid) = 16500, 'year 2026: 16,500 (the December 2025 one is outside)');
select t.ok((select total_cents from tag_totals() where tag_id = :'vn'::uuid) = 17500, 'all time: 17,500');
select t.ok((select total_cents from tag_totals('2026-03-01', '2026-04-01') where tag_id = :'school'::uuid) = 1000, 'a child''s tagged expenses (700 + 300) count for the family');
select t.ok((select total_cents from tag_totals('2026-03-01', '2026-04-01') where tag_id is null) is not null, 'expenses without a tag are reported too (tag_id null)');
select t.ok((select total_cents from tag_totals('2026-03-01', '2026-04-01') where tag_id is null) = (select sum(amount_cents) from expenses e where spent_on >= '2026-03-01' and spent_on < '2026-04-01' and not exists (select 1 from expense_tags x where x.expense_id = e.id)), '"no tag" is exactly the expenses without any tag');
select t.ok((select sum(total_cents) from tag_totals()) = (select sum(e.amount_cents) from expenses e join expense_tags x on x.expense_id = e.id) + (select sum(amount_cents) from expenses e where not exists (select 1 from expense_tags x where x.expense_id = e.id)), 'every tagged expense counts once per tag it carries');
select t.ok((select total_cents from tag_totals('2026-03-01', '2026-03-31') where tag_id = :'vn'::uuid) = 12500, 'a period runs up to its end date (to 31 March counts the 10th and 20th)');
select t.ok((select total_cents from tag_totals('2026-03-01', '2026-04-02') where tag_id = :'vn'::uuid) = 12500, 'the end date itself is excluded (food on 2 April is out when the period ends 2 April)');
select t.ok((select total_cents from tag_totals('2026-03-01', '2026-04-03') where tag_id = :'vn'::uuid) = 16500, 'and in when the period ends the day after');
select t.ok((select total_cents from tag_totals('2026-03-10', '2026-03-11') where tag_id = :'vn'::uuid) = 10000, 'a single day works (10 March: the flights)');
select t.ok((select count(*) from tag_totals('2030-01-01', '2031-01-01')) = 0, 'an empty period has no rows');
select t.ok((select jsonb_agg(jsonb_build_array(month::text, total_cents, n) order by month) from tag_months(:'vn'::uuid)) = '[["2025-12-01", 1000, 1], ["2026-03-01", 12500, 2], ["2026-04-01", 4000, 1]]'::jsonb, 'by month: Dec 2025, Mar 2026, Apr 2026 with sums and counts');
select t.ok((select count(*) from tag_months(:'vn'::uuid, '2026-01-01', '2027-01-01')) = 2, 'by month, limited to a year');
select t.as_user(:C1);
select t.ok((select count(*) from tag_totals()) = 0 and (select count(*) from tag_months(:'vn'::uuid)) = 0, 'a child gets no tag reports');
select t.as_user(:Q);
select t.ok((select count(*) from tag_totals()) = 0 and (select count(*) from tag_months(:'vn'::uuid)) = 0, 'another family''s parent sees none of it');
select t.ok((select count(*) from tag_months(:'qtag'::uuid)) = 0, 'and none for their own unused tag');

-- deleting a tag untags, it does not delete expenses
select t.as_user(:P);
insert into tags (family_id, name, created_by) values (:'fam'::uuid, 'Temp', :P);
select id as tmp from tags where name = 'Temp' and family_id = :'fam'::uuid \gset
insert into expense_tags (expense_id, tag_id) values ('55555555-0000-0000-0000-000000000006', :'tmp'::uuid);
delete from tags where id = :'tmp'::uuid;
select t.ok(not exists (select 1 from expense_tags where expense_id = '55555555-0000-0000-0000-000000000006') and exists (select 1 from expenses where id = '55555555-0000-0000-0000-000000000006'), 'deleting a tag untags its expenses and keeps them');

-- bills carry a default tag onto their payments
insert into bills (family_id, name, amount_cents, times_per_year, due_month, due_day, tag_id) values (:'fam'::uuid, 'Tagged insurance', 5000, 1, 3, 12, :'vn'::uuid);
select id as tb from bills where name = 'Tagged insurance' \gset
select t.fails(format($q$insert into bills (family_id, name, amount_cents, due_month, due_day, tag_id) values (%L::uuid, 'Bad', 100, 1, 1, %L::uuid)$q$, :'fam', :'qtag'), 'a bill cannot carry another family''s tag');
select mark_bill_paid(:'tb'::uuid, '2026-03-12', 5000, '2026-03-12') as te \gset
select t.ok((select count(*) from expense_tags where expense_id = :'te'::uuid and tag_id = :'vn'::uuid) = 1, 'paying a tagged bill tags the payment');
select t.ok((select total_cents from tag_totals('2026-03-01', '2026-04-01') where tag_id = :'vn'::uuid) = 17500, 'and it is included in the tag total (12,500 + 5,000)');
select t.su(); update bills set tag_id = null where id = :'tb'::uuid;
select t.ok((select count(*) from expense_tags where expense_id = :'te'::uuid and tag_id = :'vn'::uuid) = 1, 'changing the bill''s tag later does not rewrite past payments');
select t.as_user(:C1);
select t.ok((select count(*) from expenses where bill_id is not null) = 0, 'a child still cannot see bill payments');

-- bulk tagging: one statement over many ids changes only what the person may edit
select t.su();
insert into expenses (id, family_id, member_id, amount_cents, note, spent_on) values
  ('66666666-0000-0000-0000-000000000001', :'fam'::uuid, :C1, 100, 'kid a', '2026-05-01'),
  ('66666666-0000-0000-0000-000000000002', :'fam'::uuid, :C1, 200, 'kid b', '2026-05-02'),
  ('66666666-0000-0000-0000-000000000003', :'fam'::uuid, :C2, 300, 'sibling', '2026-05-03'),
  ('66666666-0000-0000-0000-000000000004', :'fam'::uuid, :P,  400, 'parent', '2026-05-04');
select t.as_user(:C1);
insert into expense_tags (expense_id, tag_id) select id, :'school'::uuid from expenses where id::text like '66666666%';
select t.ok((select count(*) from expense_tags where tag_id = :'school'::uuid and expense_id::text like '66666666%') = 2, 'a child''s bulk tagging reaches only the two expenses they can see');
select t.fails(format($q$insert into expense_tags (expense_id, tag_id) values ('66666666-0000-0000-0000-000000000003', %L::uuid)$q$, :'school'), 'and tagging a sibling''s expense directly is refused');
select t.as_user(:P);
select t.fails(format($q$insert into expense_tags (expense_id, tag_id) values (%L::uuid, %L::uuid)$q$, :'te', :'school'), 'a bill payment cannot be tagged by hand, even by a parent (mark_bill_paid does it)');
select t.as_user(:P);
insert into expense_tags (expense_id, tag_id) select id, :'vn'::uuid from expenses where id::text like '66666666%';
select t.ok((select count(*) from expense_tags where tag_id = :'vn'::uuid and expense_id::text like '66666666%') = 4, 'a parent bulk-tags all four');
delete from expense_tags where expense_id in ('66666666-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002') and tag_id = :'vn'::uuid;
select t.ok((select count(*) from expense_tags where tag_id = :'vn'::uuid and expense_id::text like '66666666%') = 2, 'and removes a tag from two of them');
select t.ok((select edited_at from expenses where id = '66666666-0000-0000-0000-000000000001') is null, 'tagging does not mark expenses as edited');
select t.as_user(:Q);
delete from expense_tags where expense_id::text like '66666666%';
select t.su();
select t.ok((select count(*) from expense_tags where expense_id::text like '66666666%') = 4, 'another family''s delete changes nothing');
select t.as_user(:P);

-- several tags per expense
insert into tags (family_id, name, created_by) select :'fam'::uuid, 'Extra' || g, :P from generate_series(1, 5) g;
select array_agg(id order by name) as xs from tags where name like 'Extra%' \gset
select t.ok(true, 'five more tags exist');
insert into expense_tags (expense_id, tag_id) select '66666666-0000-0000-0000-000000000004', unnest((:'xs')::uuid[]) limit 4;
select t.ok((select count(*) from expense_tags where expense_id = '66666666-0000-0000-0000-000000000004') = 5, 'an expense can carry 5 tags (the first tag plus 4 more)');
select t.fails(format($q$insert into expense_tags (expense_id, tag_id) values ('66666666-0000-0000-0000-000000000004', (select id from tags where name = 'Extra5'))$q$), 'a sixth tag is refused');
select t.ok((select total_cents from tag_totals('2026-05-01', '2026-06-01') where tag_id = :'vn'::uuid) = 700, 'in the totals the expense counts in full under each of its tags (700 includes the full 400)');
select t.ok((select count(*) from expenses where id = '66666666-0000-0000-0000-000000000004') = 1, 'while the expense itself still exists once');
delete from expenses where id = '66666666-0000-0000-0000-000000000004';
select t.ok((select count(*) from expense_tags where expense_id = '66666666-0000-0000-0000-000000000004') = 0, 'deleting an expense removes its tag links');

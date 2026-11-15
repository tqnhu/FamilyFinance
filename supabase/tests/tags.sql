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
update expenses set tag_id = :'vn'::uuid where id in ('55555555-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000004');
select t.ok((select count(*) from expenses where tag_id = :'vn'::uuid) = 4, 'a parent tags expenses');
select t.fails(format($q$update expenses set tag_id = %L::uuid where id = '55555555-0000-0000-0000-000000000006'$q$, :'qtag'), 'an expense cannot get another family''s tag');
select t.fails(format($q$insert into expenses (family_id, member_id, amount_cents, tag_id) values (%L::uuid, %L::uuid, 100, %L::uuid)$q$, :'fam', :P, :'qtag'), 'nor can a new one be created with it');
select t.as_user(:C1);
update expenses set tag_id = :'school'::uuid where id = '55555555-0000-0000-0000-000000000005';
select t.ok((select tag_id from expenses where id = '55555555-0000-0000-0000-000000000005') = :'school'::uuid, 'a child tags their own expense');
update expenses set tag_id = :'school'::uuid where id = '55555555-0000-0000-0000-000000000006';
select t.su();
select t.ok((select tag_id from expenses where id = '55555555-0000-0000-0000-000000000006') is null, 'but not a parent''s (no effect)');
select t.as_user(:C1);
insert into expenses (family_id, member_id, amount_cents, note, spent_on, tag_id) values (:'fam'::uuid, :C1, 300, 'new with tag', '2026-03-27', :'school'::uuid);
select t.ok(true, 'a child can create an expense with a tag from the start');
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
select t.ok((select sum(total_cents) from tag_totals('2026-03-01', '2026-04-01')) = (select sum(amount_cents) from expenses where spent_on >= '2026-03-01' and spent_on < '2026-04-01'), 'tags + "no tag" add up exactly to all spending in the period');
select t.ok((select sum(total_cents) from tag_totals()) = (select sum(amount_cents) from expenses), 'and for all time');
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
update expenses set tag_id = :'tmp'::uuid where id = '55555555-0000-0000-0000-000000000006';
delete from tags where id = :'tmp'::uuid;
select t.ok((select tag_id from expenses where id = '55555555-0000-0000-0000-000000000006') is null and exists (select 1 from expenses where id = '55555555-0000-0000-0000-000000000006'), 'deleting a tag untags its expenses and keeps them');

-- bills carry a default tag onto their payments
insert into bills (family_id, name, amount_cents, times_per_year, due_month, due_day, tag_id) values (:'fam'::uuid, 'Tagged insurance', 5000, 1, 3, 12, :'vn'::uuid);
select id as tb from bills where name = 'Tagged insurance' \gset
select t.fails(format($q$insert into bills (family_id, name, amount_cents, due_month, due_day, tag_id) values (%L::uuid, 'Bad', 100, 1, 1, %L::uuid)$q$, :'fam', :'qtag'), 'a bill cannot carry another family''s tag');
select mark_bill_paid(:'tb'::uuid, '2026-03-12', 5000, '2026-03-12') as te \gset
select t.ok((select tag_id from expenses where id = :'te'::uuid) = :'vn'::uuid, 'paying a tagged bill tags the payment');
select t.ok((select total_cents from tag_totals('2026-03-01', '2026-04-01') where tag_id = :'vn'::uuid) = 17500, 'and it is included in the tag total (12,500 + 5,000)');
select t.su(); update bills set tag_id = null where id = :'tb'::uuid;
select t.ok((select tag_id from expenses where id = :'te'::uuid) = :'vn'::uuid, 'changing the bill''s tag later does not rewrite past payments');
select t.as_user(:C1);
select t.ok((select count(*) from expenses where bill_id is not null) = 0, 'a child still cannot see bill payments');

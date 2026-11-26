-- Classification rule tests. Run AFTER jars.sql ... tags.sql and annual_fee.sql (reuses their users and families).
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set Q '''00000000-0000-0000-0000-000000000004'''

select t.su();
select family_id as fam from members where user_id = :P \gset
select family_id as qfam from members where user_id = :Q \gset
select id as cat from categories where family_id = :'fam'::uuid and name = 'Fun' \gset
select id as cat2 from categories where family_id = :'fam'::uuid and name = 'Groceries' \gset
select id as qcat from categories where family_id = :'qfam'::uuid limit 1 \gset
insert into tags (id, family_id, name, created_by) values ('bb000000-0000-0000-0000-000000000001', :'fam'::uuid, 'Sports', :P), ('bb000000-0000-0000-0000-000000000002', :'qfam'::uuid, 'Theirs', :Q) on conflict do nothing;

-- a parent can add rules
select t.as_user(:P);
insert into classification_rules (family_id, pattern, category_id, tag_id, annual_fee, created_by)
  values (:'fam'::uuid, 'sportclub', :'cat'::uuid, 'bb000000-0000-0000-0000-000000000001', true, :P);
insert into classification_rules (family_id, pattern, min_cents, category_id, created_by)
  values (:'fam'::uuid, 'shell', 6000, :'cat2'::uuid, :P);
select id as r1 from classification_rules where pattern = 'sportclub' \gset
select id as r2 from classification_rules where pattern = 'shell' \gset
select t.ok((select count(*) from classification_rules) = 2, 'a parent can add and read rules');
select t.ok((select status from classification_rules where id = :'r1'::uuid) = 'on', 'a new rule is on');

-- the rules are checked by the database, not just the app
select t.fails(format($q$insert into classification_rules (family_id, pattern, category_id, created_by) values (%L::uuid, 'Upper', %L::uuid, %L::uuid)$q$, :'fam', :'cat', :P), 'a pattern must be lower case (it is compared that way)');
select t.fails(format($q$insert into classification_rules (family_id, pattern, category_id, created_by) values (%L::uuid, 'x', %L::uuid, %L::uuid)$q$, :'fam', :'cat', :P), 'a pattern needs at least 2 characters');
select t.fails(format($q$insert into classification_rules (family_id, pattern, min_cents, max_cents, category_id, created_by) values (%L::uuid, 'range', 500, 100, %L::uuid, %L::uuid)$q$, :'fam', :'cat', :P), 'the smallest amount cannot be above the largest');
select t.fails(format($q$insert into classification_rules (family_id, pattern, category_id, created_by) values (%L::uuid, 'sportclub', %L::uuid, %L::uuid)$q$, :'fam', :'cat2', :P), 'the same pattern and range cannot be added twice');
select t.fails(format($q$insert into classification_rules (family_id, pattern, category_id, created_by) values (%L::uuid, 'other fam cat', %L::uuid, %L::uuid)$q$, :'fam', :'qcat', :P), 'a rule cannot point at another family''s category');
select t.fails(format($q$insert into classification_rules (family_id, pattern, category_id, tag_id, created_by) values (%L::uuid, 'other fam tag', %L::uuid, 'bb000000-0000-0000-0000-000000000002', %L::uuid)$q$, :'fam', :'cat', :P), 'nor at another family''s tag');
select t.fails(format($q$insert into classification_rules (family_id, pattern, category_id, created_by) values (%L::uuid, 'someone else', %L::uuid, %L::uuid)$q$, :'qfam', :'qcat', :P), 'a parent cannot add a rule to another family');
select t.fails(format($q$insert into classification_rules (family_id, pattern, category_id, created_by) values (%L::uuid, 'fake author', %L::uuid, %L::uuid)$q$, :'fam', :'cat', :Q), 'the author must be the person adding it');

-- edit and switch off
update classification_rules set status = 'off', annual_fee = false where id = :'r1'::uuid;
select t.ok((select status from classification_rules where id = :'r1'::uuid) = 'off' and not (select annual_fee from classification_rules where id = :'r1'::uuid), 'a rule can be switched off and changed');
select t.fails(format($q$update classification_rules set category_id = %L::uuid where id = %L::uuid$q$, :'qcat', :'r1'), 'changing a rule cannot move it to another family''s category');
select t.fails(format($q$update classification_rules set status = 'whatever' where id = %L::uuid$q$, :'r1'), 'status has three values');
select t.fails(format($q$update classification_rules set family_id = %L::uuid where id = %L::uuid$q$, :'qfam', :'r1'), 'a rule cannot be moved to another family (the family column cannot be changed)');

-- a child can read the rules (they get suggestions) but not change them
select t.as_user(:C1);
select t.ok((select count(*) from classification_rules) = 2, 'a child can read the family''s rules');
select t.fails(format($q$insert into classification_rules (family_id, pattern, category_id, created_by) values (%L::uuid, 'kid rule', %L::uuid, %L::uuid)$q$, :'fam', :'cat', :C1), 'a child cannot add a rule');
update classification_rules set status = 'on' where id = :'r1'::uuid;
delete from classification_rules where id = :'r2'::uuid;
select t.su();
select t.ok((select status from classification_rules where id = :'r1'::uuid) = 'off', 'a child cannot change a rule (no effect)');
select t.ok(exists (select 1 from classification_rules where id = :'r2'::uuid), 'nor delete one (no effect)');

-- another family sees and touches nothing
select t.as_user(:Q);
select t.ok((select count(*) from classification_rules) = 0, 'another family sees none of the rules');
update classification_rules set status = 'on';
delete from classification_rules;
select t.su();
select t.ok((select count(*) from classification_rules) = 2, 'and cannot change or delete them (no effect)');

-- a signed-out visitor gets nothing
reset role; select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ declare r text; begin
  begin perform count(*) from classification_rules; r := 'read'; exception when others then r := 'refused'; end;
  if r <> 'refused' then raise exception 'FAIL: a signed-out visitor reached the rules table'; end if;
  raise notice 'PASS: a signed-out visitor cannot read the rules table';
end $$;
reset role;

-- deleting
select t.as_user(:P);
delete from classification_rules where id = :'r2'::uuid;
select t.ok((select count(*) from classification_rules) = 1, 'a parent can delete a rule');
select t.su();

-- a family is capped at 300 rules
insert into classification_rules (family_id, pattern, category_id, created_by)
  select :'fam'::uuid, 'bulk ' || g, :'cat'::uuid, :P from generate_series(1, 299) g;
select t.as_user(:P);
select t.fails(format($q$insert into classification_rules (family_id, pattern, category_id, created_by) values (%L::uuid, 'one too many', %L::uuid, %L::uuid)$q$, :'fam', :'cat', :P), 'a family cannot have more than 300 rules');
select t.su();
\echo classification rule tests done

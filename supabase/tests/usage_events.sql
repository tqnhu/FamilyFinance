-- Usage event tests. Run AFTER jars.sql ... tag_filter.sql (reuses their users and families).
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set Q '''00000000-0000-0000-0000-000000000004'''

select t.su();
select family_id as fam from members where user_id = :P \gset
select family_id as qfam from members where user_id = :Q \gset
delete from usage_events;

select t.as_user(:P);
select record_usage('home');
select t.su();
select t.ok((select count(*) from usage_events where member_id = :P) = 1, 'opening a screen records one event');
select t.as_user(:P);
select record_usage('home'); select record_usage('home');
select t.su();
select t.ok((select count(*) from usage_events where member_id = :P and kind = 'home') = 1, 'opening it again the same day adds nothing (at most one a day per screen)');
select t.as_user(:P); select record_usage('review');
select t.su();
select t.ok((select count(*) from usage_events where member_id = :P) = 2, 'another screen is another event');
select t.ok((select family_id from usage_events where member_id = :P limit 1) = :'fam'::uuid, 'the event carries the person''s own family');

select t.as_user(:C1); select record_usage('jars');
select t.su();
select t.ok((select count(*) from usage_events where member_id = :C1 and kind = 'jars') = 1, 'a child is recorded too (a count per member, nothing else)');

select t.as_user(:Q); select record_usage('goals');
select t.su();
select t.ok((select family_id from usage_events where member_id = :Q) = :'qfam'::uuid, 'another family''s event belongs to that family');

select t.as_user(:P);
select t.fails($q$select record_usage('somewhere-else')$q$, 'an unknown screen is refused');
select t.fails($q$select record_usage(null)$q$, 'so is an empty one');
select t.fails($q$select count(*) from usage_events$q$, 'nobody can read the events through the API, not even their own');
select t.fails(format($q$insert into usage_events (family_id, member_id, kind) values (%L::uuid, %L::uuid, 'home')$q$, :'fam', :P), 'nor write them directly');
select t.fails(format($q$delete from usage_events where member_id = %L::uuid$q$, :P), 'nor delete them');
select t.su();
select t.ok(not has_function_privilege('anon', 'record_usage(text)', 'execute'), 'a signed-out visitor cannot call it');
select t.ok(not has_table_privilege('authenticated', 'usage_events', 'select') and not has_table_privilege('anon', 'usage_events', 'select'), 'no role of the API has any access to the table');
select t.ok(not exists (select 1 from information_schema.columns where table_name = 'usage_events' and column_name in ('amount_cents', 'note', 'name', 'email')), 'the table has no amount, note, name or email column');
\echo usage event tests done

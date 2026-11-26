-- Function access tests: who may call what, and fixed search paths. Self-contained; run on a database with schema.sql loaded.
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin
  if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'PASS: %', msg; end $$;
create function pg_temp.can(role text, fn text) returns boolean language sql as $$ select has_function_privilege(role, fn::regprocedure, 'execute') $$;

-- every function the app calls is open to signed-in people
select pg_temp.ok(bool_and(pg_temp.can('authenticated', f)), 'signed-in people can call all ' || count(*) || ' functions the app uses')
from unnest(array[
  'create_family(text,text)', 'join_family(text,text)', 'family_codes()', 'set_username(text)', 'set_my_name(text)', 'rename_family(text)', 'rotate_invite_codes()',
  'set_allowance(uuid,integer,integer,integer,integer,integer)', 'add_money(uuid,text,integer,text)', 'move_money(uuid,text,text,integer)',
  'request_purchase(text,text,integer)', 'cancel_request(uuid)', 'decide_purchase(uuid,boolean,text)', 'settle_allowance()', 'child_stats(uuid)',
  'create_goal(text,text,integer,date)', 'contribute_cash(uuid,integer)', 'contribute_from_save(uuid,integer)', 'cancel_goal(uuid)',
  'mark_bill_paid(uuid,date,integer,date)', 'unmark_bill_paid(uuid)', 'year_summary(integer)', 'year_summary_by_tag(integer,uuid[],boolean)', 'tag_totals(date,date)', 'tag_months(uuid,date,date)',
  'email_for_username(text)', 'is_parent()', 'my_family()']) f;

-- ...and a signed-out visitor can call exactly one: the username lookup used at sign-in
select pg_temp.ok(pg_temp.can('anon', 'email_for_username(text)'), 'a signed-out visitor can still look up a username (needed to sign in with one)');
select pg_temp.ok(count(*) = 0, 'a signed-out visitor can call none of the other ' || (count(*) + 27) || ' app functions' )
from unnest(array[
  'create_family(text,text)', 'join_family(text,text)', 'family_codes()', 'set_username(text)', 'set_my_name(text)', 'rename_family(text)', 'rotate_invite_codes()',
  'set_allowance(uuid,integer,integer,integer,integer,integer)', 'add_money(uuid,text,integer,text)', 'move_money(uuid,text,text,integer)',
  'request_purchase(text,text,integer)', 'cancel_request(uuid)', 'decide_purchase(uuid,boolean,text)', 'settle_allowance()', 'child_stats(uuid)',
  'create_goal(text,text,integer,date)', 'contribute_cash(uuid,integer)', 'contribute_from_save(uuid,integer)', 'cancel_goal(uuid)',
  'mark_bill_paid(uuid,date,integer,date)', 'unmark_bill_paid(uuid)', 'year_summary(integer)', 'year_summary_by_tag(integer,uuid[],boolean)', 'tag_totals(date,date)', 'tag_months(uuid,date,date)',
  'is_parent()', 'my_family()']) f where pg_temp.can('anon', f);
select pg_temp.ok(not pg_temp.can('public', 'join_family(text,text)') and not pg_temp.can('public', 'my_family()'), 'nor through the catch-all PUBLIC permission');

-- internal helpers stay closed to everyone
select pg_temp.ok(count(*) = 0, 'internal helper functions are callable by nobody from outside')
from unnest(array['lock_child(uuid)', 'jar_balance(uuid,text)', 'pending_total(uuid,text)', 'assert_my_child(uuid)', 'goal_raised(uuid)', 'check_goal_reached(uuid)', 'normalize_code(text)', 'family_has_data(uuid)']) f
where pg_temp.can('anon', f) or pg_temp.can('authenticated', f);

-- fixed search paths
select pg_temp.ok((select proconfig from pg_proc where oid = 'normalize_code(text)'::regprocedure) = array['search_path=""'], 'normalize_code has a fixed, empty search_path');
select pg_temp.ok((select proconfig from pg_proc where oid = 'stamp_expense_edit()'::regprocedure) = array['search_path=""'], 'stamp_expense_edit has a fixed, empty search_path');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and p.proconfig is null),
  'every SECURITY DEFINER function in the app has a fixed search_path');

-- a signed-out visitor reading a table gets nothing (an error, since the row rules cannot even run for them)
insert into auth.users values ('77777777-0000-0000-0000-000000000001', 'priv@x') on conflict do nothing;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ declare r text; begin
  begin perform count(*) from expenses; r := 'read'; exception when others then r := 'refused'; end;
  if r <> 'refused' then raise exception 'FAIL: a signed-out visitor reached the expenses table'; end if;
  raise notice 'PASS: a signed-out visitor cannot read the expenses table';
  begin perform * from members; r := 'read'; exception when others then r := 'refused'; end;
  if r <> 'refused' then raise exception 'FAIL: a signed-out visitor reached the members table'; end if;
  raise notice 'PASS: nor the members table';
end $$;
reset role;

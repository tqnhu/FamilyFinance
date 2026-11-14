-- Joining tests. Self-contained: run on any database that has schema.sql loaded (it makes its own users and families).
create function pg_temp.act(u uuid, q text) returns text language plpgsql as $$
declare r text;
begin
  reset role; perform set_config('request.jwt.claim.sub', u::text, false); set role authenticated;
  begin execute q into r; exception when others then r := 'ERROR: ' || sqlerrm; end;
  reset role; return r;
end $$;
create function pg_temp.join(u uuid, code text, nm text default 'Newcomer') returns text language sql as
  $$ select pg_temp.act(u, format('select join_family(%L, %L)', code, nm)) $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin
  if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'PASS: %', msg; end $$;

insert into auth.users select ('99999999-0000-0000-0000-00000000' || lpad(g::text, 4, '0'))::uuid, 'j' || g || '@x' from generate_series(1, 60) g;
\set HOST '''99999999-0000-0000-0000-000000000001'''
select pg_temp.act(:HOST, $$select create_family('Join test family', 'Host')::text$$);
select parent_code as pc, kid_code as kc from families where name = 'Join test family' \gset
select ('99999999-0000-0000-0000-00000000' || lpad(g::text, 4, '0')) as u2 from (select 2 g) x \gset

-- the code is matched leniently
select pg_temp.ok(normalize_code(' 6D10-5e94 BEE5 ') = '6d105e94bee5', 'normalising ignores case, spaces and dashes');
select pg_temp.ok(normalize_code(E'\n6d105e94bee5​') = '6d105e94bee5', 'and newlines and zero-width characters');
select pg_temp.ok(normalize_code('6dl05e94bee5') = '6d105e94bee5' and normalize_code('6dI05e94bee5') = '6d105e94bee5' and normalize_code('6d1O5e94bee5') = '6d105e94bee5', 'and I, l, O typed for 1, 1, 0');
select pg_temp.ok(normalize_code(null) = '', 'a missing code is just empty');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000002', upper(:'pc')) = 'parent', 'an UPPERCASE code works (phone keyboards capitalise)');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000003', ' ' || substr(:'kc', 1, 6) || '-' || substr(:'kc', 7) || E'\n') = 'child', 'a code pasted with a dash, spaces and a newline works');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000004', :'pc' || U&'\200B') = 'parent', 'a code with an invisible character from a chat app works');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000005', :'kc') = 'child', 'the exact kid code gives the child role');
select pg_temp.ok((select role from members where user_id = '99999999-0000-0000-0000-000000000003') = 'child', 'and the member is stored as a child');
select pg_temp.ok((select display_name from members where user_id = '99999999-0000-0000-0000-000000000003') = 'Newcomer', 'with their name');
select pg_temp.ok((select count(distinct family_id) from members where user_id between '99999999-0000-0000-0000-000000000001' and '99999999-0000-0000-0000-000000000005') = 1, 'everyone ended up in the same family');

-- wrong or missing input
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000006', 'aaaaaaaaaaaa') = 'invalid_code', 'a well-formed wrong code is invalid');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000006', 'abc') = 'invalid_code', 'a too-short code is invalid');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000006', '') = 'invalid_code', 'an empty code is invalid');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000006', :'pc', '   ') = 'name_required', 'a blank name is refused with a clear reason');
select pg_temp.ok((select count(*) from members where user_id = '99999999-0000-0000-0000-000000000006') = 0, 'and nothing was created');
select pg_temp.ok(pg_temp.act('99999999-0000-0000-0000-000000000006', $$select join_family('x','y')$$) = 'invalid_code', 'invalid codes are returned, not raised');
reset role; select pg_temp.ok(pg_temp.act(null, $$select join_family('x','y')$$) like 'ERROR: not signed in', 'joining without being signed in is refused');

-- the retry limit: only well-formed wrong codes count, and 30 an hour
select pg_temp.ok((select count(*) from join_attempts where user_id = '99999999-0000-0000-0000-000000000006') = 1, 'only the one well-formed wrong guess was counted (not "abc" or empty)');
select pg_temp.join('99999999-0000-0000-0000-000000000007', 'abc' || g) from generate_series(1, 50) g;
select pg_temp.ok((select count(*) from join_attempts where user_id = '99999999-0000-0000-0000-000000000007') = 0, 'fifty malformed typos use up none of the allowance');
select pg_temp.join('99999999-0000-0000-0000-000000000008', 'bbbbbbbbbb' || lpad(g::text, 2, '0')) from generate_series(10, 39) g;
select pg_temp.ok((select count(*) from join_attempts where user_id = '99999999-0000-0000-0000-000000000008') = 30, '30 well-formed wrong guesses are counted');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000008', 'cccccccccccc') = 'too_many_attempts', 'the 31st is refused');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000008', :'pc') = 'too_many_attempts', 'and so is the right code, or guessing would still work');
update join_attempts set attempted_at = now() - interval '2 hours' where user_id = '99999999-0000-0000-0000-000000000008';
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000008', :'pc') = 'parent', 'after an hour the limit lifts');

-- already belonging to a family
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000002', :'pc') = 'already_in_this_family', 'joining the family you are already in is harmless');
-- a new family made by mistake, still empty: the person can move
select pg_temp.act('99999999-0000-0000-0000-000000000009', $$select create_family('Oops family', 'Hau')::text$$);
select pg_temp.ok((select count(*) from families where name = 'Oops family') = 1, 'a person created a family by mistake');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000009', :'pc', 'Hau') = 'parent', 'they can still join the real family');
select pg_temp.ok((select count(*) from families where name = 'Oops family') = 0, 'and the empty family they made is gone');
select pg_temp.ok((select count(*) from members where user_id = '99999999-0000-0000-0000-000000000009') = 1, 'with exactly one membership');
select pg_temp.ok((select count(*) from categories c join families f on f.id = c.family_id where f.name = 'Oops family') = 0, 'and its default categories are gone');
-- ...but not if they have recorded something
select pg_temp.act('99999999-0000-0000-0000-000000000010', $$select create_family('Busy family', 'Busy')::text$$);
insert into expenses (family_id, member_id, amount_cents) select family_id, user_id, 500 from members where user_id = '99999999-0000-0000-0000-000000000010';
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000010', :'pc') = 'already_member', 'a family with an expense is never deleted');
select pg_temp.ok((select count(*) from expenses e join members m on m.user_id = e.member_id where m.user_id = '99999999-0000-0000-0000-000000000010') = 1, 'and the expense is still there');
-- ...or if somebody else is in it
select pg_temp.act('99999999-0000-0000-0000-000000000011', $$select create_family('Shared family', 'Sam')::text$$);
select kid_code as skc from families where name = 'Shared family' \gset
select pg_temp.join('99999999-0000-0000-0000-000000000012', :'skc');
select pg_temp.ok(pg_temp.join('99999999-0000-0000-0000-000000000011', :'pc') = 'already_member', 'a family with other members is never deleted');
-- each kind of recorded data protects the family from being deleted
create function pg_temp.protected(n int, kind text) returns boolean language plpgsql as $$
declare u uuid := ('99999999-0000-0000-0000-00000000' || lpad(n::text, 4, '0'))::uuid; fid uuid; res text;
begin
  perform pg_temp.act(u, format('select create_family(%L, %L)::text', 'Data family ' || kind, 'D'));
  select family_id into fid from members where user_id = u;
  if kind = 'goal' then insert into goals (family_id, name, target_cents) values (fid, 'g', 1000);
  elsif kind = 'bill' then insert into bills (family_id, name, amount_cents, due_month, due_day) values (fid, 'b', 1000, 1, 1);
  elsif kind = 'jar' then insert into jar_entries (family_id, child_id, jar, amount_cents, kind) values (fid, u, 'spend', 100, 'deposit');
  elsif kind = 'allowance' then insert into allowances (child_id, family_id, weekly_cents) values (u, fid, 500);
  elsif kind = 'request' then insert into purchase_requests (family_id, child_id, item, amount_cents) values (fid, u, 'toy', 100);
  end if;
  res := pg_temp.join(u, (select parent_code from families where name = 'Join test family'));
  return res = 'already_member' and exists (select 1 from families where id = fid);
end $$;
select pg_temp.ok(pg_temp.protected(21, 'goal'), 'a family with a goal is kept');
select pg_temp.ok(pg_temp.protected(22, 'bill'), 'a family with a bill is kept');
select pg_temp.ok(pg_temp.protected(23, 'jar'), 'a family with jar money is kept');
select pg_temp.ok(pg_temp.protected(24, 'allowance'), 'a family with an allowance is kept');
select pg_temp.ok(pg_temp.protected(25, 'request'), 'a family with a purchase request is kept');

-- the function is not callable for anything else
select pg_temp.ok(pg_temp.act('99999999-0000-0000-0000-000000000002', $$select normalize_code('x')$$) like 'ERROR: permission denied%', 'the helper functions are not callable from the app');
select pg_temp.ok(pg_temp.act('99999999-0000-0000-0000-000000000002', $$select family_has_data(gen_random_uuid())::text$$) like 'ERROR: permission denied%', 'family_has_data is not callable from the app');

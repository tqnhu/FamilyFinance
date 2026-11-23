-- Profile and family settings tests. Self-contained (own users and families).
create function pg_temp.act(u uuid, q text) returns text language plpgsql as $$
declare r text;
begin
  reset role; perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); set role authenticated;
  begin execute q into r; exception when others then r := 'ERROR: ' || sqlerrm; end;
  reset role; return r;
end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin
  if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'PASS: %', msg; end $$;

insert into auth.users select ('88888888-0000-0000-0000-00000000' || lpad(g::text, 4, '0'))::uuid, 'p' || g || '@x' from generate_series(1, 8) g;
\set PA '''88888888-0000-0000-0000-000000000001'''
\set KID '''88888888-0000-0000-0000-000000000002'''
\set PB '''88888888-0000-0000-0000-000000000003'''
\set OUT '''88888888-0000-0000-0000-000000000004'''
\set NEW '''88888888-0000-0000-0000-000000000005'''
\set LONE '''88888888-0000-0000-0000-000000000006'''
select pg_temp.act(:PA, $$select create_family('Profile family', 'Alex')::text$$);
select pg_temp.act(:OUT, $$select create_family('Other profile family', 'Olga')::text$$);
select parent_code as pc, kid_code as kc from families where name = 'Profile family' \gset
select pg_temp.act(:KID, format($$select join_family(%L, 'Kiddo')$$, :'kc'));
select pg_temp.act(:PB, format($$select join_family(%L, 'Bo')$$, :'pc'));

-- changing your own name
select pg_temp.ok(pg_temp.act(:KID, $$select set_my_name('  Mia Rose  ')$$) = 'ok', 'a child can change their own name');
select pg_temp.ok((select display_name from members where user_id = :KID) = 'Mia Rose', 'it is trimmed');
select pg_temp.ok((select display_name from members where user_id = :PA) = 'Alex' and (select display_name from members where user_id = :PB) = 'Bo', 'nobody else''s name changed');
select pg_temp.ok(pg_temp.act(:KID, $$select set_my_name('   ')$$) = 'invalid', 'a blank name is refused with a reason');
select pg_temp.ok(pg_temp.act(:KID, format($$select set_my_name(%L)$$, repeat('x', 41))) = 'invalid', 'a 41 character name is refused');
select pg_temp.ok(pg_temp.act(:KID, format($$select set_my_name(%L)$$, repeat('x', 40))) = 'ok', 'a 40 character name is fine');
select pg_temp.ok(pg_temp.act(:KID, $$select set_my_name(null)$$) = 'invalid', 'a missing name is refused');
select pg_temp.ok((select display_name from members where user_id = :KID) = repeat('x', 40), 'and refused names change nothing');
select pg_temp.ok(pg_temp.act(null, $$select set_my_name('Anon')$$) like 'ERROR: not signed in', 'signed-out callers are refused');
select pg_temp.ok(pg_temp.act(:LONE, $$select set_my_name('Nobody')$$) like 'ERROR: not in a family', 'someone with no family cannot (nothing to change)');
select pg_temp.ok(pg_temp.act(:KID, $$update members set display_name = 'direct' where user_id = auth.uid()$$) like 'ERROR: permission denied%' or (select display_name from members where user_id = :KID) <> 'direct', 'and the table itself still cannot be edited directly');

-- the family name
select pg_temp.ok(pg_temp.act(:PA, $$select rename_family('  The Smiths ')$$) = 'ok', 'a parent can rename the family');
select pg_temp.ok((select name from families where id = (select family_id from members where user_id = :PA)) = 'The Smiths', 'trimmed');
select pg_temp.ok(pg_temp.act(:PB, $$select rename_family('Second parent')$$) = 'ok', 'any parent can');
select pg_temp.ok(pg_temp.act(:KID, $$select rename_family('Kid rename')$$) like 'ERROR: parents only', 'a child cannot');
select pg_temp.ok(pg_temp.act(:PA, $$select rename_family('')$$) = 'invalid' and pg_temp.act(:PA, format($$select rename_family(%L)$$, repeat('y', 61))) = 'invalid', 'empty and over-long names are refused');
select pg_temp.ok((select name from families where name = 'Other profile family') is not null, 'another family was not renamed');
select pg_temp.ok(pg_temp.act(:LONE, $$select rename_family('Hijack')$$) like 'ERROR: parents only', 'a person with no family cannot rename anything');
select pg_temp.ok((select count(*) from families where name = 'Hijack') = 0, 'nothing was hijacked');
select pg_temp.ok(pg_temp.act(:PA, $$update families set name = 'direct' where true$$) like 'ERROR: permission denied%' or (select count(*) from families where name = 'direct') = 0, 'and the table cannot be edited directly');

-- rotating the invite codes
select pg_temp.ok(pg_temp.act(:KID, $$select count(*)::text from rotate_invite_codes()$$) like 'ERROR: parents only', 'a child cannot rotate codes');
select pg_temp.ok((select parent_code from families where id = (select family_id from members where user_id = :PA)) = :'pc', 'and nothing changed');
select pg_temp.act(:PA, $$select parent_code || ' ' || kid_code from rotate_invite_codes()$$) as newcodes \gset
select split_part(:'newcodes', ' ', 1) as npc, split_part(:'newcodes', ' ', 2) as nkc \gset
select pg_temp.ok(length(:'npc') = 12 and length(:'nkc') = 12 and :'npc' <> :'pc' and :'nkc' <> :'kc' and :'npc' <> :'nkc', 'a parent gets two new, different 12 character codes');
select pg_temp.ok((select parent_code = :'npc' and kid_code = :'nkc' from families where id = (select family_id from members where user_id = :PA)), 'and they are what is stored');
select pg_temp.ok(pg_temp.act(:NEW, format($$select join_family(%L, 'Late')$$, :'pc')) = 'invalid_code', 'the old parent code no longer works');
select pg_temp.ok(pg_temp.act(:LONE, format($$select join_family(%L, 'Late kid')$$, :'kc')) = 'invalid_code', 'nor the old kid code');
select pg_temp.ok(pg_temp.act(:NEW, format($$select join_family(%L, 'Late')$$, :'nkc')) = 'child', 'the new kid code works');
select pg_temp.ok((select count(*) from members where family_id = (select family_id from members where user_id = :PA)) = 4, 'the people already in the family are still in it (4 members)');
select pg_temp.ok((select parent_code <> :'npc' from families where name = 'Other profile family'), 'another family''s codes were not touched');
select pg_temp.ok(pg_temp.act(:LONE, $$select count(*)::text from rotate_invite_codes()$$) like 'ERROR: parents only', 'someone with no family cannot rotate');
select pg_temp.ok(pg_temp.act(null, $$select count(*)::text from rotate_invite_codes()$$) like 'ERROR:%', 'signed-out callers cannot');
select pg_temp.ok(pg_temp.act(:KID, $$select count(*)::text from family_codes()$$) = '0', 'a child still cannot read the codes');
select pg_temp.ok(pg_temp.act(:PB, $$select kid_code from family_codes()$$) = :'nkc', 'a parent reads the new code through the usual function');

-- length rules are enforced on new data too
select pg_temp.ok(pg_temp.act(:LONE, format($$select create_family('Long', %L)::text$$, repeat('z', 41))) like 'ERROR:%', 'joining or creating with a 41 character name is refused too');

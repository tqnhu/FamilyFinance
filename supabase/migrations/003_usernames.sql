-- Migration 003: usernames. Apply after 002. Existing members pick a username on next sign-in.

alter table members add column username text;
alter table members add constraint username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$');
create unique index members_username_key on members (username);

-- Set my username. Returns 'ok', 'invalid' or 'taken'.
create function set_username(u text) returns text
language plpgsql security definer set search_path = public as $$
declare n text := lower(trim(u));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if n !~ '^[a-z0-9_]{3,20}$' then return 'invalid'; end if;
  if exists (select 1 from members where username = n and user_id <> auth.uid()) then return 'taken'; end if;
  update members set username = n where user_id = auth.uid();
  return 'ok';
end $$;
revoke execute on function set_username(text) from anon, public;
grant execute on function set_username(text) to authenticated;

-- Sign-in lookup: username -> login email. Callable before sign-in, so it must
-- return nothing but the email (null when unknown).
create function email_for_username(u text) returns text
language sql stable security definer set search_path = public, auth as $$
  select au.email::text from members m join auth.users au on au.id = m.user_id
  where m.username = lower(trim(u))
$$;
grant execute on function email_for_username(text) to anon, authenticated;

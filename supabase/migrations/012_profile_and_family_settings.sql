-- Migration 012: profile and family settings. Apply after 011.
-- A person can change their own display name. A parent can rename the family and replace the invite codes
-- (for example after one was shared by mistake). Existing members are not affected by a new code.

-- New and changed names must be a sensible length. NOT VALID checks new and edited rows only, so nothing existing breaks.
alter table members add constraint display_name_length check (char_length(btrim(display_name)) between 1 and 40) not valid;
alter table families add constraint family_name_length check (char_length(btrim(name)) between 1 and 60) not valid;

-- Returns 'ok' or 'invalid'.
create function set_my_name(n text) returns text language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(n, ''));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if char_length(nm) not between 1 and 40 then return 'invalid'; end if;
  update members set display_name = nm where user_id = auth.uid();
  if not found then raise exception 'not in a family'; end if;
  return 'ok';
end $$;

-- Returns 'ok' or 'invalid'. Parents only.
create function rename_family(n text) returns text language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(n, ''));
begin
  if not is_parent() then raise exception 'parents only'; end if;
  if char_length(nm) not between 1 and 60 then return 'invalid'; end if;
  update families set name = nm where id = my_family();
  return 'ok';
end $$;

-- Replaces both invite codes and returns the new ones. Parents only. People already in the family stay in it.
create function rotate_invite_codes() returns table (parent_code text, kid_code text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_parent() then raise exception 'parents only'; end if;
  return query
    update families f set parent_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
                          kid_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    where f.id = my_family() returning f.parent_code, f.kid_code;
end $$;

revoke execute on function set_my_name(text), rename_family(text), rotate_invite_codes() from public, anon;
grant execute on function set_my_name(text), rename_family(text), rotate_invite_codes() to authenticated;

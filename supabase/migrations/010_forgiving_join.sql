-- Migration 010: joining a family is forgiving. Apply after 009.
-- Codes are matched ignoring case, spaces, dashes and invisible characters, and O/I/L typed for 0/1/1 (real codes never
-- contain o, i or l). Someone who created an empty family by mistake can still join the real one. Only well-formed
-- wrong guesses count towards the retry limit, which is 30 an hour.

create function normalize_code(c text) returns text language sql immutable as $$
  select translate(lower(regexp_replace(coalesce(c, ''), '[^a-zA-Z0-9]', '', 'g')), 'oil', '011')
$$;

-- True when a family holds nothing a person would be upset to lose (only the defaults a new family starts with).
create function family_has_data(fid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from expenses where family_id = fid) or exists (select 1 from jar_entries where family_id = fid)
      or exists (select 1 from purchase_requests where family_id = fid) or exists (select 1 from goals where family_id = fid)
      or exists (select 1 from bills where family_id = fid) or exists (select 1 from allowances where family_id = fid)
$$;
revoke execute on function normalize_code(text), family_has_data(uuid) from public, anon, authenticated;

-- Returns 'parent' or 'child' on success, otherwise one of:
-- invalid_code, too_many_attempts, name_required, already_member, already_in_this_family.
create or replace function join_family(code text, my_name text) returns text
language plpgsql security definer set search_path = public as $$
declare f families; r text; n text := normalize_code(code); mine uuid; nm text := btrim(coalesce(my_name, ''));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if nm = '' then return 'name_required'; end if;
  if (select count(*) from join_attempts where user_id = auth.uid() and attempted_at > now() - interval '1 hour') >= 30 then
    return 'too_many_attempts';   -- checked before looking the code up, so guessing gains nothing once the limit is hit
  end if;
  select * into f from families where parent_code = n or kid_code = n;
  if f.id is null then
    if length(n) = 12 then insert into join_attempts (user_id) values (auth.uid()); end if;   -- typos of the wrong length are not guesses
    return 'invalid_code';
  end if;
  select family_id into mine from members where user_id = auth.uid();
  if mine is not null then
    if mine = f.id then return 'already_in_this_family'; end if;
    -- A new family that is still empty and has only this person in it was almost certainly a mistake: let them move.
    if (select count(*) from members where family_id = mine) = 1 and not family_has_data(mine) then
      delete from families where id = mine;   -- cascades to their membership and the default categories
    else
      return 'already_member';
    end if;
  end if;
  r := case when f.parent_code = n then 'parent' else 'child' end;
  insert into members (user_id, family_id, display_name, role) values (auth.uid(), f.id, nm, r);
  return r;
end $$;

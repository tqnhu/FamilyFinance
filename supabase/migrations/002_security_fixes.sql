-- Migration 002: apply to a database that already ran schema.sql (Phase 1).
-- WARNING: regenerates invite codes, so previously shared codes stop working.

-- 1. Stronger invite codes (48 bits, from the secure uuid generator)
alter table families
  alter column parent_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  alter column kid_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
update families set
  parent_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  kid_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

-- 2. Expense categories must belong to the caller's family
drop policy "add own expenses" on expenses;
create policy "add own expenses" on expenses for insert
  with check (family_id = my_family() and member_id = auth.uid()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));
drop policy "edit expenses" on expenses;
create policy "edit expenses" on expenses for update
  using (family_id = my_family() and (is_parent() or member_id = auth.uid()))
  with check (family_id = my_family()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));

-- 3. Throttle invite-code guessing: max 10 failures per hour per user
create table join_attempts (
  user_id uuid not null references auth.users on delete cascade,
  attempted_at timestamptz not null default now()
);
alter table join_attempts enable row level security;

create or replace function join_family(code text, my_name text) returns text
language plpgsql security definer set search_path = public as $$
declare f families; r text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'already in a family'; end if;
  if (select count(*) from join_attempts where user_id = auth.uid() and attempted_at > now() - interval '1 hour') >= 10 then
    return 'too_many_attempts';
  end if;
  select * into f from families where parent_code = code or kid_code = code;
  if f.id is null then
    insert into join_attempts (user_id) values (auth.uid());
    return 'invalid_code';
  end if;
  r := case when f.parent_code = code then 'parent' else 'child' end;
  insert into members (user_id, family_id, display_name, role) values (auth.uid(), f.id, my_name, r);
  return r;
end $$;

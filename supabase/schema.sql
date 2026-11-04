-- FamilyFinance Phase 1 schema. Run in the Supabase SQL editor.

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  kid_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at timestamptz not null default now()
);

create table members (
  user_id uuid primary key references auth.users on delete cascade,
  family_id uuid not null references families on delete cascade,
  display_name text not null,
  role text not null check (role in ('parent', 'child')),
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  name text not null,
  emoji text not null default '💶',
  budget_cents integer not null default 0 check (budget_cents >= 0)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  member_id uuid not null references members(user_id) on delete cascade,
  category_id uuid references categories on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  note text not null default '',
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index on expenses (family_id, spent_on);

-- Helpers (security definer so RLS policies can use them without recursion)
create function my_family() returns uuid language sql stable security definer set search_path = public
  as $$ select family_id from members where user_id = auth.uid() $$;
create function is_parent() returns boolean language sql stable security definer set search_path = public
  as $$ select coalesce((select role = 'parent' from members where user_id = auth.uid()), false) $$;

alter table families enable row level security;
alter table members enable row level security;
alter table categories enable row level security;
alter table expenses enable row level security;

create policy "read own family" on families for select using (id = my_family());
create policy "read family members" on members for select using (family_id = my_family());
create policy "read categories" on categories for select using (family_id = my_family());
create policy "parents manage categories" on categories for all
  using (family_id = my_family() and is_parent()) with check (family_id = my_family() and is_parent());

create policy "read expenses" on expenses for select
  using (family_id = my_family() and (is_parent() or member_id = auth.uid()));
create policy "add own expenses" on expenses for insert
  with check (family_id = my_family() and member_id = auth.uid()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));
create policy "edit expenses" on expenses for update
  using (family_id = my_family() and (is_parent() or member_id = auth.uid()))
  with check (family_id = my_family()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));
create policy "delete expenses" on expenses for delete
  using (family_id = my_family() and (is_parent() or member_id = auth.uid()));

-- Create a family; caller becomes the first parent, default categories are seeded.
create function create_family(family_name text, my_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'already in a family'; end if;
  insert into families (name) values (family_name) returning id into fid;
  insert into members (user_id, family_id, display_name, role) values (auth.uid(), fid, my_name, 'parent');
  insert into categories (family_id, name, emoji, budget_cents) values
    (fid, 'Groceries', '🛒', 40000), (fid, 'Eating out', '🍕', 10000), (fid, 'Transport', '🚌', 10000),
    (fid, 'Home & bills', '🏠', 0), (fid, 'Health', '💊', 0), (fid, 'Fun', '🎮', 8000),
    (fid, 'Kids', '🧸', 5000), (fid, 'Other', '📦', 0);
  return fid;
end $$;

-- Join with a parent or kid code; the code decides the role.
create table join_attempts (
  user_id uuid not null references auth.users on delete cascade,
  attempted_at timestamptz not null default now()
);
alter table join_attempts enable row level security;  -- no policies: only the functions below touch it

-- Returns 'parent', 'child', or 'invalid_code' / 'too_many_attempts'.
-- Failures are returned (not raised) so the attempt log is kept; max 10 failures per hour.
create function join_family(code text, my_name text) returns text
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

-- Invite codes are visible to parents only.
create function family_codes() returns table (parent_code text, kid_code text)
language sql stable security definer set search_path = public as $$
  select parent_code, kid_code from families where id = my_family() and is_parent()
$$;
-- Hide codes from direct selects
revoke select on families from anon, authenticated;
grant select (id, name, created_at) on families to authenticated;

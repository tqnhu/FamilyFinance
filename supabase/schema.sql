-- FamilyFinance schema (all phases). Run in the Supabase SQL editor on a NEW project. Upgrading? Run supabase/migrations/ instead.

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
  username text constraint username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
create unique index members_username_key on members (username);

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

-- Usernames
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

-- ===== Phase 2: jars, allowance, purchase requests (migrations/004_jars.sql) =====

create table allowances (
  child_id uuid primary key references members(user_id) on delete cascade,
  family_id uuid not null references families on delete cascade,
  weekly_cents integer not null default 0 check (weekly_cents between 0 and 100000),
  spend_pct integer not null default 50,
  save_pct integer not null default 40,
  give_pct integer not null default 10,
  match_pct integer not null default 0 check (match_pct between 0 and 100),
  next_pay_on date not null default current_date + 7,
  check (spend_pct >= 0 and save_pct >= 0 and give_pct >= 0 and spend_pct + save_pct + give_pct = 100)
);

create table jar_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  child_id uuid not null references members(user_id) on delete cascade,
  jar text not null check (jar in ('spend', 'save', 'give')),
  amount_cents integer not null check (amount_cents <> 0),
  kind text not null check (kind in ('allowance', 'deposit', 'adjustment', 'move', 'match', 'purchase')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on jar_entries (child_id, created_at desc);

create table purchase_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  child_id uuid not null references members(user_id) on delete cascade,
  jar text not null default 'spend' check (jar in ('spend', 'give')),
  item text not null check (char_length(btrim(item)) between 1 and 80),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by uuid references members(user_id) on delete set null,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on purchase_requests (family_id, status);

create view jar_balances with (security_invoker = true) as
  select child_id, jar, sum(amount_cents)::integer as balance_cents from jar_entries group by child_id, jar;

alter table allowances enable row level security;
alter table jar_entries enable row level security;
alter table purchase_requests enable row level security;

-- Read-only from the client: parents see every child in the family, a child sees only their own.
create policy "read allowances" on allowances for select
  using (family_id = my_family() and (is_parent() or child_id = auth.uid()));
create policy "read jar entries" on jar_entries for select
  using (family_id = my_family() and (is_parent() or child_id = auth.uid()));
create policy "read purchase requests" on purchase_requests for select
  using (family_id = my_family() and (is_parent() or child_id = auth.uid()));
revoke insert, update, delete on allowances, jar_entries, purchase_requests from anon, authenticated;

-- ---------- internal helpers (not callable from the client) ----------

-- Serialises balance changes for one child so two requests can't both spend the same money.
create function lock_child(c uuid) returns void language sql security definer set search_path = public as $$
  select 1 from members where user_id = c for update
$$;
create function jar_balance(c uuid, j text) returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_cents), 0)::integer from jar_entries where child_id = c and jar = j
$$;
create function pending_total(c uuid, j text) returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_cents), 0)::integer from purchase_requests where child_id = c and jar = j and status = 'pending'
$$;
create function assert_my_child(c uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from members where user_id = c and family_id = my_family() and role = 'child') then
    raise exception 'unknown child';
  end if;
end $$;
revoke execute on function lock_child(uuid), jar_balance(uuid, text), pending_total(uuid, text), assert_my_child(uuid) from public, anon, authenticated;

-- ---------- parent actions ----------

create function set_allowance(child uuid, weekly_cents integer, spend_pct integer, save_pct integer, give_pct integer, match_pct integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_parent() then raise exception 'parents only'; end if;
  perform assert_my_child(child);
  if spend_pct + save_pct + give_pct <> 100 then raise exception 'the split must add up to 100%%'; end if;
  insert into allowances as a (child_id, family_id, weekly_cents, spend_pct, save_pct, give_pct, match_pct)
  values (child, my_family(), weekly_cents, spend_pct, save_pct, give_pct, match_pct)
  on conflict (child_id) do update set weekly_cents = excluded.weekly_cents, spend_pct = excluded.spend_pct,
    save_pct = excluded.save_pct, give_pct = excluded.give_pct, match_pct = excluded.match_pct;
end $$;

-- Parent adds (positive) or removes (negative) money in one jar.
create function add_money(child uuid, in_jar text, cents integer, in_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_parent() then raise exception 'parents only'; end if;
  perform assert_my_child(child);
  if in_jar not in ('spend', 'save', 'give') then raise exception 'unknown jar'; end if;
  if cents = 0 or abs(cents) > 1000000 then raise exception 'amount out of range'; end if;
  perform lock_child(child);
  if cents < 0 and jar_balance(child, in_jar) + cents < 0 then raise exception 'not enough money in that jar'; end if;
  insert into jar_entries (family_id, child_id, jar, amount_cents, kind, note)
  values (my_family(), child, in_jar, cents, case when cents > 0 then 'deposit' else 'adjustment' end, left(coalesce(in_note, ''), 80));
end $$;

create function decide_purchase(req uuid, approve boolean, in_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r purchase_requests;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select * into r from purchase_requests where id = req and family_id = my_family() for update;
  if r.id is null then raise exception 'request not found'; end if;
  if r.status <> 'pending' then raise exception 'this request was already handled'; end if;
  if approve then
    perform lock_child(r.child_id);
    if jar_balance(r.child_id, r.jar) < r.amount_cents then raise exception 'not enough money in the jar'; end if;
    insert into jar_entries (family_id, child_id, jar, amount_cents, kind, note)
    values (r.family_id, r.child_id, r.jar, -r.amount_cents, 'purchase', r.item);
  end if;
  update purchase_requests set status = case when approve then 'approved' else 'declined' end,
    decided_by = auth.uid(), decision_note = left(coalesce(in_note, ''), 120), decided_at = now() where id = req;
end $$;

-- ---------- child (and parent) actions ----------

-- Move money between jars. A child can only move from Spend into Save or Give (never back out),
-- and moves into Save earn the parents' match. A parent can move money any direction, with no match.
create function move_money(child uuid, from_jar text, to_jar text, cents integer) returns void
language plpgsql security definer set search_path = public as $$
declare who uuid; pct integer;
begin
  if my_family() is null then raise exception 'not signed in'; end if;
  if is_parent() then who := child; else who := auth.uid(); end if;
  perform assert_my_child(who);
  if from_jar not in ('spend', 'save', 'give') or to_jar not in ('spend', 'save', 'give') or from_jar = to_jar then
    raise exception 'unknown jar';
  end if;
  if not is_parent() and not (from_jar = 'spend' and to_jar in ('save', 'give')) then
    raise exception 'you can move money from Spend into Save or Give';
  end if;
  if cents <= 0 or cents > 1000000 then raise exception 'amount out of range'; end if;
  perform lock_child(who);
  if jar_balance(who, from_jar) - pending_total(who, from_jar) < cents then raise exception 'not enough money in that jar'; end if;
  insert into jar_entries (family_id, child_id, jar, amount_cents, kind, note) values
    (my_family(), who, from_jar, -cents, 'move', 'to ' || to_jar),
    (my_family(), who, to_jar, cents, 'move', 'from ' || from_jar);
  if not is_parent() and to_jar = 'save' then
    select coalesce(match_pct, 0) into pct from allowances where child_id = who;
    if coalesce(pct, 0) > 0 and cents * pct / 100 > 0 then
      insert into jar_entries (family_id, child_id, jar, amount_cents, kind, note)
      values (my_family(), who, 'save', cents * pct / 100, 'match', 'parent match ' || pct || '%');
    end if;
  end if;
end $$;

create function request_purchase(in_jar text, in_item text, cents integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if is_parent() or my_family() is null then raise exception 'only kids make requests'; end if;
  if in_jar not in ('spend', 'give') then raise exception 'unknown jar'; end if;
  if cents <= 0 or cents > 1000000 then raise exception 'amount out of range'; end if;
  perform lock_child(auth.uid());
  if jar_balance(auth.uid(), in_jar) - pending_total(auth.uid(), in_jar) < cents then
    raise exception 'not enough money in that jar';
  end if;
  insert into purchase_requests (family_id, child_id, jar, item, amount_cents)
  values (my_family(), auth.uid(), in_jar, btrim(in_item), cents) returning id into rid;
  return rid;
end $$;

create function cancel_request(req uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update purchase_requests set status = 'cancelled', decided_at = now()
  where id = req and child_id = auth.uid() and status = 'pending';
  if not found then raise exception 'request not found'; end if;
end $$;

-- Pays any allowance that is due (one payment per missed week, at most 12). Safe to call often:
-- next_pay_on moves forward in the same transaction, so a payment can never be made twice.
create function settle_allowance() returns integer language plpgsql security definer set search_path = public as $$
declare a allowances; paid integer := 0; i integer; sp integer; gv integer; sv integer;
begin
  if my_family() is null then return 0; end if;
  for a in select * from allowances where family_id = my_family() and next_pay_on <= current_date for update loop
    i := 0;
    while a.next_pay_on <= current_date and i < 12 loop
      if a.weekly_cents > 0 then
        sp := a.weekly_cents * a.spend_pct / 100;
        gv := a.weekly_cents * a.give_pct / 100;
        sv := a.weekly_cents - sp - gv;
        if sp > 0 then insert into jar_entries (family_id, child_id, jar, amount_cents, kind, note) values (a.family_id, a.child_id, 'spend', sp, 'allowance', 'weekly allowance'); end if;
        if sv > 0 then insert into jar_entries (family_id, child_id, jar, amount_cents, kind, note) values (a.family_id, a.child_id, 'save', sv, 'allowance', 'weekly allowance'); end if;
        if gv > 0 then insert into jar_entries (family_id, child_id, jar, amount_cents, kind, note) values (a.family_id, a.child_id, 'give', gv, 'allowance', 'weekly allowance'); end if;
        paid := paid + 1;
      end if;
      a.next_pay_on := a.next_pay_on + 7;
      i := i + 1;
    end loop;
    if a.next_pay_on <= current_date then  -- more than 12 weeks behind: skip ahead, keep the weekday
      a.next_pay_on := a.next_pay_on + 7 * ceil((current_date - a.next_pay_on + 1) / 7.0)::integer;
    end if;
    update allowances set next_pay_on = a.next_pay_on where child_id = a.child_id;
  end loop;
  return paid;
end $$;

revoke execute on function set_allowance(uuid, integer, integer, integer, integer, integer), add_money(uuid, text, integer, text),
  decide_purchase(uuid, boolean, text), move_money(uuid, text, text, integer), request_purchase(text, text, integer),
  cancel_request(uuid), settle_allowance() from public, anon;
grant execute on function set_allowance(uuid, integer, integer, integer, integer, integer), add_money(uuid, text, integer, text),
  decide_purchase(uuid, boolean, text), move_money(uuid, text, text, integer), request_purchase(text, text, integer),
  cancel_request(uuid), settle_allowance() to authenticated;

-- ===== Phase 3: goals, contributions, badges (migrations/005_goals.sql) =====

alter table jar_entries drop constraint jar_entries_kind_check;
alter table jar_entries add constraint jar_entries_kind_check
  check (kind in ('allowance', 'deposit', 'adjustment', 'move', 'match', 'purchase', 'goal'));

create table goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  emoji text not null default '🎯' check (char_length(emoji) between 1 and 8),
  target_cents integer not null check (target_cents between 100 and 100000000),
  deadline date,
  status text not null default 'active' check (status in ('active', 'reached', 'cancelled')),
  created_by uuid references members(user_id) on delete set null,
  created_at timestamptz not null default now(),
  reached_on date
);
create index on goals (family_id, status);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals on delete cascade,
  family_id uuid not null references families on delete cascade,
  member_id uuid not null references members(user_id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  source text not null check (source in ('cash', 'save_jar')),
  created_at timestamptz not null default now()
);
create index on goal_contributions (goal_id, created_at);

create view goal_totals with (security_invoker = true) as
  select goal_id, sum(amount_cents)::integer as raised_cents from goal_contributions group by goal_id;

alter table goals enable row level security;
alter table goal_contributions enable row level security;
create policy "read goals" on goals for select using (family_id = my_family());
create policy "read goal contributions" on goal_contributions for select using (family_id = my_family());
revoke insert, update, delete on goals, goal_contributions from anon, authenticated;

create function goal_raised(g uuid) returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_cents), 0)::integer from goal_contributions where goal_id = g
$$;
revoke execute on function goal_raised(uuid) from public, anon, authenticated;

create function create_goal(in_name text, in_emoji text, target integer, in_deadline date) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  if in_deadline is not null and in_deadline <= current_date then raise exception 'the deadline must be in the future'; end if;
  insert into goals (family_id, name, emoji, target_cents, deadline, created_by)
  values (my_family(), btrim(in_name), coalesce(nullif(btrim(in_emoji), ''), '🎯'), target, in_deadline, auth.uid())
  returning id into gid;
  return gid;
end $$;

-- Marks the goal reached when the total hits the target. Caller holds the goal row lock.
create function check_goal_reached(g uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update goals set status = 'reached', reached_on = current_date
  where id = g and status = 'active' and goal_raised(g) >= target_cents;
end $$;
revoke execute on function check_goal_reached(uuid) from public, anon, authenticated;

-- Parent adds cash money to a goal (tracked, not taken from any jar).
create function contribute_cash(goal uuid, cents integer) returns void
language plpgsql security definer set search_path = public as $$
declare g goals;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select * into g from goals where id = goal and family_id = my_family() for update;
  if g.id is null then raise exception 'goal not found'; end if;
  if g.status <> 'active' then raise exception 'this goal is closed'; end if;
  if cents <= 0 or cents > g.target_cents - goal_raised(g.id) then raise exception 'amount must be between 1 cent and what is still needed'; end if;
  insert into goal_contributions (goal_id, family_id, member_id, amount_cents, source) values (g.id, g.family_id, auth.uid(), cents, 'cash');
  perform check_goal_reached(g.id);
end $$;

-- A child puts money from their own Save jar into a goal.
create function contribute_from_save(goal uuid, cents integer) returns void
language plpgsql security definer set search_path = public as $$
declare g goals;
begin
  if is_parent() or my_family() is null then raise exception 'only kids give from a Save jar'; end if;
  select * into g from goals where id = goal and family_id = my_family() for update;
  if g.id is null then raise exception 'goal not found'; end if;
  if g.status <> 'active' then raise exception 'this goal is closed'; end if;
  if cents <= 0 or cents > g.target_cents - goal_raised(g.id) then raise exception 'amount must be between 1 cent and what is still needed'; end if;
  perform lock_child(auth.uid());
  if jar_balance(auth.uid(), 'save') < cents then raise exception 'not enough money in your Save jar'; end if;
  insert into jar_entries (family_id, child_id, jar, amount_cents, kind, note) values (g.family_id, auth.uid(), 'save', -cents, 'goal', g.name);
  insert into goal_contributions (goal_id, family_id, member_id, amount_cents, source) values (g.id, g.family_id, auth.uid(), cents, 'save_jar');
  perform check_goal_reached(g.id);
end $$;

-- Cancels an active goal and gives every child's Save-jar money back. Reached goals cannot be cancelled.
create function cancel_goal(goal uuid) returns void language plpgsql security definer set search_path = public as $$
declare g goals; c record;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select * into g from goals where id = goal and family_id = my_family() for update;
  if g.id is null then raise exception 'goal not found'; end if;
  if g.status <> 'active' then raise exception 'only active goals can be cancelled'; end if;
  for c in select member_id, sum(amount_cents)::integer as total from goal_contributions
           where goal_id = g.id and source = 'save_jar' group by member_id loop
    perform lock_child(c.member_id);
    insert into jar_entries (family_id, child_id, jar, amount_cents, kind, note)
    values (g.family_id, c.member_id, 'save', c.total, 'goal', 'refund: ' || g.name);
  end loop;
  update goals set status = 'cancelled' where id = g.id;
end $$;

-- Streak and badges for one child (a child sees their own; a parent passes the child's id).
create function child_stats(c uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who uuid; best integer; streak integer; badges jsonb;
begin
  if my_family() is null then raise exception 'not signed in'; end if;
  who := case when is_parent() then c else auth.uid() end;
  perform assert_my_child(who);

  -- Weeks in a row with money moved into Save. "streak" is still alive if it reaches this or last week.
  with wk as (
    select distinct (extract(epoch from date_trunc('week', created_at)) / 604800)::integer as w
    from jar_entries where child_id = who and jar = 'save' and kind = 'move' and amount_cents > 0),
  grp as (select w, w - row_number() over (order by w) as g from wk),
  runs as (select count(*)::integer as n, max(w) as last_w from grp group by g)
  select coalesce(max(n), 0), coalesce(max(n) filter (where last_w >= now_w - 1), 0) into best, streak
  from runs, (select (extract(epoch from date_trunc('week', now())) / 604800)::integer as now_w) t;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'earned_on', d) order by id), '[]'::jsonb) into badges from (
    select 'first_save' as id, min(created_at)::date as d from jar_entries
      where child_id = who and jar = 'save' and kind = 'move' and amount_cents > 0 having count(*) > 0
    union all select 'streak_4', null::date where best >= 4
    union all select 'generous', min(created_at)::date from jar_entries
      where child_id = who and jar = 'give' and ((kind = 'move' and amount_cents > 0) or kind = 'purchase') having count(*) > 0
    union all select 'goal_getter', min(created_at)::date from goal_contributions where member_id = who having count(*) > 0
    union all select 'goal_reached', min(g.reached_on) from goal_contributions gc join goals g on g.id = gc.goal_id
      where gc.member_id = who and g.status = 'reached' having count(*) > 0
    union all select 'big_saver', null::date where jar_balance(who, 'save') >= 5000
  ) x;
  return jsonb_build_object('streak', streak, 'best_streak', best, 'badges', badges);
end $$;

revoke execute on function create_goal(text, text, integer, date), contribute_cash(uuid, integer),
  contribute_from_save(uuid, integer), cancel_goal(uuid), child_stats(uuid) from public, anon;
grant execute on function create_goal(text, text, integer, date), contribute_cash(uuid, integer),
  contribute_from_save(uuid, integer), cancel_goal(uuid), child_stats(uuid) to authenticated;

-- ===== Phase 4: bills, category management, yearly summary (migrations/006_bills_and_year.sql) =====
alter table categories add column archived boolean not null default false;
create unique index categories_family_name on categories (family_id, lower(btrim(name)));

create table bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  category_id uuid references categories on delete set null,
  amount_cents integer not null check (amount_cents between 1 and 100000000),   -- per payment
  times_per_year integer not null default 1 check (times_per_year in (1, 2, 4, 12)),
  due_month integer not null check (due_month between 1 and 12),                 -- first due month
  due_day integer not null check (due_day between 1 and 31),                     -- clamped to short months
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on bills (family_id);

alter table expenses add column bill_id uuid references bills;   -- no cascade: history is kept, bills are archived

create table bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills,
  family_id uuid not null references families on delete cascade,
  due_on date not null,
  expense_id uuid not null references expenses on delete cascade,   -- deleting the expense makes the due date unpaid again
  created_at timestamptz not null default now(),
  unique (bill_id, due_on)
);

alter table bills enable row level security;
alter table bill_payments enable row level security;
-- Bills are private to parents.
create policy "parents manage bills" on bills for all
  using (family_id = my_family() and is_parent())
  with check (family_id = my_family() and is_parent()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));
create policy "parents read bill payments" on bill_payments for select using (family_id = my_family() and is_parent());
revoke insert, update, delete on bill_payments from anon, authenticated;

-- Nobody can flag their own expense as a bill payment (that would hide it from the budgets):
-- clients may write every expense column except bill_id.
revoke insert, update on expenses from anon, authenticated;
grant insert (family_id, member_id, category_id, amount_cents, note, spent_on) on expenses to authenticated;
grant update (category_id, amount_cents, note, spent_on) on expenses to authenticated;

create function mark_bill_paid(bill uuid, due date, cents integer, paid date) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bills; eid uuid; step integer; last_day integer;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select * into b from bills where id = bill and family_id = my_family() for update;
  if b.id is null then raise exception 'bill not found'; end if;
  if b.archived then raise exception 'this bill has ended'; end if;
  step := 12 / b.times_per_year;
  last_day := extract(day from ((date_trunc('month', due) + interval '1 month' - interval '1 day')::date))::integer;
  if due <> make_date(extract(year from due)::integer, extract(month from due)::integer, least(b.due_day, last_day))
     or (((extract(month from due)::integer - b.due_month) % step) + step) % step <> 0 then
    raise exception 'that is not a due date for this bill';
  end if;
  if cents is null or cents <= 0 or cents > 100000000 then raise exception 'amount out of range'; end if;
  if paid is null or paid > current_date then raise exception 'the payment date cannot be in the future'; end if;
  if exists (select 1 from bill_payments where bill_id = b.id and due_on = due) then raise exception 'already marked as paid'; end if;
  insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on, bill_id)
  values (b.family_id, auth.uid(), b.category_id, cents, b.name, paid, b.id) returning id into eid;
  insert into bill_payments (bill_id, family_id, due_on, expense_id) values (b.id, b.family_id, due, eid);
  return eid;
end $$;

create function unmark_bill_paid(payment uuid) returns void language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select expense_id into eid from bill_payments where id = payment and family_id = my_family();
  if eid is null then raise exception 'payment not found'; end if;
  delete from expenses where id = eid;   -- cascades to bill_payments
end $$;

-- Spending per month, category and kind (everyday vs bill) for one calendar year. Parents only: a child
-- gets no rows. Aggregated in the database so a busy year never hits the row limit of a plain query.
create function year_summary(y integer) returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, e.bill_id is not null, sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
  group by 1, 2, 3
$$;

revoke execute on function mark_bill_paid(uuid, date, integer, date), unmark_bill_paid(uuid), year_summary(integer) from public, anon;
grant execute on function mark_bill_paid(uuid, date, integer, date), unmark_bill_paid(uuid), year_summary(integer) to authenticated;

-- ===== Phase 5: editing expenses (migrations/007_edit_expenses.sql) =====
alter table expenses add column edited_at timestamptz, add column edited_by uuid references members(user_id) on delete set null;

create function stamp_expense_edit() returns trigger language plpgsql as $$
begin
  if (new.amount_cents, new.category_id, new.note, new.spent_on) is distinct from (old.amount_cents, old.category_id, old.note, old.spent_on) then
    new.edited_at := now();
    new.edited_by := auth.uid();
  else  -- nothing real changed: keep the previous stamp
    new.edited_at := old.edited_at;
    new.edited_by := old.edited_by;
  end if;
  return new;
end $$;
create trigger expenses_stamp_edit before update on expenses for each row execute function stamp_expense_edit();

-- Bill payments are changed by undoing and re-marking them (so the payment record never disagrees with the expense).
drop policy "edit expenses" on expenses;
create policy "edit expenses" on expenses for update
  using (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid()))
  with check (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid())
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));

-- ===== Phase 6: receipt photos and CSV import (migrations/008_receipts_and_import.sql) =====
alter table expenses add column receipt_path text, add column import_batch uuid;
-- the stored path must point inside this very expense's folder
alter table expenses add constraint receipt_path_matches
  check (receipt_path is null or receipt_path like family_id::text || '/' || id::text || '/%');
create index on expenses (import_batch) where import_batch is not null;

-- Clients choose the id (so the photo can be uploaded under it) and tag imports; the photo path is set after upload.
grant insert (id, import_batch) on expenses to authenticated;
grant update (receipt_path) on expenses to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

create policy "receipts: read" on storage.objects for select to authenticated using (
  bucket_id = 'receipts' and exists (
    select 1 from public.expenses e
    where e.id::text = (storage.foldername(name))[2] and e.family_id::text = (storage.foldername(name))[1]
      and e.family_id = public.my_family() and (public.is_parent() or e.member_id = auth.uid())));
create policy "receipts: upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts' and exists (
    select 1 from public.expenses e
    where e.id::text = (storage.foldername(name))[2] and e.family_id::text = (storage.foldername(name))[1]
      and e.family_id = public.my_family() and (public.is_parent() or e.member_id = auth.uid())));
create policy "receipts: delete" on storage.objects for delete to authenticated using (
  bucket_id = 'receipts' and exists (
    select 1 from public.expenses e
    where e.id::text = (storage.foldername(name))[2] and e.family_id::text = (storage.foldername(name))[1]
      and e.family_id = public.my_family() and (public.is_parent() or e.member_id = auth.uid())));

-- ===== Monthly fees (migrations/009_monthly_fees.sql) =====
alter table expenses add column monthly_fee boolean not null default false;   -- clients cannot write it (not in any column grant)
update expenses e set monthly_fee = true from bills b where b.id = e.bill_id and b.times_per_year = 12;

create or replace function mark_bill_paid(bill uuid, due date, cents integer, paid date) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bills; eid uuid; step integer; last_day integer;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select * into b from bills where id = bill and family_id = my_family() for update;
  if b.id is null then raise exception 'bill not found'; end if;
  if b.archived then raise exception 'this bill has ended'; end if;
  step := 12 / b.times_per_year;
  last_day := extract(day from ((date_trunc('month', due) + interval '1 month' - interval '1 day')::date))::integer;
  if due <> make_date(extract(year from due)::integer, extract(month from due)::integer, least(b.due_day, last_day))
     or (((extract(month from due)::integer - b.due_month) % step) + step) % step <> 0 then
    raise exception 'that is not a due date for this bill';
  end if;
  if cents is null or cents <= 0 or cents > 100000000 then raise exception 'amount out of range'; end if;
  if paid is null or paid > current_date then raise exception 'the payment date cannot be in the future'; end if;
  if exists (select 1 from bill_payments where bill_id = b.id and due_on = due) then raise exception 'already marked as paid'; end if;
  insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on, bill_id, monthly_fee)
  values (b.family_id, auth.uid(), b.category_id, cents, b.name, paid, b.id, b.times_per_year = 12) returning id into eid;
  insert into bill_payments (bill_id, family_id, due_on, expense_id) values (b.id, b.family_id, due, eid);
  return eid;
end $$;

-- is_bill now means "a yearly-type bill kept apart from everyday spending"; monthly fees are everyday spending.
create or replace function year_summary(y integer) returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, (e.bill_id is not null and not e.monthly_fee), sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
  group by 1, 2, 3
$$;

-- ===== Forgiving join (migrations/010_forgiving_join.sql) =====
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

-- ===== Tags (migrations/011_tags.sql) =====
create table tags (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  archived boolean not null default false,
  created_by uuid references members(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index tags_family_name on tags (family_id, lower(btrim(name)));

alter table tags enable row level security;
-- Everyone in the family can see the tag names and make new ones; only parents rename, archive or delete.
create policy "read tags" on tags for select using (family_id = my_family());
create policy "add tags" on tags for insert with check (family_id = my_family() and created_by = auth.uid());
create policy "parents change tags" on tags for update using (family_id = my_family() and is_parent())
  with check (family_id = my_family() and is_parent());
create policy "parents delete tags" on tags for delete using (family_id = my_family() and is_parent());
revoke insert, update on tags from anon, authenticated;
grant insert (family_id, name, created_by) on tags to authenticated;
grant update (name, archived) on tags to authenticated;

alter table expenses add column tag_id uuid references tags on delete set null;   -- deleting a tag just untags
create index on expenses (tag_id) where tag_id is not null;
grant insert (tag_id) on expenses to authenticated;
grant update (tag_id) on expenses to authenticated;

-- The tag must belong to the same family (as the category already must).
drop policy "add own expenses" on expenses;
create policy "add own expenses" on expenses for insert
  with check (family_id = my_family() and member_id = auth.uid()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family()))
    and (tag_id is null or exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family())));
drop policy "edit expenses" on expenses;
create policy "edit expenses" on expenses for update
  using (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid()))
  with check (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid())
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family()))
    and (tag_id is null or exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family())));

alter table bills add column tag_id uuid references tags on delete set null;
drop policy "parents manage bills" on bills;
create policy "parents manage bills" on bills for all
  using (family_id = my_family() and is_parent())
  with check (family_id = my_family() and is_parent()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family()))
    and (tag_id is null or exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family())));

-- Marking a bill paid copies the bill's tag onto the payment.
create or replace function mark_bill_paid(bill uuid, due date, cents integer, paid date) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bills; eid uuid; step integer; last_day integer;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select * into b from bills where id = bill and family_id = my_family() for update;
  if b.id is null then raise exception 'bill not found'; end if;
  if b.archived then raise exception 'this bill has ended'; end if;
  step := 12 / b.times_per_year;
  last_day := extract(day from ((date_trunc('month', due) + interval '1 month' - interval '1 day')::date))::integer;
  if due <> make_date(extract(year from due)::integer, extract(month from due)::integer, least(b.due_day, last_day))
     or (((extract(month from due)::integer - b.due_month) % step) + step) % step <> 0 then
    raise exception 'that is not a due date for this bill';
  end if;
  if cents is null or cents <= 0 or cents > 100000000 then raise exception 'amount out of range'; end if;
  if paid is null or paid > current_date then raise exception 'the payment date cannot be in the future'; end if;
  if exists (select 1 from bill_payments where bill_id = b.id and due_on = due) then raise exception 'already marked as paid'; end if;
  insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on, bill_id, monthly_fee, tag_id)
  values (b.family_id, auth.uid(), b.category_id, cents, b.name, paid, b.id, b.times_per_year = 12, b.tag_id) returning id into eid;
  insert into bill_payments (bill_id, family_id, due_on, expense_id) values (b.id, b.family_id, due, eid);
  return eid;
end $$;

-- Totals per tag (tag_id null = no tag) for a period [from_d, to_d); a null bound means unbounded, so
-- (null, null) is all time. Parents only; counted in the database so a long history never hits a row limit.
create function tag_totals(from_d date default null, to_d date default null)
returns table (tag_id uuid, total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select e.tag_id, sum(e.amount_cents)::bigint, count(*)::bigint from expenses e
  where is_parent() and e.family_id = my_family()
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
  group by e.tag_id
$$;

-- One tag's total per calendar month inside the period.
create function tag_months(tag uuid, from_d date default null, to_d date default null)
returns table (month date, total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', e.spent_on)::date, sum(e.amount_cents)::bigint, count(*)::bigint from expenses e
  where is_parent() and e.family_id = my_family() and e.tag_id = tag
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
  group by 1 order by 1
$$;
revoke execute on function tag_totals(date, date), tag_months(uuid, date, date) from public, anon;
grant execute on function tag_totals(date, date), tag_months(uuid, date, date) to authenticated;

-- ===== Profile and family settings (migrations/012_profile_and_family_settings.sql) =====
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

-- ===== Tighter function access (migrations/013_tighten_function_access.sql) =====
-- Signed-out visitors have no use for these. They refused or returned nothing already; now they cannot even call them.
revoke execute on function create_family(text, text), join_family(text, text), family_codes(), is_parent(), my_family() from public, anon;
grant execute on function create_family(text, text), join_family(text, text), family_codes(), is_parent(), my_family() to authenticated;

-- A fixed (empty) search_path means these functions cannot be redirected to look things up in another schema.
-- Both only use built-in functions and schema-qualified names, so nothing they do changes.
alter function normalize_code(text) set search_path = '';
alter function stamp_expense_edit() set search_path = '';

-- ===== Annual fee flag (migrations/014_annual_fee.sql) =====
alter table expenses add column annual_fee boolean not null default false;
grant insert (annual_fee) on expenses to authenticated;
grant update (annual_fee) on expenses to authenticated;

-- "is_bill" now means "kept apart from everyday spending": a yearly-type bill payment or an expense marked as an annual fee.
create or replace function year_summary(y integer) returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, ((e.bill_id is not null and not e.monthly_fee) or e.annual_fee), sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
  group by 1, 2, 3
$$;

-- ===== Classification rules (migrations/015_classification_rules.sql) =====
create table classification_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  pattern text not null check (pattern = lower(pattern) and char_length(btrim(pattern)) between 2 and 60),
  min_cents integer check (min_cents >= 0),
  max_cents integer check (max_cents >= 0),
  category_id uuid not null references categories on delete cascade,
  tag_id uuid references tags on delete set null,
  annual_fee boolean not null default false,
  status text not null default 'on' check (status in ('on', 'off', 'dismissed')),
  created_by uuid references members(user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (min_cents is null or max_cents is null or min_cents <= max_cents)
);
create unique index classification_rules_unique on classification_rules (family_id, pattern, coalesce(min_cents, 0), coalesce(max_cents, -1));
create index on classification_rules (family_id);

alter table classification_rules enable row level security;
create policy "read rules" on classification_rules for select using (family_id = my_family());
create policy "parents add rules" on classification_rules for insert
  with check (family_id = my_family() and is_parent() and created_by = auth.uid()
    and (select count(*) from classification_rules r where r.family_id = my_family()) < 300
    and exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())
    and (tag_id is null or exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family())));
create policy "parents change rules" on classification_rules for update
  using (family_id = my_family() and is_parent())
  with check (family_id = my_family() and is_parent()
    and exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())
    and (tag_id is null or exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family())));
create policy "parents delete rules" on classification_rules for delete using (family_id = my_family() and is_parent());

revoke insert, update on classification_rules from anon, authenticated;
grant insert (family_id, pattern, min_cents, max_cents, category_id, tag_id, annual_fee, status, created_by) on classification_rules to authenticated;
grant update (pattern, min_cents, max_cents, category_id, tag_id, annual_fee, status) on classification_rules to authenticated;

-- ===== Year summary by tag (migrations/016_year_summary_by_tag.sql) =====
create function year_summary_by_tag(y integer, tag_ids uuid[], include_untagged boolean default false)
returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, ((e.bill_id is not null and not e.monthly_fee) or e.annual_fee), sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
    and ((e.tag_id is not null and e.tag_id = any(coalesce(tag_ids, '{}'::uuid[]))) or (include_untagged and e.tag_id is null))
  group by 1, 2, 3
$$;
revoke execute on function year_summary_by_tag(integer, uuid[], boolean) from public, anon;
grant execute on function year_summary_by_tag(integer, uuid[], boolean) to authenticated;

-- ===== Several tags per expense (migrations/017_expense_tags.sql) =====
-- An expense can carry up to 5 tags. Join table expense_tags(expense_id, tag_id); expenses.tag_id is removed.
-- Under every tag an expense counts at its full amount, so tag totals may add up to more than the total
-- spending; a filter over several tags counts each expense once (union).
create table expense_tags (
  expense_id uuid not null references expenses on delete cascade,
  tag_id uuid not null references tags on delete cascade,   -- deleting a tag just untags
  primary key (expense_id, tag_id)
);
create index on expense_tags (tag_id, expense_id);

alter table expense_tags enable row level security;
-- You see the tags of the expenses you can see.
create policy "read expense tags" on expense_tags for select
  using (exists (select 1 from expenses e where e.id = expense_id));
-- You change the tags of the expenses you may edit (bill payments are tagged by mark_bill_paid), with a tag of the same family.
create policy "add expense tags" on expense_tags for insert
  with check (exists (select 1 from expenses e where e.id = expense_id and e.family_id = my_family() and e.bill_id is null
                        and (is_parent() or e.member_id = auth.uid()))
    and exists (select 1 from tags t where t.id = tag_id and t.family_id = my_family()));
create policy "remove expense tags" on expense_tags for delete
  using (exists (select 1 from expenses e where e.id = expense_id and e.family_id = my_family() and e.bill_id is null
                   and (is_parent() or e.member_id = auth.uid())));
revoke all on expense_tags from anon, authenticated;
grant select on expense_tags to authenticated;
grant insert (expense_id, tag_id) on expense_tags to authenticated;
grant delete on expense_tags to authenticated;

-- At most 5 tags per expense (the row is locked so two fast inserts cannot both slip past).
create function limit_expense_tags() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from expenses where id = new.expense_id for update;
  if (select count(*) from expense_tags where expense_id = new.expense_id) >= 5 then
    raise exception 'an expense can have at most 5 tags';
  end if;
  return new;
end $$;
create trigger expense_tags_limit before insert on expense_tags for each row execute function limit_expense_tags();
revoke execute on function limit_expense_tags() from public, anon, authenticated;

-- Existing single tags move over; the old column goes.
insert into expense_tags (expense_id, tag_id) select id, tag_id from expenses where tag_id is not null;

drop policy "add own expenses" on expenses;
create policy "add own expenses" on expenses for insert
  with check (family_id = my_family() and member_id = auth.uid()
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));
drop policy "edit expenses" on expenses;
create policy "edit expenses" on expenses for update
  using (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid()))
  with check (family_id = my_family() and bill_id is null and (is_parent() or member_id = auth.uid())
    and (category_id is null or exists (select 1 from categories c where c.id = category_id and c.family_id = my_family())));
drop index expenses_tag_id_idx;
alter table expenses drop column tag_id;

-- Paying a bill copies the bill's tag onto the payment.
create or replace function mark_bill_paid(bill uuid, due date, cents integer, paid date) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bills; eid uuid; step integer; last_day integer;
begin
  if not is_parent() then raise exception 'parents only'; end if;
  select * into b from bills where id = bill and family_id = my_family() for update;
  if b.id is null then raise exception 'bill not found'; end if;
  if b.archived then raise exception 'this bill has ended'; end if;
  step := 12 / b.times_per_year;
  last_day := extract(day from ((date_trunc('month', due) + interval '1 month' - interval '1 day')::date))::integer;
  if due <> make_date(extract(year from due)::integer, extract(month from due)::integer, least(b.due_day, last_day))
     or (((extract(month from due)::integer - b.due_month) % step) + step) % step <> 0 then
    raise exception 'that is not a due date for this bill';
  end if;
  if cents is null or cents <= 0 or cents > 100000000 then raise exception 'amount out of range'; end if;
  if paid is null or paid > current_date then raise exception 'the payment date cannot be in the future'; end if;
  if exists (select 1 from bill_payments where bill_id = b.id and due_on = due) then raise exception 'already marked as paid'; end if;
  insert into expenses (family_id, member_id, category_id, amount_cents, note, spent_on, bill_id, monthly_fee)
  values (b.family_id, auth.uid(), b.category_id, cents, b.name, paid, b.id, b.times_per_year = 12) returning id into eid;
  if b.tag_id is not null then insert into expense_tags (expense_id, tag_id) values (eid, b.tag_id); end if;
  insert into bill_payments (bill_id, family_id, due_on, expense_id) values (b.id, b.family_id, due, eid);
  return eid;
end $$;

-- Totals per tag (tag_id null = no tag). An expense with several tags is counted in full under each of them.
create or replace function tag_totals(from_d date default null, to_d date default null)
returns table (tag_id uuid, total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select et.tag_id, sum(e.amount_cents)::bigint, count(*)::bigint
  from expenses e left join expense_tags et on et.expense_id = e.id
  where is_parent() and e.family_id = my_family()
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
  group by et.tag_id
$$;

create or replace function tag_months(tag uuid, from_d date default null, to_d date default null)
returns table (month date, total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', e.spent_on)::date, sum(e.amount_cents)::bigint, count(*)::bigint
  from expenses e join expense_tags et on et.expense_id = e.id and et.tag_id = tag
  where is_parent() and e.family_id = my_family()
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
  group by 1 order by 1
$$;

-- Any of the chosen tags (and, if asked, no tag at all): each expense is counted once.
create or replace function year_summary_by_tag(y integer, tag_ids uuid[], include_untagged boolean default false)
returns table (month integer, category_id uuid, is_bill boolean, total_cents integer)
language sql stable security definer set search_path = public as $$
  select extract(month from e.spent_on)::integer, e.category_id, ((e.bill_id is not null and not e.monthly_fee) or e.annual_fee), sum(e.amount_cents)::integer
  from expenses e
  where is_parent() and e.family_id = my_family()
    and e.spent_on >= make_date(y, 1, 1) and e.spent_on < make_date(y + 1, 1, 1)
    and (exists (select 1 from expense_tags et where et.expense_id = e.id and et.tag_id = any(coalesce(tag_ids, '{}'::uuid[])))
         or (include_untagged and not exists (select 1 from expense_tags et where et.expense_id = e.id)))
  group by 1, 2, 3
$$;

-- The total of everything carrying ANY of the chosen tags (and, if asked, nothing tagged at all), each expense once.
-- A null bound means unbounded, so (null, null) is all time.
create function tags_total(tag_ids uuid[], include_untagged boolean default false, from_d date default null, to_d date default null)
returns table (total_cents bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(e.amount_cents), 0)::bigint, count(*)::bigint
  from expenses e
  where is_parent() and e.family_id = my_family()
    and (from_d is null or e.spent_on >= from_d) and (to_d is null or e.spent_on < to_d)
    and (exists (select 1 from expense_tags et where et.expense_id = e.id and et.tag_id = any(coalesce(tag_ids, '{}'::uuid[])))
         or (include_untagged and not exists (select 1 from expense_tags et where et.expense_id = e.id)))
$$;
revoke execute on function tags_total(uuid[], boolean, date, date) from public, anon;
grant execute on function tags_total(uuid[], boolean, date, date) to authenticated;

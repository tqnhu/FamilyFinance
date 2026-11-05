-- Migration 005 (Phase 3): shared savings goals, contributions, badges.
-- Apply after 004. Goals are shared by the whole family. Parents add cash; a child contributes from
-- their own Save jar (a real ledger entry, so it can never overspend). All writes go through functions.

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

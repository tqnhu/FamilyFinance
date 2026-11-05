-- Migration 004 (Phase 2): kids' Spend / Save / Give jars, allowance, purchase requests.
-- Apply after 003. Money lives in an append-only ledger (jar_entries); a balance is the sum of
-- its entries. Nobody can write the ledger directly: every change goes through the functions below.

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

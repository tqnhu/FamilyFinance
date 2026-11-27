-- First-party usage events: which screen a person opened, at most once a day per screen. No amounts, no names, no text: only who (a member),
-- what (one of a fixed list of screens) and the day. Used for the KPI queries (docs/kpi-queries.sql), never shown in the app.
-- Clients cannot read or write the table; they call record_usage(), and the owner reads it in the SQL editor.
create table usage_events (
  family_id uuid not null references families on delete cascade,
  member_id uuid not null references members (user_id) on delete cascade,
  kind text not null check (kind in ('home', 'review', 'plan', 'jars', 'goals', 'settings')),
  day date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (member_id, kind, day)
);
create index on usage_events (family_id, day);
alter table usage_events enable row level security;   -- no policy: nothing is visible or writable through the API
revoke all on usage_events from anon, authenticated;

-- Records that the caller opened a screen today. Quietly does nothing for someone without a family. Rows older than 400 days are
-- removed now and then (about one call in fifty), so the table stays small without a scheduled job.
create function record_usage(screen text) returns void
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if m.user_id is null then return; end if;
  if screen is null or screen not in ('home', 'review', 'plan', 'jars', 'goals', 'settings') then raise exception 'unknown screen'; end if;
  insert into usage_events (family_id, member_id, kind) values (m.family_id, m.user_id, screen) on conflict do nothing;
  if random() < 0.02 then delete from usage_events where day < current_date - 400; end if;
end $$;
revoke execute on function record_usage(text) from public, anon;
grant execute on function record_usage(text) to authenticated;

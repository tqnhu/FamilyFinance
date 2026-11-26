-- Migration 015: the family's own classification rules ("when the description contains ..., put it in ..."). Apply after 014.
-- A rule says: when a description contains `pattern` (and the amount is inside the optional range), suggest this category,
-- optionally with a tag and the annual-fee flag. Parents create, change and delete rules; everyone in the family can read them,
-- because suggestions are shown to children too. status 'off' keeps a rule without using it; 'dismissed' remembers that a suggested
-- rule was turned down, so it is not offered again. Patterns are stored lower case without accents, the way descriptions are compared.

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

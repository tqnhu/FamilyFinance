-- FamilyFinance KPI queries. See docs/ROADMAP.md, section 7 ("Measuring success") for what each number means and why.
--
-- HOW TO USE
--   Paste one query at a time into the Supabase SQL editor (it runs as the database owner, which is what reads auth.users).
--   Run them weekly (queries 1 to 6) and monthly (the rest). About 15 minutes.
--
-- PRIVACY AND SAFETY
--   * Every query returns COUNTS AND PERCENTAGES per family or per week. None returns a name, an email address or an amount.
--   * Keep these as saved queries. Do NOT turn them into views or functions in the "public" schema: Supabase exposes that
--     schema through its public API, and these read across all families.
--   * With only a few families, percentages mean little. Look at the counts and at each family individually.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. NORTH STAR: weekly engaged families
--    A family is "engaged" in a week when at least two different members did something in the app that week:
--    logged an expense, asked for a purchase, moved jar money, or put money into a goal.
--    (Only things that change data leave a trace, so someone who just looked at the screen is not counted.)
-- ---------------------------------------------------------------------------------------------------------------------
with events as (
  select family_id, member_id, created_at from expenses
  union all select family_id, child_id, created_at from purchase_requests
  union all select family_id, child_id, created_at from jar_entries where kind = 'move'
  union all select family_id, member_id, created_at from goal_contributions
), weekly as (
  select date_trunc('week', created_at)::date as week, family_id, member_id from events group by 1, 2, 3
), per_family as (
  select week, family_id, count(*) as members from weekly group by 1, 2
)
select week,
       count(*)                          as active_families,
       count(*) filter (where members >= 2) as engaged_families,   -- the north star
       sum(members)                      as active_members
from per_family
group by week
order by week desc
limit 12;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. ACTIVATION: families that, within 7 days of being created, logged at least 3 expenses AND had at least 2 members.
--    Only families older than 7 days are counted, so the answer is final for each one.
-- ---------------------------------------------------------------------------------------------------------------------
select count(*)                                              as families_old_enough,
       count(*) filter (where three_expenses and two_members) as activated,
       round(100.0 * count(*) filter (where three_expenses and two_members) / nullif(count(*), 0), 1) as activated_pct
from (
  select f.id,
         (select count(*) from expenses e where e.family_id = f.id and e.created_at < f.created_at + interval '7 days') >= 3 as three_expenses,
         (select count(*) from members m  where m.family_id = f.id and m.created_at < f.created_at + interval '7 days') >= 2 as two_members
  from families f
  where f.created_at < now() - interval '7 days'
) x;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. TIME TO FIRST EXPENSE: median hours from a family being created to its first logged expense.
-- ---------------------------------------------------------------------------------------------------------------------
select count(*) as families_with_an_expense,
       round((percentile_cont(0.5) within group (order by extract(epoch from (first_expense - f.created_at)) / 3600))::numeric, 1) as median_hours_to_first_expense
from families f
join lateral (select min(e.created_at) as first_expense from expenses e where e.family_id = f.id) x on x.first_expense is not null;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. SIGN-UP FUNNEL, last 30 days: sign-ups, how many confirmed their email, how many reached a family, and how fast they confirmed.
--    Reads auth.users, so it only works in the SQL editor.
-- ---------------------------------------------------------------------------------------------------------------------
select count(*)                                                        as signups,
       count(*) filter (where u.email_confirmed_at is not null)        as confirmed_email,
       count(*) filter (where exists (select 1 from public.members m where m.user_id = u.id)) as reached_a_family,
       round((percentile_cont(0.5) within group (order by extract(epoch from (u.email_confirmed_at - u.created_at)) / 60)
              filter (where u.email_confirmed_at is not null))::numeric, 1) as median_minutes_to_confirm
from auth.users u
where u.created_at > now() - interval '30 days';

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. JOIN FRICTION, last 30 days: wrong invite codes (well-formed guesses only) against people who ended up in a family,
--    and how many people hit the 30-an-hour limit (a sign someone struggled badly).
-- ---------------------------------------------------------------------------------------------------------------------
select (select count(*) from join_attempts where attempted_at > now() - interval '30 days')                       as wrong_code_attempts,
       (select count(*) from members where created_at > now() - interval '30 days')                               as people_who_got_in,
       (select count(*) from (select user_id from join_attempts
                              where attempted_at > now() - interval '30 days'
                              group by user_id, date_trunc('hour', attempted_at) having count(*) >= 30) h)       as lockout_hours;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. HOW FAST CHILDREN GET AN ANSWER, last 90 days: median hours, and the share answered within 24 hours.
-- ---------------------------------------------------------------------------------------------------------------------
select count(*)                                                    as requests,
       count(*) filter (where decided_at is not null)              as answered,
       round((percentile_cont(0.5) within group (order by extract(epoch from (decided_at - created_at)) / 3600)
              filter (where decided_at is not null))::numeric, 1)  as median_hours_to_answer,
       round(100.0 * count(*) filter (where decided_at < created_at + interval '24 hours')
             / nullif(count(*) filter (where decided_at is not null), 0), 1) as answered_within_24h_pct
from purchase_requests
where created_at > now() - interval '90 days';

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. FEATURE ADOPTION: how many families use each feature (ever).
-- ---------------------------------------------------------------------------------------------------------------------
select (select count(*) from families)                                                as families,
       (select count(distinct family_id) from expenses where tag_id is not null)      as using_tags,
       (select count(distinct family_id) from expenses where receipt_path is not null) as using_receipt_photos,
       (select count(distinct family_id) from expenses where import_batch is not null) as using_csv_import,
       (select count(distinct family_id) from bills)                                  as using_bills,
       (select count(distinct family_id) from goals)                                  as using_goals,
       (select count(distinct family_id) from allowances where weekly_cents > 0)      as using_allowance,
       (select count(distinct family_id) from allowances where match_pct > 0)         as using_savings_match;

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. LOGGING CONSISTENCY, last 8 weeks: for each family, in how many of those weeks did it log at least 3 expenses?
--    "4 or more" is the habit this product is trying to build.
-- ---------------------------------------------------------------------------------------------------------------------
select weeks_with_3_plus_expenses, count(*) as families
from (
  select f.id, count(*) filter (where w.n >= 3) as weeks_with_3_plus_expenses
  from families f
  left join (select family_id, date_trunc('week', created_at) as wk, count(*) as n
             from expenses where created_at > now() - interval '8 weeks' group by 1, 2) w on w.family_id = f.id
  group by f.id
) x
group by 1
order by 1 desc;

-- ---------------------------------------------------------------------------------------------------------------------
-- 9. SHARED USE, last 30 days: of the families that logged anything, the share where two or more different people did.
-- ---------------------------------------------------------------------------------------------------------------------
select count(*)                                        as families_that_logged,
       count(*) filter (where loggers >= 2)            as shared_by_two_or_more,
       round(100.0 * count(*) filter (where loggers >= 2) / nullif(count(*), 0), 1) as shared_pct
from (select family_id, count(distinct member_id) as loggers
      from expenses where created_at > now() - interval '30 days' group by family_id) x;

-- ---------------------------------------------------------------------------------------------------------------------
-- 10. DATA-ENTRY FRICTION, last 30 days: the share of expenses that were corrected afterwards, and the share filed under "Other".
--     (Deleted expenses leave no trace, so mistakes fixed by deleting are not counted. See "instrumentation gaps" in the roadmap.)
-- ---------------------------------------------------------------------------------------------------------------------
select count(*)                                                                         as expenses,
       round(100.0 * count(*) filter (where e.edited_at is not null) / nullif(count(*), 0), 1) as edited_pct,
       round(100.0 * count(*) filter (where lower(c.name) = 'other') / nullif(count(*), 0), 1) as filed_under_other_pct,
       round(100.0 * count(*) filter (where e.category_id is null) / nullif(count(*), 0), 1)   as uncategorised_pct
from expenses e left join categories c on c.id = e.category_id
where e.created_at > now() - interval '30 days';

-- ---------------------------------------------------------------------------------------------------------------------
-- 11. BUDGET ADHERENCE, this month: of the categories that have a budget, how many are within it?
--     Uses today's budgets (the app does not keep a history of budget changes). Counts everyday spending and monthly fees,
--     the same rule as the Home screen.
-- ---------------------------------------------------------------------------------------------------------------------
with spend as (
  select family_id, category_id, sum(amount_cents) as spent
  from expenses
  where spent_on >= date_trunc('month', current_date) and (bill_id is null or monthly_fee)
  group by 1, 2
)
select count(*)                                                      as budgeted_categories,
       count(*) filter (where coalesce(s.spent, 0) <= c.budget_cents) as within_budget,
       round(100.0 * count(*) filter (where coalesce(s.spent, 0) <= c.budget_cents) / nullif(count(*), 0), 1) as within_budget_pct
from categories c
left join spend s on s.family_id = c.family_id and s.category_id = c.id
where c.budget_cents > 0 and not c.archived;

-- ---------------------------------------------------------------------------------------------------------------------
-- 12. BILLS PAID ON TIME, last 12 months: payments recorded on or before the due date.
-- ---------------------------------------------------------------------------------------------------------------------
select count(*)                                                                       as payments,
       count(*) filter (where e.spent_on <= bp.due_on)                                as on_time,
       round(100.0 * count(*) filter (where e.spent_on <= bp.due_on) / nullif(count(*), 0), 1) as on_time_pct
from bill_payments bp join expenses e on e.id = bp.expense_id
where bp.due_on > current_date - interval '12 months';

-- ---------------------------------------------------------------------------------------------------------------------
-- 13. CHILDREN: weekly participation and voluntary saving, last 8 weeks.
--     participation = child members who did something in the week. voluntary saving = money a child moved into Save or Give
--     as a share of everything that went into their jars (allowance, deposits and their own moves).
-- ---------------------------------------------------------------------------------------------------------------------
with kids as (select user_id, family_id from members where role = 'child'),
acts as (
  select child_id as kid, date_trunc('week', created_at)::date as week from jar_entries where kind = 'move'
  union all select member_id, date_trunc('week', created_at)::date from expenses where member_id in (select user_id from kids)
  union all select child_id, date_trunc('week', created_at)::date from purchase_requests
  union all select member_id, date_trunc('week', created_at)::date from goal_contributions where member_id in (select user_id from kids)
)
select week,
       count(distinct kid)                                                           as active_children,
       (select count(*) from kids)                                                   as children_in_total,
       round(100.0 * count(distinct kid) / nullif((select count(*) from kids), 0), 1) as participation_pct
from acts
where week > current_date - interval '8 weeks'
group by week
order by week desc;

select round(100.0 * sum(amount_cents) filter (where kind = 'move' and jar in ('save', 'give') and amount_cents > 0)
             / nullif(sum(amount_cents) filter (where amount_cents > 0 and kind in ('allowance', 'deposit', 'move', 'match')), 0), 1) as voluntary_saving_pct
from jar_entries
where created_at > now() - interval '90 days';

-- ---------------------------------------------------------------------------------------------------------------------
-- 14. RETENTION: of the families old enough, how many were still active in the 4th week after they were created
--     (any logged expense, request, jar move or goal contribution between day 22 and day 28)?
-- ---------------------------------------------------------------------------------------------------------------------
with events as (
  select family_id, created_at from expenses
  union all select family_id, created_at from purchase_requests
  union all select family_id, created_at from jar_entries where kind = 'move'
  union all select family_id, created_at from goal_contributions
)
select count(*)                                                as families_old_enough,
       count(*) filter (where active_in_week_4)                as active_in_week_4,
       round(100.0 * count(*) filter (where active_in_week_4) / nullif(count(*), 0), 1) as week_4_retention_pct
from (
  select f.id,
         exists (select 1 from events ev where ev.family_id = f.id
                 and ev.created_at >= f.created_at + interval '21 days' and ev.created_at < f.created_at + interval '28 days') as active_in_week_4
  from families f
  where f.created_at < now() - interval '28 days'
) x;

-- ---------------------------------------------------------------------------------------------------------------------
-- 15. FAMILIES AT RISK: families that were active for at least 3 of their last 6 weeks but logged nothing in the last 14 days.
--     Returns an id and counts only. Look the family up yourself if you decide to reach out.
-- ---------------------------------------------------------------------------------------------------------------------
select f.id as family_id,
       count(distinct date_trunc('week', e.created_at)) filter (where e.created_at > now() - interval '6 weeks') as active_weeks_in_last_6,
       max(e.created_at)::date as last_expense
from families f
join expenses e on e.family_id = f.id
group by f.id
having count(distinct date_trunc('week', e.created_at)) filter (where e.created_at > now() - interval '6 weeks') >= 3
   and max(e.created_at) < now() - interval '14 days'
order by last_expense desc;

-- ---------------------------------------------------------------------------------------------------------------------
-- 16. STORAGE USED BY RECEIPT PHOTOS (Supabase only): how much of the plan's storage allowance is used.
-- ---------------------------------------------------------------------------------------------------------------------
select count(*)                                                         as photos,
       pg_size_pretty(coalesce(sum((metadata ->> 'size')::bigint), 0)) as total_size,
       pg_size_pretty(coalesce(avg((metadata ->> 'size')::bigint), 0)::bigint) as average_size
from storage.objects
where bucket_id = 'receipts';

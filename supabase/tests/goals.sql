-- Phase 3 tests. Run AFTER jars.sql (reuses its users, family and helper functions).
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set C2 '''00000000-0000-0000-0000-000000000003'''
\set Q '''00000000-0000-0000-0000-000000000004'''

-- creation rules
select t.as_user(:C1);
select t.fails($q$select create_goal('Bike','🚲',10000,null)$q$, 'kid cannot create goals');
select t.fails($q$insert into goals(family_id,name,target_cents) select family_id,'x',100 from members where user_id=auth.uid()$q$, 'kid cannot insert goals directly');
select t.as_user(:P);
select t.fails($q$select create_goal('Bad','🎯',50,null)$q$, 'target under 1 euro rejected');
select t.fails($q$select create_goal('Bad','🎯',10000,current_date)$q$, 'deadline must be in the future');
select t.fails($q$select create_goal('   ','🎯',10000,null)$q$, 'blank name rejected');
select create_goal('Holiday','🏖️',20000, current_date + 90) as holiday \gset
select create_goal('Board game','🎲',1000, null) as game \gset
select t.ok((select count(*) from goals)=2, 'two goals created');

-- visibility
select t.as_user(:C2); select t.ok((select count(*) from goals)=2, 'kid sees family goals');
select t.as_user(:Q); select t.ok((select count(*) from goals)=0, 'outside family sees no goals');
select t.fails(format('select contribute_cash(%L::uuid, 100)', :'holiday'), 'outside parent cannot fund another family''s goal');
select t.fails(format('select cancel_goal(%L::uuid)', :'holiday'), 'outside parent cannot cancel another family''s goal');

-- parent cash
select t.as_user(:P);
select contribute_cash(:'holiday'::uuid, 5000);
select t.ok((select raised_cents from goal_totals where goal_id=:'holiday'::uuid)=5000, 'cash contribution counted');
select t.fails(format('select contribute_cash(%L::uuid, 0)', :'holiday'), 'zero contribution rejected');
select t.fails(format('select contribute_cash(%L::uuid, 99999)', :'holiday'), 'cannot overshoot the target');
select t.as_user(:C1);
select t.fails(format('select contribute_cash(%L::uuid, 100)', :'holiday'), 'kid cannot add cash');
select t.as_user(:P);
select t.fails(format('select contribute_from_save(%L::uuid, 100)', :'holiday'), 'parent cannot give from a Save jar');

-- kid contributes from the Save jar
select t.as_user(:C1);
select balance_cents as s1 from jar_balances where jar='save' \gset
select contribute_from_save(:'holiday'::uuid, 3000);
select t.ok((select balance_cents from jar_balances where jar='save') = :s1 - 3000, 'Save jar went down by the contribution');
select t.ok((select raised_cents from goal_totals where goal_id=:'holiday'::uuid)=8000, 'goal total includes kid money');
select t.fails(format('select contribute_from_save(%L::uuid, %s)', :'holiday', :s1), 'cannot give more than the Save jar holds');
select t.fails(format('select contribute_from_save(%L::uuid, 0)', :'holiday'), 'zero rejected');
select t.fails(format('select contribute_from_save(%L::uuid, 13000)', :'holiday'), 'kid cannot overshoot the target');
select t.as_user(:C2);
select contribute_from_save(:'holiday'::uuid, 100);
select t.ok((select count(*) from goal_contributions where goal_id=:'holiday'::uuid)=3, 'everyone sees all contributions');

-- reaching a goal
select t.as_user(:P); select contribute_cash(:'game'::uuid, 400);
select t.as_user(:C1); select contribute_from_save(:'game'::uuid, 600);
select t.ok((select status from goals where id=:'game'::uuid)='reached', 'goal marked reached at target');
select t.ok((select reached_on from goals where id=:'game'::uuid)=current_date, 'reached date set');
select t.fails(format('select contribute_from_save(%L::uuid, 100)', :'game'), 'cannot add to a reached goal');
select t.as_user(:P);
select t.fails(format('select cancel_goal(%L::uuid)', :'game'), 'reached goal cannot be cancelled');

-- cancelling refunds Save-jar money
select t.as_user(:C1); select balance_cents as s2 from jar_balances where jar='save' \gset
select t.as_user(:C2); select balance_cents as s2b from jar_balances where jar='save' \gset
select t.as_user(:C1);
select t.fails(format('select cancel_goal(%L::uuid)', :'holiday'), 'kid cannot cancel a goal');
select t.as_user(:P); select cancel_goal(:'holiday'::uuid);
select t.ok((select status from goals where id=:'holiday'::uuid)='cancelled', 'goal cancelled');
select t.ok((select balance_cents from jar_balances where child_id=:C1 and jar='save') = :s2 + 3000, 'kid 1 refunded exactly what they gave');
select t.ok((select balance_cents from jar_balances where child_id=:C2 and jar='save') = :s2b + 100, 'kid 2 refunded exactly what they gave');
select t.fails(format('select cancel_goal(%L::uuid)', :'holiday'), 'cannot cancel twice (no double refund)');
select t.fails(format('select contribute_cash(%L::uuid, 100)', :'holiday'), 'cannot fund a cancelled goal');

-- badges
select t.as_user(:C1);
select t.ok(child_stats()->'badges' @> '[{"id":"first_save"}]', 'badge: first save');
select t.ok(child_stats()->'badges' @> '[{"id":"generous"}]', 'badge: generous');
select t.ok(child_stats()->'badges' @> '[{"id":"goal_getter"}]', 'badge: goal getter');
select t.ok(child_stats()->'badges' @> '[{"id":"goal_reached"}]', 'badge: goal reached');
select t.ok(child_stats()->'badges' @> '[{"id":"big_saver"}]', 'badge: big saver (Save jar over 50 euro)');
select t.ok(not (child_stats()->'badges' @> '[{"id":"streak_4"}]'), 'no 4-week streak yet');
select t.ok((child_stats()->>'streak')::int = 1, 'streak counts this week');
select t.as_user(:C2);
select t.ok(not (child_stats()->'badges' @> '[{"id":"generous"}]'), 'kid 2 has no generous badge');
select t.ok(child_stats(:C1)->'badges' @> '[{"id":"goal_reached"}]' = false, 'a kid asking about another kid still gets their own stats');
select t.as_user(:P);
select t.ok(child_stats(:C1)->'badges' @> '[{"id":"generous"}]', 'parent can read a child''s badges');
select t.fails($q$select child_stats(null)$q$, 'parent must name a child');
select t.as_user(:Q);
select t.fails(format('select child_stats(%L::uuid)', :C1), 'outside parent cannot read badges');

-- streak logic with back-dated entries (as superuser, for kid 2)
select t.su();
insert into jar_entries(family_id, child_id, jar, amount_cents, kind, note, created_at)
  select family_id, user_id, 'save', 100, 'move', 'from spend', now() - interval '7 days' * k
  from members, generate_series(0,3) k where user_id = :C2;
select t.as_user(:C2);
select t.ok((child_stats()->>'streak')::int = 4 and (child_stats()->>'best_streak')::int = 4, 'four weeks in a row = streak 4');
select t.ok(child_stats()->'badges' @> '[{"id":"streak_4"}]', 'badge: 4-week streak');
select t.su();
delete from jar_entries where child_id = :C2 and kind='move' and created_at::date = (now() - interval '7 days')::date;
select t.as_user(:C2);
select t.ok((child_stats()->>'streak')::int = 1 and (child_stats()->>'best_streak')::int = 2, 'a missed week breaks the streak');
select t.su();
delete from jar_entries where child_id = :C2 and kind='move' and created_at >= now() - interval '8 days';
select t.as_user(:C2);
select t.ok((child_stats()->>'streak')::int = 0 and (child_stats()->>'best_streak')::int = 2, 'old streak is no longer current');

select t.su();
select t.ok((select count(*) from jar_balances where balance_cents < 0) = 0, 'no negative balances after goals');
select t.ok((select count(*) from goals g where status='reached' and goal_raised(g.id) < target_cents) = 0, 'reached goals are fully funded');

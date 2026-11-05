create schema t; grant usage on schema t to anon, authenticated;
create function t.ok(c boolean, msg text) returns void language plpgsql as $$ begin
  if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'PASS: %', msg; end $$;
create function t.fails(q text, msg text) returns void language plpgsql as $$ begin
  begin execute q; exception when others then raise notice 'PASS: % (%)', msg, sqlerrm; return; end;
  raise exception 'FAIL (no error raised): %', msg; end $$;
create function t.as_user(u uuid) returns void language plpgsql as $$ begin
  reset role; perform set_config('request.jwt.claim.sub', u::text, false); set role authenticated; end $$;
create function t.su() returns void language plpgsql as $$ begin reset role; end $$;
grant execute on all functions in schema t to anon, authenticated;

insert into auth.users values
 ('00000000-0000-0000-0000-000000000001','p@x'),('00000000-0000-0000-0000-000000000002','c1@x'),
 ('00000000-0000-0000-0000-000000000003','c2@x'),('00000000-0000-0000-0000-000000000004','q@x');
\set P '''00000000-0000-0000-0000-000000000001'''
\set C1 '''00000000-0000-0000-0000-000000000002'''
\set C2 '''00000000-0000-0000-0000-000000000003'''
\set Q '''00000000-0000-0000-0000-000000000004'''

select t.as_user(:P); select create_family('Fam', 'Parent');
select t.su();
select kid_code as kc from families where name='Fam' \gset
select t.as_user(:C1); select join_family(:'kc', 'Kid1');
select t.as_user(:C2); select join_family(:'kc', 'Kid2');
select t.as_user(:Q); select create_family('Other', 'Outsider');

-- 1. permissions: the ledger cannot be written directly
select t.as_user(:C1);
select t.fails($q$insert into jar_entries(family_id,child_id,jar,amount_cents,kind) select family_id,user_id,'spend',99999,'deposit' from members where user_id=auth.uid()$q$, 'kid cannot insert ledger rows');
select t.fails($q$update purchase_requests set status='approved'$q$, 'kid cannot update requests directly');
select t.fails($q$select add_money(auth.uid(),'spend',1000,'cheat')$q$, 'kid cannot call add_money');
select t.fails($q$select set_allowance(auth.uid(),5000,50,40,10,100)$q$, 'kid cannot set allowance');
select t.fails($q$select decide_purchase(gen_random_uuid(),true,'')$q$, 'kid cannot approve');
select t.as_user(:P);
select t.fails($q$select request_purchase('spend','toy',100)$q$, 'parent cannot make a request');
select t.su(); select t.fails($q$select add_money(null,'spend',1,'')$q$, 'anon-less call without login fails');

-- 2. deposit + requests with reservation
select t.as_user(:P); select add_money(:C1,'spend',1000,'birthday');
select t.as_user(:C1);
select t.ok((select balance_cents from jar_balances where jar='spend')=1000, 'spend balance 10.00');
select request_purchase('spend','Lego',600);
select t.fails($q$select request_purchase('spend','Ball',600)$q$, 'cannot request more than available after pending');
select request_purchase('spend','Ball',400);
select t.fails($q$select request_purchase('save','Bike',100)$q$, 'cannot request from save jar');
select t.fails($q$select request_purchase('spend','x',0)$q$, 'zero amount rejected');
select t.fails($q$select request_purchase('spend','   ',100)$q$, 'blank item rejected');

-- 3. approvals
select t.as_user(:P);
select id as lego from purchase_requests where item='Lego' \gset
select id as ball from purchase_requests where item='Ball' \gset
select decide_purchase(:'lego'::uuid, true, 'ok');
select t.fails(format('select decide_purchase(%L::uuid, true, '''')', :'lego'), 'cannot decide twice');
select t.ok((select balance_cents from jar_balances where child_id=:C1 and jar='spend')=400, 'balance 4.00 after approval');
select add_money(:C1,'spend',-300,'correction');
select t.fails(format('select decide_purchase(%L::uuid, true, '''')', :'ball'), 'approve fails when money no longer there');
select decide_purchase(:'ball'::uuid, false, 'not now');
select t.ok((select status from purchase_requests where item='Ball')='declined', 'declined request marked');
select t.ok((select balance_cents from jar_balances where child_id=:C1 and jar='spend')=100, 'decline moves no money');
select t.fails($q$select add_money(null,'spend',1,'')$q$, 'null child rejected');
select t.fails(format('select add_money(%L::uuid,''spend'',-9999,'''')', :C1), 'cannot take a jar below zero');

-- 4. moves and match
select t.as_user(:P); select set_allowance(:C1, 1000, 50, 40, 10, 50); select add_money(:C1,'spend',900,'');
select t.as_user(:C1);
select move_money(null,'spend','save',400);
select t.ok((select balance_cents from jar_balances where jar='spend')=600, 'spend 6.00 after move');
select t.ok((select balance_cents from jar_balances where jar='save')=600, 'save 4.00 + 2.00 parent match');
select t.fails($q$select move_money(null,'save','spend',100)$q$, 'kid cannot take money out of save');
select t.fails($q$select move_money(null,'spend','save',100000)$q$, 'cannot move more than available');
select move_money(null,'spend','give',100);
select t.ok((select balance_cents from jar_balances where jar='give')=100, 'give gets 1.00, no match');
select t.as_user(:P); select move_money(:C1,'save','spend',600);
select t.ok((select balance_cents from jar_balances where child_id=:C1 and jar='save')=0, 'parent can move out of save');

-- 5. allowance catch-up
select t.su();
update allowances set next_pay_on = current_date - 15 where child_id=:C1;
select t.as_user(:C2);  -- any family member may trigger settlement
select t.ok(settle_allowance()=3, 'three missed weeks paid');
select t.as_user(:C1);
select t.ok((select sum(amount_cents) from jar_entries where kind='allowance' and jar='spend')=1500, 'allowance spend 3x5.00');
select t.ok((select sum(amount_cents) from jar_entries where kind='allowance' and jar='save')=1200, 'allowance save 3x4.00');
select t.ok((select sum(amount_cents) from jar_entries where kind='allowance' and jar='give')=300, 'allowance give 3x1.00');
select t.ok(settle_allowance()=0, 'second call pays nothing');
select t.su(); update allowances set next_pay_on = current_date - 200 where child_id=:C1;
select t.as_user(:C1);
select t.ok(settle_allowance()=12, 'very late allowance capped at 12 payments');
select t.ok((select next_pay_on from allowances where child_id=auth.uid()) > current_date, 'next payday moved into the future');
select t.ok((select next_pay_on from allowances where child_id=auth.uid()) <= current_date + 7, 'and no further than a week ahead');
select t.ok(settle_allowance()=0, 'nothing more due');
select t.as_user(:P); select set_allowance(:C2, 999, 33, 33, 34, 0);
select t.fails($q$select set_allowance(null,100,50,50,10,0)$q$, 'null child rejected');
select t.fails(format('select set_allowance(%L::uuid,100,50,50,10,0)', :C2), 'split must sum to 100');
select t.su(); update allowances set next_pay_on = current_date where child_id=:C2;
select t.as_user(:P); select settle_allowance();
select t.ok((select sum(amount_cents) from jar_entries where child_id=:C2 and kind='allowance')=999, 'odd amount splits without losing a cent');

-- 6. isolation
select t.as_user(:C2);
select t.ok((select count(*) from jar_entries where child_id=:C1)=0, 'kid 2 cannot see kid 1 entries');
select t.ok((select count(*) from purchase_requests where child_id=:C1)=0, 'kid 2 cannot see kid 1 requests');
select t.ok((select count(*) from allowances where child_id=:C1)=0, 'kid 2 cannot see kid 1 allowance');
select t.as_user(:Q);
select t.ok((select count(*) from jar_entries)=0, 'outside family sees no ledger');
select t.fails(format('select add_money(%L::uuid,''spend'',100,'''')', :C1), 'outside parent cannot pay another family''s kid');
select t.fails(format('select set_allowance(%L::uuid,100,50,40,10,0)', :C1), 'outside parent cannot set another family''s allowance');
select t.fails(format('select decide_purchase(%L::uuid,true,'''')', :'lego'), 'outside parent cannot decide another family''s request');
select t.fails($q$select jar_balance(auth.uid(),'spend')$q$, 'internal helpers are not callable');
select t.as_user(:P);
select t.ok((select count(*) from jar_entries where child_id=:C1)>0, 'parent sees own kids ledger');

-- 7. ledger integrity: no jar is ever negative
select t.su();
select t.ok((select count(*) from jar_balances where balance_cents<0)=0, 'no negative balances anywhere');

-- Migration 007: editing expenses safely. Apply after 006.
-- A child can edit their own expenses, a parent any family expense. Every real change is stamped with who
-- and when (edited_at / edited_by), which clients cannot set. Bill payments cannot be edited here.

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

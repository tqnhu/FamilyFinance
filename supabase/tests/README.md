# Database tests

`jars.sql` (Phase 2), `goals.sql` (Phase 3) and `bills.sql` (Phase 4) and `edit_expenses.sql` (expense editing) and `receipts.sql` (receipt photos, import batches) `monthly_fees.sql` and `tags.sql`, run in that order, then `join_family.sql` (joining a family) `profile.sql` (profile and family settings) and `privileges.sql` (who may call which function), the last two self-contained, check the money rules (who can do what, balances never go negative,
allowance catch-up, family isolation) against a scratch Postgres database. It prints `PASS`/`FAIL` lines
and stops at the first failure.

```bash
createdb ff_test
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/stub.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/schema.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/jars.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/goals.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/bills.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/edit_expenses.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/receipts.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/monthly_fees.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/tags.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/join_family.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/profile.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/privileges.sql
```

Never run these against your real Supabase project: the test inserts fake users.

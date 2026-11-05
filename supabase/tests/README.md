# Database tests

`jars.sql` checks the Phase 2 money rules (who can do what, balances never go negative,
allowance catch-up, family isolation) against a scratch Postgres database. It prints `PASS`/`FAIL` lines
and stops at the first failure.

```bash
createdb ff_test
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/stub.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/schema.sql
psql -v ON_ERROR_STOP=1 -q -d ff_test -f supabase/tests/jars.sql
```

Never run these against your real Supabase project: the test inserts fake users.

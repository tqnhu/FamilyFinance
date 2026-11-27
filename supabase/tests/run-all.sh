#!/usr/bin/env bash
# Runs every database test, in order, against a scratch Postgres. NEVER point it at your real project: the tests insert fake users.
# The connection comes from the usual PG* variables (PGHOST, PGPORT, PGUSER, PGPASSWORD). Usage: supabase/tests/run-all.sh [database name]
set -euo pipefail
tests="$(cd "$(dirname "$0")" && pwd)"
schema="$tests/../schema.sql"
db="${1:-ff_test}"
psql -q -d postgres -c "drop database if exists $db" -c "create database $db"
run() { echo "== $1"; psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$1" | tee -a "${TEST_LOG:-/dev/null}"; }
run "$tests/stub.sql"
run "$schema"
for t in jars goals bills edit_expenses receipts monthly_fees tags annual_fee classification_rules tag_filter usage_events join_family profile privileges; do
  run "$tests/$t.sql"
done
echo "database tests passed"

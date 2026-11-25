#!/bin/sh
set -eu
workspace=$(mktemp -d "${TMPDIR:-/tmp}/nexus-rls.XXXXXX")
cleanup() {
    if [ -s "$workspace/data/postmaster.pid" ]; then
        pg_ctl -D "$workspace/data" -m fast -w stop >/dev/null
    fi
    rm -r "$workspace"
}
trap cleanup EXIT
initdb -D "$workspace/data" -A trust -U nexus_test --no-locale >/dev/null
pg_ctl -D "$workspace/data" -l "$workspace/postgres.log" -o "-k $workspace -h ''" -w start >/dev/null
psql -h "$workspace" -U nexus_test -d postgres -X -v ON_ERROR_STOP=1 \
    -f tests/sql/supabase-bootstrap.sql -f private/supabase/001_customer_portal.sql -f tests/sql/customer-isolation.sql
psql -h "$workspace" -U nexus_test -d postgres -X -v ON_ERROR_STOP=1 \
    -f tests/sql/dispatch-fixture.sql -f private/nexus/migrations/009.sql -f tests/sql/dispatch-verification.sql

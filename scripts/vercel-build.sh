#!/bin/bash
set -euo pipefail

# Adapt the Prisma datasource to whatever database is attached.
# The Supabase Vercel integration sets POSTGRES_URL, POSTGRES_PRISMA_URL and
# POSTGRES_URL_NON_POOLING — not DATABASE_URL. A copied local env may also
# set DATABASE_URL=file:./dev.db, which must not win over a real Postgres URL.
# db push needs a direct connection: the transaction pooler (port 6543)
# rejects Prisma's prepared statements. Runtime pooling is applied in
# src/lib/database-url.ts from the original environment.

is_postgres() {
  case "$1" in
    postgres://*|postgresql://*|prisma://*|prisma+postgres://*) return 0 ;;
    *) return 1 ;;
  esac
}

first_postgres() {
  local candidate
  for candidate in "$@"; do
    if [ -n "$candidate" ] && is_postgres "$candidate"; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

MIGRATE_URL=""
if MIGRATE_URL="$(first_postgres \
  "${POSTGRES_URL_NON_POOLING:-}" \
  "${DATABASE_URL_UNPOOLED:-}" \
  "${DIRECT_URL:-}" \
  "${DATABASE_URL:-}" \
  "${POSTGRES_PRISMA_URL:-}" \
  "${POSTGRES_URL:-}")"; then
  export DATABASE_URL="$MIGRATE_URL"
elif [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="file:./dev.db"
fi

case "${DATABASE_URL}" in
  postgres://*|postgresql://*|prisma://*|prisma+postgres://*)
    sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
    ;;
esac

# Scheme only — never print the URL itself (it contains credentials on Postgres).
echo "Build datasource scheme: ${DATABASE_URL%%:*}"
case "${DATABASE_URL}" in
  *":6543"*|*"-pooler."*)
    echo "Build is using a pooled connection. If prisma db push fails, set POSTGRES_URL_NON_POOLING or DIRECT_URL to the direct (port 5432) URI."
    ;;
esac

npx prisma generate
npx prisma db push --skip-generate
npx prisma db seed
npx next build

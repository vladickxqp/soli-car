#!/bin/sh
set -e

RUN_DB_PUSH="${RUN_DB_PUSH:-true}"
SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}"

echo "Waiting for database port..."
until nc -z db 5432; do
  printf '.'
  sleep 1
done

echo "\nDatabase port is available."

echo "Waiting for database connection..."
until printf 'SELECT 1;\n' | npx prisma db execute --stdin --url "$DATABASE_URL" >/dev/null 2>&1; do
  printf '.'
  sleep 1
done

echo "\nDatabase connection is ready."

echo "Normalizing legacy role values..."
printf '%s\n' \
'DO $$' \
'BEGIN' \
'  IF EXISTS (' \
'    SELECT 1' \
'    FROM pg_type t' \
'    JOIN pg_enum e ON e.enumtypid = t.oid' \
'    WHERE t.typname = ''Role''' \
'      AND e.enumlabel = ''USER''' \
'  ) THEN' \
'    UPDATE "User" SET role = ''MANAGER'' WHERE role::text = ''USER'';' \
'  END IF;' \
'END $$;' \
  | npx prisma db execute --stdin --url "$DATABASE_URL" >/dev/null 2>&1 || true

if [ "$RUN_DB_PUSH" = "true" ]; then
  echo "Applying Prisma schema..."
  npx prisma db push --accept-data-loss --skip-generate
else
  echo "Skipping Prisma schema sync because RUN_DB_PUSH=$RUN_DB_PUSH"
fi

if [ "$SEED_DEMO_DATA" = "true" ]; then
  echo "Seeding database..."
  npm run prisma:seed
else
  echo "Skipping demo seed because SEED_DEMO_DATA=$SEED_DEMO_DATA"
fi

echo "Starting Soli Car backend..."
exec node dist/index.js

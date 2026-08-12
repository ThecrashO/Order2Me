-- ============================================================
-- Allow different users to use the same profile name.
-- Email and auth_user_id remain unique account identifiers.
-- Run once in Supabase Dashboard > SQL Editor.
-- ============================================================

BEGIN;

-- This is the default name Supabase/Postgres gives to a UNIQUE(name)
-- constraint. It is safe when the constraint is absent.
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_name_key;

-- Handle a custom-named UNIQUE constraint that covers only users.name.
DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class table_class ON table_class.oid = c.conrelid
    JOIN pg_namespace table_schema ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'users'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(attribute.attname ORDER BY key_column.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        JOIN pg_attribute attribute
          ON attribute.attrelid = c.conrelid
         AND attribute.attnum = key_column.attnum
      ) = ARRAY['name']::name[]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.users DROP CONSTRAINT %I',
      constraint_record.conname
    );
  END LOOP;
END
$$;

-- Also remove a manually created standalone UNIQUE index on only users.name.
DO $$
DECLARE
  index_record record;
BEGIN
  FOR index_record IN
    SELECT index_class.relname AS index_name
    FROM pg_index index_info
    JOIN pg_class table_class ON table_class.oid = index_info.indrelid
    JOIN pg_namespace table_schema ON table_schema.oid = table_class.relnamespace
    JOIN pg_class index_class ON index_class.oid = index_info.indexrelid
    JOIN pg_attribute attribute
      ON attribute.attrelid = table_class.oid
     AND attribute.attnum = index_info.indkey[0]
    LEFT JOIN pg_constraint constraint_info
      ON constraint_info.conindid = index_info.indexrelid
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'users'
      AND index_info.indisunique
      AND index_info.indnkeyatts = 1
      AND attribute.attname = 'name'
      AND constraint_info.oid IS NULL
  LOOP
    EXECUTE format('DROP INDEX public.%I', index_record.index_name);
  END LOOP;
END
$$;

COMMIT;

-- Verification: this should return zero rows after the migration.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'users'
  AND indexdef ILIKE '%UNIQUE%'
  AND indexdef ~* '\(name\)';

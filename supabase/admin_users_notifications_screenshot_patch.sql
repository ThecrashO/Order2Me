-- Order2Me: admin user realtime + owner order notifications + payment screenshots
-- Run this in Supabase SQL Editor after multi_shop_migration.sql.

BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS screenshot_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public can view screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Customers can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Customers upload approved shop payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users read permitted payment screenshots" ON storage.objects;

CREATE POLICY "Customers upload approved shop payment screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-screenshots'
  AND public.current_profile_role() = 'customer'
  AND (storage.foldername(name))[1] ~ '^[0-9]+$'
  AND (storage.foldername(name))[2] ~ '^[0-9]+$'
  AND ((storage.foldername(name))[2])::bigint = public.current_profile_id()
  AND EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = ((storage.foldername(name))[1])::bigint
      AND s.status = 'approved'
  )
);

CREATE POLICY "Users read permitted payment screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-screenshots'
  AND (
    (
      (storage.foldername(name))[1] ~ '^[0-9]+$'
      AND (
        public.owns_approved_shop(((storage.foldername(name))[1])::bigint)
        OR public.is_admin()
        OR (
          (storage.foldername(name))[2] ~ '^[0-9]+$'
          AND ((storage.foldername(name))[2])::bigint = public.current_profile_id()
        )
      )
    )
    OR (
      COALESCE(array_length(storage.foldername(name), 1), 0) = 0
      AND public.current_profile_role() IN ('owner', 'admin')
    )
  )
);

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.users REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END;
$$;

COMMIT;

-- Verification
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payments'
  AND column_name = 'screenshot_path';

SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('orders', 'users')
ORDER BY tablename;

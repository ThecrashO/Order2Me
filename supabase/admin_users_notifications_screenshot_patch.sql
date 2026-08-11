-- Order2Me: admin user realtime + owner order notifications + payment screenshots
-- Run this in Supabase SQL Editor after multi_shop_migration.sql.

BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS screenshot_path text;

UPDATE public.payments
SET screenshot_path = split_part(split_part(screenshot_url, '/payment-screenshots/', 2), '?', 1)
WHERE screenshot_path IS NULL
  AND screenshot_url LIKE '%/payment-screenshots/%';

NOTIFY pgrst, 'reload schema';

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Customers can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Owners can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Customers create own payments" ON public.payments;
DROP POLICY IF EXISTS "Users read permitted payments" ON public.payments;
DROP POLICY IF EXISTS "Admins manage all payments" ON public.payments;

CREATE POLICY "Customers create own payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND o.customer_id = public.current_profile_id()
  )
);

CREATE POLICY "Users read permitted payments"
ON public.payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND (
        o.customer_id = public.current_profile_id()
        OR public.owns_approved_shop(o.shop_id)
        OR public.is_admin()
      )
  )
);

CREATE POLICY "Admins manage all payments"
ON public.payments FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

CREATE OR REPLACE FUNCTION public.can_upload_payment_screenshot(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  folders text[];
  profile_id bigint;
  profile_role text;
BEGIN
  folders := storage.foldername(object_name);

  SELECT u.id, u.role
  INTO profile_id, profile_role
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF auth.uid() IS NULL
     OR profile_id IS NULL
     OR profile_role <> 'customer'
     OR COALESCE(array_length(folders, 1), 0) < 2 THEN
    RETURN false;
  END IF;

  IF folders[2] <> profile_id::text
     AND folders[2] <> auth.uid()::text THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id::text = folders[1]
      AND s.status = 'approved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_payment_screenshot(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  folders text[];
  profile_id bigint;
  profile_role text;
BEGIN
  folders := storage.foldername(object_name);

  SELECT u.id, u.role
  INTO profile_id, profile_role
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF auth.uid() IS NULL OR profile_id IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(array_length(folders, 1), 0) = 0 THEN
    RETURN profile_role IN ('owner', 'admin');
  END IF;

  IF profile_role = 'admin' THEN
    RETURN true;
  END IF;

  IF profile_role = 'owner' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id::text = folders[1]
        AND s.owner_id = profile_id
        AND s.status = 'approved'
    );
  END IF;

  RETURN COALESCE(array_length(folders, 1), 0) >= 2
    AND (folders[2] = profile_id::text OR folders[2] = auth.uid()::text)
    AND EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id::text = folders[1]
        AND s.status = 'approved'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.can_upload_payment_screenshot(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_payment_screenshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_upload_payment_screenshot(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_payment_screenshot(text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public can view screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Customers can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Customers upload approved shop payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users read permitted payment screenshots" ON storage.objects;

CREATE POLICY "Customers upload approved shop payment screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-screenshots'
  AND public.can_upload_payment_screenshot(name)
);

CREATE POLICY "Users read permitted payment screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-screenshots'
  AND public.can_read_payment_screenshot(name)
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

-- Latest proof records. storage_file_exists must be true for the owner to
-- receive an image; a missing payment row/file cannot be reconstructed.
SELECT
  o.id AS order_id,
  o.shop_id,
  p.payment_method,
  p.screenshot_path,
  (p.id IS NOT NULL) AS payment_record_exists,
  EXISTS (
    SELECT 1
    FROM storage.objects so
    WHERE so.bucket_id = 'payment-screenshots'
      AND so.name = p.screenshot_path
  ) AS storage_file_exists
FROM public.orders o
LEFT JOIN public.payments p ON p.order_id = o.id
ORDER BY o.created_at DESC
LIMIT 20;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'Customers upload approved shop payment screenshots',
    'Users read permitted payment screenshots'
  )
ORDER BY policyname;

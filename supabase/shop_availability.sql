-- ============================================================
-- Order2Me shop availability and server-side order guard
-- Run once in Supabase Dashboard > SQL Editor.
-- Requires supabase/multi_shop_migration.sql first.
-- Safe to rerun.
-- ============================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_path text;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepting_orders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepting_orders_date date NOT NULL DEFAULT ((timezone('Asia/Yangon', now()))::date),
  ADD COLUMN IF NOT EXISTS opening_time time without time zone NOT NULL DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS closing_time time without time zone NOT NULL DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS preparation_minutes integer NOT NULL DEFAULT 15;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shops_preparation_minutes_check'
      AND conrelid = 'public.shops'::regclass
  ) THEN
    ALTER TABLE public.shops
      ADD CONSTRAINT shops_preparation_minutes_check
      CHECK (preparation_minutes BETWEEN 1 AND 180);
  END IF;
END;
$$;

-- Opening and closing at the same time means open 24 hours. Overnight
-- schedules (for example 18:00 to 02:00) are supported. All calculations
-- use Myanmar time so customers cannot bypass hours by changing devices.
CREATE OR REPLACE FUNCTION public.shop_accepts_orders(target_shop_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shops s
    CROSS JOIN LATERAL (
      SELECT
        (timezone('Asia/Yangon', now()))::date AS local_date,
        (timezone('Asia/Yangon', now()))::time AS local_time
    ) clock
    WHERE s.id = target_shop_id
      AND s.status = 'approved'
      AND s.is_open
      AND (s.accepting_orders OR s.accepting_orders_date <> clock.local_date)
      AND (
        s.opening_time = s.closing_time
        OR (
          s.opening_time < s.closing_time
          AND clock.local_time >= s.opening_time
          AND clock.local_time < s.closing_time
        )
        OR (
          s.opening_time > s.closing_time
          AND (
            clock.local_time >= s.opening_time
            OR clock.local_time < s.closing_time
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.shop_accepts_orders(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shop_accepts_orders(bigint) TO authenticated;

-- Replace the customer insert policy so the database remains authoritative
-- even when someone bypasses the browser UI or the shop closes mid-checkout.
DROP POLICY IF EXISTS "Customers create orders at approved shops" ON public.orders;
CREATE POLICY "Customers create orders at approved shops"
ON public.orders FOR INSERT TO authenticated
WITH CHECK (
  customer_id = public.current_profile_id()
  AND public.current_profile_role() = 'customer'
  AND public.shop_accepts_orders(shop_id)
);

-- Return public ordering settings with the existing approved-shop RPC.
DROP FUNCTION IF EXISTS public.get_approved_shops_with_owner();
CREATE FUNCTION public.get_approved_shops_with_owner()
RETURNS TABLE (
  id bigint,
  owner_id bigint,
  name text,
  description text,
  address text,
  phone_number text,
  logo_url text,
  status text,
  is_open boolean,
  accepting_orders boolean,
  accepting_orders_date date,
  opening_time time without time zone,
  closing_time time without time zone,
  preparation_minutes integer,
  is_accepting_orders_now boolean,
  owner_name text,
  owner_avatar_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    s.id,
    s.owner_id,
    s.name,
    s.description,
    s.address,
    s.phone_number,
    s.logo_url,
    s.status,
    s.is_open,
    s.accepting_orders,
    s.accepting_orders_date,
    s.opening_time,
    s.closing_time,
    s.preparation_minutes,
    public.shop_accepts_orders(s.id) AS is_accepting_orders_now,
    u.name AS owner_name,
    u.avatar_path AS owner_avatar_path
  FROM public.shops s
  JOIN public.users u ON u.id = s.owner_id
  WHERE s.status = 'approved'
  ORDER BY s.name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_approved_shops_with_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_shops_with_owner() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

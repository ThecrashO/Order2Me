-- ============================================================
-- Allow customers to display owner avatars for approved shops.
-- Run this after shop_availability.sql and profile_images.sql.
-- ============================================================

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

CREATE OR REPLACE FUNCTION public.can_read_profile_image(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  folders text[];
  target_profile_id bigint;
BEGIN
  folders := storage.foldername(object_name);

  IF auth.uid() IS NULL OR COALESCE(array_length(folders, 1), 0) < 1 THEN
    RETURN false;
  END IF;

  IF folders[1] = auth.uid()::text THEN
    RETURN true;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT u.id
  INTO target_profile_id
  FROM public.users u
  WHERE u.auth_user_id::text = folders[1]
  LIMIT 1;

  IF target_profile_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.current_profile_role() = 'customer' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = target_profile_id
        AND s.status = 'approved'
    );
  END IF;

  RETURN public.owner_can_view_customer(target_profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_profile_image(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_profile_image(text) TO authenticated;

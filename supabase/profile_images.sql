-- ============================================================
-- Order2Me profile photos
-- Run once in Supabase Dashboard > SQL Editor.
-- Requires supabase/multi_shop_migration.sql to have been run first.
-- ============================================================

BEGIN;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS avatar_path text;

-- Return only the public shop fields needed by the customer picker plus the
-- owner's display name/avatar. This avoids opening the whole users row to
-- customers through a broad SELECT policy.
CREATE OR REPLACE FUNCTION public.get_approved_shops_with_owner()
RETURNS TABLE (
  id bigint,
  owner_id bigint,
  name text,
  description text,
  address text,
  phone_number text,
  logo_url text,
  status text,
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
    u.name AS owner_name,
    u.avatar_path AS owner_avatar_path
  FROM public.shops s
  JOIN public.users u ON u.id = s.owner_id
  WHERE s.status = 'approved'
  ORDER BY s.name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_approved_shops_with_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_shops_with_owner() TO authenticated;

-- The multi-shop migration intentionally restricts which profile columns an
-- authenticated user may update. Add avatar_path to that safe list.
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (name, email, phone_number, avatar_path) ON public.users TO authenticated;

-- A user may only point their profile row at a file inside their own Auth UID
-- folder. This prevents cross-account avatar-path assignment through REST.
DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile"
ON public.users FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (
  auth_user_id = auth.uid()
  AND (
    avatar_path IS NULL
    OR split_part(avatar_path, '/', 1) = auth.uid()::text
  )
);

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'profile-images',
  'profile-images',
  false,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

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

  -- Every avatar lives at auth-user-uuid/filename.ext.
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

  -- Customers can see the avatar belonging to an approved shop owner.
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

DROP POLICY IF EXISTS "Users upload own profile image" ON storage.objects;
DROP POLICY IF EXISTS "Users update own profile image" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own profile image" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users read profile images" ON storage.objects;

CREATE POLICY "Users upload own profile image"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users update own profile image"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'profile-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profile-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own profile image"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authorized users read profile images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-images'
  AND public.can_read_profile_image(name)
);

COMMIT;

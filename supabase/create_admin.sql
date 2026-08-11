-- ============================================================
-- Order2Me Admin Bootstrap
-- 1. Supabase Dashboard > Authentication > Users > Add user.
-- 2. Replace the two values below, then run this file in SQL Editor.
-- Never expose admin creation through the public signup page.
-- ============================================================

DO $$
DECLARE
  admin_email text := 'admin@example.com'; -- CHANGE THIS
  admin_name  text := 'Order2Me Admin';     -- CHANGE THIS IF NEEDED
  auth_id     uuid;
BEGIN
  SELECT id INTO auth_id
  FROM auth.users
  WHERE lower(email) = lower(admin_email)
  LIMIT 1;

  IF auth_id IS NULL THEN
    RAISE EXCEPTION 'No Supabase Auth user found for %. Create it in Authentication > Users first.', admin_email;
  END IF;

  INSERT INTO public.users (auth_user_id, name, email, role)
  VALUES (auth_id, admin_name, admin_email, 'admin')
  ON CONFLICT (email) DO UPDATE
  SET auth_user_id = EXCLUDED.auth_user_id,
      name = EXCLUDED.name,
      role = 'admin';
END;
$$;

SELECT id, auth_user_id, name, email, role
FROM public.users
WHERE role = 'admin';

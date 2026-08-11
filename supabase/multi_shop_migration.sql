-- ============================================================
-- Order2Me Multi-Shop + Admin Approval Migration
-- Run once in Supabase Dashboard > SQL Editor.
-- Safe to rerun: objects and policies are created idempotently.
-- ============================================================

BEGIN;

-- 1. Add the admin role to existing profiles.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('customer', 'owner', 'admin'));

-- 2. Shops. An owner can register one shop; more owners can register
--    additional shops. Only approved shops are public to customers.
CREATE TABLE IF NOT EXISTS public.shops (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id         bigint UNIQUE REFERENCES public.users(id) ON DELETE SET NULL,
  name             text NOT NULL,
  slug             text NOT NULL UNIQUE,
  description      text,
  address          text,
  phone_number     text,
  logo_url         text,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  rejection_reason text,
  approved_by      bigint REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shops_status ON public.shops(status);
CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON public.shops(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.shops_id_seq TO authenticated;

-- 3. Preserve the existing single-shop data under a default approved shop.
INSERT INTO public.shops (name, slug, description, status)
SELECT 'Main Canteen', 'main-canteen', 'Original Order2Me canteen', 'approved'
WHERE NOT EXISTS (SELECT 1 FROM public.shops)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.shops AS s
SET owner_id = owner_profile.id,
    phone_number = COALESCE(s.phone_number, owner_profile.phone_number),
    updated_at = now()
FROM (
  SELECT id, phone_number
  FROM public.users
  WHERE role = 'owner'
  ORDER BY id
  LIMIT 1
) AS owner_profile
WHERE s.slug = 'main-canteen'
  AND s.owner_id IS NULL;

-- 4. Every menu item and order belongs to exactly one shop.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS shop_id bigint;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shop_id bigint;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS screenshot_path text;
NOTIFY pgrst, 'reload schema';

UPDATE public.menu_items
SET shop_id = (SELECT id FROM public.shops ORDER BY id LIMIT 1)
WHERE shop_id IS NULL;

UPDATE public.orders
SET shop_id = (SELECT id FROM public.shops ORDER BY id LIMIT 1)
WHERE shop_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_menu_items_shop'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT fk_menu_items_shop
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_shop'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_shop
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.menu_items ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN shop_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_menu_items_shop_id ON public.menu_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON public.orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop_created_at ON public.orders(shop_id, created_at DESC);

-- 5. Shared updated_at trigger.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shops_updated_at ON public.shops;
CREATE TRIGGER trg_shops_updated_at
BEFORE UPDATE ON public.shops
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Owners may edit public shop details, but approval fields are controlled
-- exclusively by admins. SQL Editor/service-role maintenance remains possible.
CREATE OR REPLACE FUNCTION public.protect_shop_control_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.owner_id := OLD.owner_id;
    NEW.status := OLD.status;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_shop_control_fields ON public.shops;
CREATE TRIGGER trg_protect_shop_control_fields
BEFORE UPDATE ON public.shops
FOR EACH ROW EXECUTE FUNCTION public.protect_shop_control_fields();

-- 6. Security helper functions. SECURITY DEFINER prevents recursive RLS
--    checks while still deriving identity exclusively from auth.uid().
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(public.current_profile_role() = 'admin', false);
$$;

CREATE OR REPLACE FUNCTION public.owns_approved_shop(target_shop_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops
    WHERE id = target_shop_id
      AND owner_id = public.current_profile_id()
      AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.owner_can_view_customer(target_customer_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.shops s ON s.id = o.shop_id
    WHERE o.customer_id = target_customer_id
      AND s.owner_id = public.current_profile_id()
      AND s.status = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_approved_shop(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_can_view_customer(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_approved_shop(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_can_view_customer(bigint) TO authenticated;

-- Protect order ownership and totals, and enforce the owner workflow even
-- when somebody bypasses the UI and calls the REST endpoint directly.
CREATE OR REPLACE FUNCTION public.enforce_order_update_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.customer_id := OLD.customer_id;
    NEW.customer_name := OLD.customer_name;
    NEW.shop_id := OLD.shop_id;
    NEW.total_amount := OLD.total_amount;
    NEW.delivery_note := OLD.delivery_note;
    NEW.created_at := OLD.created_at;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'pending'   AND NEW.status IN ('preparing', 'cancelled')) OR
      (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled')) OR
      (OLD.status = 'ready'     AND NEW.status = 'delivered')
    ) THEN
      RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_update_rules ON public.orders;
CREATE TRIGGER trg_enforce_order_update_rules
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_update_rules();

-- Prevent users from promoting themselves through the REST API. Remove the
-- broad table-level UPDATE grant first, then allow only editable profile fields.
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (name, email, phone_number) ON public.users TO authenticated;

-- 7. Replace users policies.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated user select own profile" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated user insert own profile" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated user update own profile" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated user delete own profile" ON public.users;
DROP POLICY IF EXISTS "Allow anon insert customer profile" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to read owner phone" ON public.users;
DROP POLICY IF EXISTS "Allow owner to read all customers" ON public.users;
DROP POLICY IF EXISTS "Users read own profile" ON public.users;
DROP POLICY IF EXISTS "Users create safe own profile" ON public.users;
DROP POLICY IF EXISTS "Users update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins read all profiles" ON public.users;
DROP POLICY IF EXISTS "Owners read their customers" ON public.users;

CREATE POLICY "Users read own profile"
ON public.users FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

CREATE POLICY "Users create safe own profile"
ON public.users FOR INSERT TO authenticated
WITH CHECK (
  auth_user_id = auth.uid()
  AND role IN ('customer', 'owner')
);

CREATE POLICY "Users update own profile"
ON public.users FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Admins read all profiles"
ON public.users FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Owners read their customers"
ON public.users FOR SELECT TO authenticated
USING (
  role = 'customer'
  AND public.owner_can_view_customer(id)
);

-- 8. Shops policies.
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read approved or related shops" ON public.shops;
DROP POLICY IF EXISTS "Owners submit own shop" ON public.shops;
DROP POLICY IF EXISTS "Owners update pending own shop" ON public.shops;
DROP POLICY IF EXISTS "Admins manage shops" ON public.shops;

CREATE POLICY "Authenticated read approved or related shops"
ON public.shops FOR SELECT TO authenticated
USING (
  status = 'approved'
  OR owner_id = public.current_profile_id()
  OR public.is_admin()
);

CREATE POLICY "Owners submit own shop"
ON public.shops FOR INSERT TO authenticated
WITH CHECK (
  public.current_profile_role() = 'owner'
  AND owner_id = public.current_profile_id()
  AND status = 'pending'
  AND approved_by IS NULL
  AND approved_at IS NULL
);

CREATE POLICY "Owners update pending own shop"
ON public.shops FOR UPDATE TO authenticated
USING (owner_id = public.current_profile_id())
WITH CHECK (owner_id = public.current_profile_id());

CREATE POLICY "Admins manage shops"
ON public.shops FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 9. Menu policies: approved public catalogue, isolated owner writes.
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read approved menus" ON public.menu_items;
DROP POLICY IF EXISTS "Approved owners create menu" ON public.menu_items;
DROP POLICY IF EXISTS "Approved owners update menu" ON public.menu_items;
DROP POLICY IF EXISTS "Approved owners delete menu" ON public.menu_items;
DROP POLICY IF EXISTS "Admins manage all menus" ON public.menu_items;

CREATE POLICY "Authenticated read approved menus"
ON public.menu_items FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.shops s WHERE s.id = shop_id AND s.status = 'approved')
  OR public.is_admin()
);

CREATE POLICY "Approved owners create menu"
ON public.menu_items FOR INSERT TO authenticated
WITH CHECK (public.owns_approved_shop(shop_id));

CREATE POLICY "Approved owners update menu"
ON public.menu_items FOR UPDATE TO authenticated
USING (public.owns_approved_shop(shop_id))
WITH CHECK (public.owns_approved_shop(shop_id));

CREATE POLICY "Approved owners delete menu"
ON public.menu_items FOR DELETE TO authenticated
USING (public.owns_approved_shop(shop_id));

CREATE POLICY "Admins manage all menus"
ON public.menu_items FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 10. Order policies: customers own their orders; approved owners are
--     restricted to their shop; admins can audit everything.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Owners can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Owners can update order status" ON public.orders;
DROP POLICY IF EXISTS "Customers create orders at approved shops" ON public.orders;
DROP POLICY IF EXISTS "Customers read own orders" ON public.orders;
DROP POLICY IF EXISTS "Approved owners read shop orders" ON public.orders;
DROP POLICY IF EXISTS "Approved owners update shop orders" ON public.orders;
DROP POLICY IF EXISTS "Admins manage all orders" ON public.orders;

CREATE POLICY "Customers create orders at approved shops"
ON public.orders FOR INSERT TO authenticated
WITH CHECK (
  customer_id = public.current_profile_id()
  AND public.current_profile_role() = 'customer'
  AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = shop_id AND s.status = 'approved')
);

CREATE POLICY "Customers read own orders"
ON public.orders FOR SELECT TO authenticated
USING (customer_id = public.current_profile_id());

CREATE POLICY "Approved owners read shop orders"
ON public.orders FOR SELECT TO authenticated
USING (public.owns_approved_shop(shop_id));

CREATE POLICY "Approved owners update shop orders"
ON public.orders FOR UPDATE TO authenticated
USING (public.owns_approved_shop(shop_id))
WITH CHECK (public.owns_approved_shop(shop_id));

CREATE POLICY "Admins manage all orders"
ON public.orders FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 11. Order item policies inherit access from the parent order and enforce
--     that every selected menu item belongs to the same shop as the order.
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Customers create own order items" ON public.order_items;
DROP POLICY IF EXISTS "Users read permitted order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins manage all order items" ON public.order_items;

CREATE POLICY "Customers create own order items"
ON public.order_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.menu_items m ON m.id = menu_item_id
    WHERE o.id = order_id
      AND o.customer_id = public.current_profile_id()
      AND o.shop_id = m.shop_id
  )
);

CREATE POLICY "Users read permitted order items"
ON public.order_items FOR SELECT TO authenticated
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

CREATE POLICY "Admins manage all order items"
ON public.order_items FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 12. Payment policies inherit order access.
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
    WHERE o.id = order_id AND o.customer_id = public.current_profile_id()
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

-- 13. Storage writes use a shop-id first folder (for example 12/menu_1.png).
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Owner can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Owner can update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public can view screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users read permitted payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Approved owners upload own shop menu images" ON storage.objects;
DROP POLICY IF EXISTS "Approved owners update own shop menu images" ON storage.objects;
DROP POLICY IF EXISTS "Customers can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Customers upload approved shop payment screenshots" ON storage.objects;

CREATE POLICY "Approved owners upload own shop menu images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'menu-images'
  AND (storage.foldername(name))[1] ~ '^[0-9]+$'
  AND public.owns_approved_shop(((storage.foldername(name))[1])::bigint)
);

CREATE POLICY "Approved owners update own shop menu images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'menu-images'
  AND (storage.foldername(name))[1] ~ '^[0-9]+$'
  AND public.owns_approved_shop(((storage.foldername(name))[1])::bigint)
)
WITH CHECK (
  bucket_id = 'menu-images'
  AND (storage.foldername(name))[1] ~ '^[0-9]+$'
  AND public.owns_approved_shop(((storage.foldername(name))[1])::bigint)
);

CREATE POLICY "Customers upload approved shop payment screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-screenshots'
  AND public.current_profile_role() = 'customer'
  AND (storage.foldername(name))[1] ~ '^[0-9]+$'
  AND (storage.foldername(name))[2] ~ '^[0-9]+$'
  AND ((storage.foldername(name))[2])::bigint = public.current_profile_id()
  AND EXISTS (
    SELECT 1 FROM public.shops s
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

-- 14. Realtime events for shop approval and order updates.
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.shops REPLICA IDENTITY FULL;
ALTER TABLE public.users REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shops'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shops;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END;
$$;

COMMIT;

-- Optional verification after COMMIT:
-- SELECT id, name, status, owner_id FROM public.shops ORDER BY id;
-- SELECT id, role, email FROM public.users ORDER BY id;

-- Order2Me: owner marks an order sent; customer confirms it was received.
-- Run after multi_shop_migration.sql in Supabase SQL Editor.

BEGIN;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.orders TO authenticated;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'preparing',
    'ready',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ));

CREATE OR REPLACE FUNCTION public.enforce_order_update_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor_role text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    actor_role := public.current_profile_role();

    NEW.customer_id := OLD.customer_id;
    NEW.customer_name := OLD.customer_name;
    NEW.shop_id := OLD.shop_id;
    NEW.total_amount := OLD.total_amount;
    NEW.delivery_note := OLD.delivery_note;
    NEW.created_at := OLD.created_at;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF actor_role = 'owner' THEN
        IF NOT (
          (OLD.status = 'pending' AND NEW.status IN ('preparing', 'cancelled')) OR
          (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled')) OR
          (OLD.status = 'ready' AND NEW.status = 'out_for_delivery')
        ) THEN
          RAISE EXCEPTION 'Owner cannot change order status from % to %', OLD.status, NEW.status
            USING ERRCODE = '42501';
        END IF;
      ELSIF actor_role = 'customer' THEN
        IF OLD.customer_id <> public.current_profile_id()
           OR OLD.status <> 'out_for_delivery'
           OR NEW.status <> 'delivered' THEN
          RAISE EXCEPTION 'Customer can only confirm receipt of their own sent order'
            USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'This role cannot update order status'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_update_rules ON public.orders;
CREATE TRIGGER trg_enforce_order_update_rules
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_update_rules();

DROP POLICY IF EXISTS "Customers confirm received own orders" ON public.orders;
CREATE POLICY "Customers confirm received own orders"
ON public.orders FOR UPDATE TO authenticated
USING (
  customer_id = public.current_profile_id()
  AND status = 'out_for_delivery'
)
WITH CHECK (
  customer_id = public.current_profile_id()
  AND status = 'delivered'
);

ALTER TABLE public.orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END;
$$;

COMMIT;

-- Verification: out_for_delivery must appear in the constraint definition.
SELECT pg_get_constraintdef(oid) AS orders_status_constraint
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass
  AND conname = 'orders_status_check';

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'orders'
  AND policyname = 'Customers confirm received own orders';

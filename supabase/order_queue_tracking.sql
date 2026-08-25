-- Order2Me: queue and estimated-arrival tracking
-- Run after customer_received_confirmation.sql.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_shop_active_queue
  ON public.orders (shop_id, created_at)
  WHERE status IN ('pending', 'preparing', 'ready');

CREATE OR REPLACE FUNCTION public.enforce_order_update_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE actor_role text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    actor_role := public.current_profile_role();
    NEW.customer_id := OLD.customer_id;
    NEW.customer_name := OLD.customer_name;
    NEW.shop_id := OLD.shop_id;
    NEW.total_amount := OLD.total_amount;
    NEW.delivery_note := OLD.delivery_note;
    NEW.created_at := OLD.created_at;

    IF actor_role = 'owner' THEN
      IF NOT EXISTS (SELECT 1 FROM public.shops s WHERE s.id = OLD.shop_id AND s.owner_id = public.current_profile_id()) THEN
        RAISE EXCEPTION 'Owner cannot update another shop order' USING ERRCODE = '42501';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'pending' AND NEW.status IN ('preparing', 'cancelled')) OR
        (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled')) OR
        (OLD.status = 'ready' AND NEW.status = 'out_for_delivery')
      ) THEN
        RAISE EXCEPTION 'Owner cannot change order status from % to %', OLD.status, NEW.status USING ERRCODE = '42501';
      END IF;
    ELSIF actor_role = 'customer' THEN
      NEW.estimated_delivery_at := OLD.estimated_delivery_at;
      NEW.accepted_at := OLD.accepted_at;
      NEW.ready_at := OLD.ready_at;
      NEW.sent_at := OLD.sent_at;
      IF OLD.customer_id <> public.current_profile_id() OR OLD.status <> 'out_for_delivery' OR NEW.status <> 'delivered' THEN
        RAISE EXCEPTION 'Customer can only confirm receipt of their own sent order' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'This role cannot update order status' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_update_rules ON public.orders;
CREATE TRIGGER trg_enforce_order_update_rules BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_update_rules();
ALTER TABLE public.orders REPLICA IDENTITY FULL;
COMMIT;

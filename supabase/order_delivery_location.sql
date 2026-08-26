-- Order2Me UCSY delivery-map coordinates
-- Run after the base orders table and multi_shop_migration.sql.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_customer_client_request_unique
  ON public.orders (customer_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_lat_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_lng_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_lat_check
  CHECK (delivery_lat IS NULL OR delivery_lat BETWEEN -90 AND 90);
ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_lng_check
  CHECK (delivery_lng IS NULL OR delivery_lng BETWEEN -180 AND 180);

CREATE OR REPLACE FUNCTION public.protect_order_delivery_location()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.delivery_lat:=OLD.delivery_lat;
    NEW.delivery_lng:=OLD.delivery_lng;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_order_delivery_location ON public.orders;
CREATE TRIGGER trg_protect_order_delivery_location BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.protect_order_delivery_location();

NOTIFY pgrst, 'reload schema';
COMMIT;

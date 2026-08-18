-- Remove the abandoned Web Push experiment. Realtime + polling now provide
-- order updates without an Edge Function backend.
DROP TRIGGER IF EXISTS trg_orders_web_push ON public.orders;
DROP FUNCTION IF EXISTS public.send_order_web_push();
DROP TABLE IF EXISTS public.push_subscriptions;

-- ============================================================
-- Order2Me: accept only KBZPay and WavePay for new payments.
-- Run once in Supabase Dashboard > SQL Editor.
--
-- NOT VALID preserves historical Cash records while PostgreSQL enforces
-- this constraint for every new insert or update.
-- ============================================================

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_digital_method_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_digital_method_check
  CHECK (payment_method IN ('KBZPay', 'WavePay')) NOT VALID;


-- Require a usable phone number for every newly-created Order2Me profile.
-- NOT VALID preserves old rows that may not have a phone, while enforcing new inserts/updates.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_phone_number_required;
ALTER TABLE public.users ADD CONSTRAINT users_phone_number_required
  CHECK (phone_number IS NOT NULL AND length(trim(phone_number)) >= 7) NOT VALID;

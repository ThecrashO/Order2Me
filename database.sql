-- ============================================================
-- Order2Me - Supabase Database Schema
-- Existing projects: run supabase/multi_shop_migration.sql after this file.
-- University Canteen Digital Ordering System
-- ============================================================
-- This file reflects the ACTUAL tables created in Supabase.
-- Use it as the source of truth for the database structure.
-- NOTE: Authentication is handled by Supabase Auth (no password column).
-- ============================================================


-- ============================================================
-- 1. USERS TABLE
-- Stores customer and owner profile data.
-- Authentication (login/signup) is handled by Supabase Auth.
-- ============================================================
CREATE TABLE public.users (
  id             bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  auth_user_id   uuid        UNIQUE,
  name           text        NOT NULL,
  email          text        NOT NULL UNIQUE,
  phone_number   text        UNIQUE,
  role           text        NOT NULL CHECK (role = ANY (ARRAY['customer'::text, 'owner'::text])),
  created_at     timestamp   WITHOUT TIME ZONE DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);


-- ============================================================
-- 2. MENU ITEMS TABLE
-- Stores food items managed by the canteen owner.
-- ============================================================
CREATE TABLE public.menu_items (
  id           bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name         text    NOT NULL,
  description  text,
  price        numeric NOT NULL,
  image_url    text,
  is_available boolean DEFAULT true,
  created_at   timestamp WITHOUT TIME ZONE DEFAULT now(),
  CONSTRAINT menu_items_pkey PRIMARY KEY (id)
);


-- ============================================================
-- 3. ORDERS TABLE
-- Stores each order placed by a customer.
--
-- Status flow:
--   pending -> preparing -> ready -> out_for_delivery -> delivered
-- ============================================================
CREATE TABLE public.orders (
  id            bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  customer_id    bigint  NOT NULL,
  customer_name  text,                               -- denormalised for quick display
  delivery_note text,
  total_amount  numeric NOT NULL,
  status        text    DEFAULT 'pending'::text
                        CHECK (status = ANY (ARRAY[
                            'pending'::text,
                            'preparing'::text,
                            'ready'::text,
                            'out_for_delivery'::text,
                            'delivered'::text
                        ])),
  created_at    timestamp WITHOUT TIME ZONE DEFAULT now(),
  CONSTRAINT orders_pkey    PRIMARY KEY (id),
  CONSTRAINT fk_customer     FOREIGN KEY (customer_id) REFERENCES public.users(id)
);


-- ============================================================
-- 4. ORDER ITEMS TABLE
-- Stores individual food lines inside each order.
-- ============================================================
CREATE TABLE public.order_items (
  id           bigint  GENERATED ALWAYS AS IDENTITY NOT NULL,
  order_id     bigint  NOT NULL,
  menu_item_id bigint  NOT NULL,
  quantity     integer NOT NULL DEFAULT 1,
  price        numeric NOT NULL,               -- price captured at time of order
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT fk_order         FOREIGN KEY (order_id)     REFERENCES public.orders(id),
  CONSTRAINT fk_menu          FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id)
);


-- ============================================================
-- 5. PAYMENTS TABLE
-- Stores payment info for each order (1-to-1 relationship).
-- screenshot_url is null for Cash payments.
-- ============================================================
CREATE TABLE public.payments (
  id              bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  order_id        bigint NOT NULL UNIQUE,
  payment_method  text   NOT NULL CHECK (payment_method = ANY (ARRAY[
                      'KBZPay'::text,
                      'WavePay'::text,
                      'Cash'::text
                  ])),
  screenshot_url  text,
  screenshot_path text,
  created_at      timestamp WITHOUT TIME ZONE DEFAULT now(),
  CONSTRAINT payments_pkey       PRIMARY KEY (id),
  CONSTRAINT fk_payment_order    FOREIGN KEY (order_id) REFERENCES public.orders(id)
);


-- ============================================================
-- DATABASE RELATIONSHIPS SUMMARY
-- ============================================================
--
--  users           1 ──< orders          (customer_id -> users.id)
--  orders          1 ──< order_items     (order_id   -> orders.id)
--  menu_items      1 ──< order_items     (menu_item_id -> menu_items.id)
--  orders          1 ──1 payments        (order_id   -> orders.id, UNIQUE)
--
-- ============================================================


-- ============================================================
-- ORDER STATUS FLOW
-- ============================================================
--
--   pending
--     |
--     v
--   preparing
--     |
--     v
--   ready
--     |
--     v
--   out_for_delivery
--     |
--     v
--   delivered
--
-- ============================================================


-- ============================================================
-- PAYMENT METHODS
-- ============================================================
--
--   KBZPay   -> screenshot_url required
--   WavePay  -> screenshot_url required
--   Cash     -> screenshot_url optional / null
--
-- ============================================================-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow authenticated user select own profile"
ON public.users
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND auth.uid() = auth_user_id
);

CREATE POLICY IF NOT EXISTS "Allow authenticated user insert own profile"
ON public.users
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND auth.uid() = auth_user_id
);

CREATE POLICY IF NOT EXISTS "Allow authenticated user update own profile"
ON public.users
FOR UPDATE
USING (
  auth.role() = 'authenticated'
  AND auth.uid() = auth_user_id
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND auth.uid() = auth_user_id
);

CREATE POLICY IF NOT EXISTS "Allow authenticated user delete own profile"
ON public.users
FOR DELETE
USING (
  auth.role() = 'authenticated'
  AND auth.uid() = auth_user_id
);

CREATE POLICY IF NOT EXISTS "Allow anon insert customer profile"
ON public.users
FOR INSERT
WITH CHECK (
  auth.role() = 'anon'
  AND role = 'customer'
  AND auth_user_id IS NOT NULL
);

-- ============================================================
-- Allow any authenticated user to read the owner's phone number
-- (needed by the customer page to display KBZPay / WavePay numbers)
-- Run this in your Supabase SQL editor if not already applied.
-- ============================================================

DROP POLICY IF EXISTS "Allow authenticated users to read owner phone" ON public.users;

CREATE POLICY "Allow authenticated users to read owner phone"
ON public.users
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND role = 'owner'
);

-- ============================================================

-- ============================================================
-- Allow owner to read ALL customer profiles
-- Required for the Owner Dashboard > Customers panel.
-- Run this in your Supabase SQL editor.
-- ============================================================

DROP POLICY IF EXISTS "Allow owner to read all customers" ON public.users;

CREATE POLICY "Allow owner to read all customers"
ON public.users
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1
    FROM public.users AS me
    WHERE me.auth_user_id = auth.uid()
      AND me.role = 'owner'
  )
);

-- ============================================================

-- ============================================================
-- Payments Table RLS Policies
-- Customers must be able to INSERT payment records after ordering.
-- Run these in Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can insert payments" ON public.payments;
CREATE POLICY "Customers can insert payments"
ON public.payments
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Customers can view own payments" ON public.payments;
CREATE POLICY "Customers can view own payments"
ON public.payments
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Owners can view all payments" ON public.payments;
CREATE POLICY "Owners can view all payments"
ON public.payments
FOR SELECT
USING (auth.role() = 'authenticated');

-- 8. Realtime: publish order inserts and status updates.
-- Safe to run more than once in the Supabase SQL Editor.
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

-- Include the previous status in UPDATE events so clients can ignore
-- duplicate events and alert only when the status actually changes.
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- ============================================================
-- Storage: payment-screenshots bucket policies
-- Create the bucket first in Supabase Dashboard > Storage,
-- then run these policies.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
CREATE POLICY "Authenticated users can upload screenshots"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-screenshots'
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Public can view screenshots" ON storage.objects;
CREATE POLICY "Public can view screenshots"
ON storage.objects
FOR SELECT
USING (bucket_id = 'payment-screenshots');

-- ============================================================

-- ============================================================
-- Storage: menu-images bucket policies
-- 1. Create the bucket in Supabase Dashboard > Storage
--    Name it exactly: menu-images  (set to Public)
-- 2. Run these policies in the Supabase SQL Editor.
-- ============================================================

DROP POLICY IF EXISTS "Owner can upload menu images" ON storage.objects;
CREATE POLICY "Owner can upload menu images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'menu-images'
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Owner can update menu images" ON storage.objects;
CREATE POLICY "Owner can update menu images"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'menu-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public can view menu images" ON storage.objects;
CREATE POLICY "Public can view menu images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'menu-images');

-- ============================================================


-- ============================================================
-- MIGRATION: Add 'cancelled' status + updated_at to orders
-- Run this in Supabase SQL Editor ONCE.
-- ============================================================

-- 1. Add updated_at column with auto-update trigger
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamp WITHOUT TIME ZONE DEFAULT now();

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Replace CHECK constraint to include 'cancelled'
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'preparing'::text,
    'ready'::text,
    'out_for_delivery'::text,
    'delivered'::text,
    'cancelled'::text
  ]));

-- 3. RLS: customers can INSERT their own orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can insert own orders" ON public.orders;
CREATE POLICY "Customers can insert own orders"
ON public.orders FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND customer_id = (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()
  )
);

-- 4. RLS: customers can SELECT their own orders
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
CREATE POLICY "Customers can view own orders"
ON public.orders FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND customer_id = (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()
  )
);

-- 5. RLS: owners can SELECT all orders
DROP POLICY IF EXISTS "Owners can view all orders" ON public.orders;
CREATE POLICY "Owners can view all orders"
ON public.orders FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.users AS me
    WHERE me.auth_user_id = auth.uid() AND me.role = 'owner'
  )
);

-- 6. RLS: owners can UPDATE order status
DROP POLICY IF EXISTS "Owners can update order status" ON public.orders;
CREATE POLICY "Owners can update order status"
ON public.orders FOR UPDATE
USING (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.users AS me
    WHERE me.auth_user_id = auth.uid() AND me.role = 'owner'
  )
);

-- 7. RLS: allow order_items INSERT for authenticated
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can insert order items" ON public.order_items;
CREATE POLICY "Customers can insert order items"
ON public.order_items FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view order items" ON public.order_items;
CREATE POLICY "Authenticated can view order items"
ON public.order_items FOR SELECT
USING (auth.role() = 'authenticated');

-- ============================================================

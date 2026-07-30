-- ============================================================
-- Order2Me - Supabase Database Schema
-- University Canteen Digital Ordering System
-- ============================================================
-- This file reflects the ACTUAL tables created in Supabase.
-- Use it as the source of truth for the database structure.
-- NOTE: Authentication is handled by Supabase Auth (no password column).
-- ============================================================


-- ============================================================
-- 1. USERS TABLE
-- Stores student and owner profile data.
-- Authentication (login/signup) is handled by Supabase Auth.
-- ============================================================
CREATE TABLE public.users (
  id             bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  auth_user_id   uuid        UNIQUE,
  name           text        NOT NULL,
  email          text        NOT NULL UNIQUE,
  phone_number   text        UNIQUE,
  role           text        NOT NULL CHECK (role = ANY (ARRAY['student'::text, 'owner'::text])),
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
-- Stores each order placed by a student.
--
-- Status flow:
--   pending -> preparing -> ready -> delivered
-- ============================================================
CREATE TABLE public.orders (
  id            bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  student_id    bigint  NOT NULL,
  student_name  text,                               -- denormalised for quick display
  delivery_note text,
  total_amount  numeric NOT NULL,
  status        text    DEFAULT 'pending'::text
                        CHECK (status = ANY (ARRAY[
                            'pending'::text,
                            'preparing'::text,
                            'ready'::text,
                            'delivered'::text
                        ])),
  created_at    timestamp WITHOUT TIME ZONE DEFAULT now(),
  CONSTRAINT orders_pkey    PRIMARY KEY (id),
  CONSTRAINT fk_student     FOREIGN KEY (student_id) REFERENCES public.users(id)
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
  created_at      timestamp WITHOUT TIME ZONE DEFAULT now(),
  CONSTRAINT payments_pkey       PRIMARY KEY (id),
  CONSTRAINT fk_payment_order    FOREIGN KEY (order_id) REFERENCES public.orders(id)
);


-- ============================================================
-- DATABASE RELATIONSHIPS SUMMARY
-- ============================================================
--
--  users           1 ──< orders          (student_id -> users.id)
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

CREATE POLICY IF NOT EXISTS "Allow anon insert student profile"
ON public.users
FOR INSERT
WITH CHECK (
  auth.role() = 'anon'
  AND role = 'student'
  AND auth_user_id IS NOT NULL
);

-- ============================================================
-- Allow any authenticated user to read the owner's phone number
-- (needed by the student page to display KBZPay / WavePay numbers)
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

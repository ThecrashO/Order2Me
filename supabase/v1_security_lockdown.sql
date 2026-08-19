-- ============================================================
-- Order2Me v1.0.0 release security lockdown
-- Run once in Supabase Dashboard > SQL Editor after all other migrations.
--
-- The application requires a confirmed Supabase Auth session before any
-- profile, shop, menu, order, order item, or payment data is read/written.
-- RLS remains the per-user/per-shop authorization layer. These explicit
-- revokes add a second boundary so stale legacy policies cannot expose core
-- records to unauthenticated (anon) REST requests.
-- ============================================================

BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.users       FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.shops       FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.menu_items  FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.orders      FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.order_items FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.payments    FROM anon;

ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments    ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verification (run while signed out or with only the publishable key):
-- GET /rest/v1/users?select=id&limit=1       -> 401/403 or []
-- GET /rest/v1/orders?select=id&limit=1      -> 401/403 or []
-- GET /rest/v1/order_items?select=id&limit=1 -> 401/403 or []

-- Order2Me Admin Control Center
-- Run after multi_shop_migration.sql, order_feedback.sql and
-- admin_users_notifications_screenshot_patch.sql.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('active', 'suspended'));

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS admin_force_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_close_reason text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by bigint REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_hidden_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_reason text;

ALTER TABLE public.order_feedback
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS moderation_reason text;

ALTER TABLE public.order_feedback DROP CONSTRAINT IF EXISTS order_feedback_moderation_status_check;
ALTER TABLE public.order_feedback ADD CONSTRAINT order_feedback_moderation_status_check
  CHECK (moderation_status IN ('visible', 'hidden'));

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_profile_id bigint NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON public.admin_audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.announcements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'customers', 'owners')),
  target_user_id bigint REFERENCES public.users(id) ON DELETE CASCADE,
  target_shop_id bigint REFERENCES public.shops(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by bigint NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  announcement_id bigint NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT false,
  updated_by bigint REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, value, description, is_public) VALUES
  ('ordering_enabled', 'true', 'Allow customers to place new orders', true),
  ('maintenance_mode', 'false', 'Display maintenance state and pause normal operations', true),
  ('owner_signup_enabled', 'true', 'Allow new owner registrations', true),
  ('feedback_enabled', 'true', 'Allow delivered-order feedback', true),
  ('maximum_order_amount', '500000', 'Maximum accepted order total in MMK', true),
  ('default_preparation_minutes', '15', 'Default preparation estimate', true)
ON CONFLICT (key) DO NOTHING;

-- Suspended identities resolve to NULL in all existing ownership policies.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.users
  WHERE auth_user_id = auth.uid()
    AND (account_status = 'active' OR (suspended_until IS NOT NULL AND suspended_until <= now()))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_actor_id()
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor bigint;
BEGIN
  SELECT id INTO actor FROM public.users
  WHERE auth_user_id = auth.uid() AND role = 'admin' AND account_status = 'active';
  IF actor IS NULL THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  RETURN actor;
END;
$$;

-- Prevent non-admin REST updates from changing administrative control fields.
CREATE OR REPLACE FUNCTION public.protect_shop_control_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.owner_id:=OLD.owner_id; NEW.status:=OLD.status; NEW.rejection_reason:=OLD.rejection_reason;
    NEW.approved_by:=OLD.approved_by; NEW.approved_at:=OLD.approved_at;
    NEW.admin_force_closed:=OLD.admin_force_closed; NEW.admin_close_reason:=OLD.admin_close_reason;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_menu_admin_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.is_hidden_by_admin:=OLD.is_hidden_by_admin; NEW.moderation_reason:=OLD.moderation_reason;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_menu_admin_fields ON public.menu_items;
CREATE TRIGGER trg_protect_menu_admin_fields BEFORE UPDATE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.protect_menu_admin_fields();

CREATE OR REPLACE FUNCTION public.protect_feedback_admin_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.moderation_status:=OLD.moderation_status; NEW.moderation_reason:=OLD.moderation_reason;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_feedback_admin_fields ON public.order_feedback;
CREATE TRIGGER trg_protect_feedback_admin_fields BEFORE UPDATE ON public.order_feedback
FOR EACH ROW EXECUTE FUNCTION public.protect_feedback_admin_fields();

CREATE OR REPLACE FUNCTION public.shop_accepts_orders(target_shop_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT value = 'true'::jsonb FROM public.system_settings WHERE key='ordering_enabled'), true)
    AND EXISTS (
      SELECT 1 FROM public.shops s
      CROSS JOIN LATERAL (SELECT (timezone('Asia/Yangon',now()))::date local_date,
        (timezone('Asia/Yangon',now()))::time local_time) clock
      WHERE s.id=target_shop_id AND s.status='approved' AND s.is_open AND NOT s.admin_force_closed
        AND (s.accepting_orders OR s.accepting_orders_date <> clock.local_date)
        AND (s.opening_time=s.closing_time OR
          (s.opening_time<s.closing_time AND clock.local_time>=s.opening_time AND clock.local_time<s.closing_time) OR
          (s.opening_time>s.closing_time AND (clock.local_time>=s.opening_time OR clock.local_time<s.closing_time)))
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_log_action(
  p_action text, p_entity_type text, p_entity_id text,
  p_old jsonb, p_new jsonb, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.admin_audit_logs
    (admin_profile_id, action, entity_type, entity_id, old_values, new_values, reason)
  VALUES (public.admin_actor_id(), p_action, p_entity_type, p_entity_id, p_old, p_new, nullif(trim(p_reason), ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_suspension(
  p_user_id bigint, p_suspended boolean, p_reason text DEFAULT NULL, p_until timestamptz DEFAULT NULL
) RETURNS public.users LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_row public.users; new_row public.users; actor bigint := public.admin_actor_id();
BEGIN
  SELECT * INTO old_row FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF old_row.id = actor OR old_row.role = 'admin' THEN RAISE EXCEPTION 'Administrator accounts cannot be suspended here'; END IF;
  IF p_suspended AND nullif(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Suspension reason is required'; END IF;
  UPDATE public.users SET account_status = CASE WHEN p_suspended THEN 'suspended' ELSE 'active' END,
    suspension_reason = CASE WHEN p_suspended THEN trim(p_reason) ELSE NULL END,
    suspended_until = CASE WHEN p_suspended THEN p_until ELSE NULL END
  WHERE id = p_user_id RETURNING * INTO new_row;
  PERFORM public.admin_log_action(CASE WHEN p_suspended THEN 'USER_SUSPENDED' ELSE 'USER_UNSUSPENDED' END,
    'user', p_user_id::text, to_jsonb(old_row), to_jsonb(new_row), p_reason);
  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_control_shop(
  p_shop_id bigint, p_status text DEFAULT NULL, p_force_closed boolean DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS public.shops LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_row public.shops; new_row public.shops; actor bigint := public.admin_actor_id();
BEGIN
  SELECT * INTO old_row FROM public.shops WHERE id = p_shop_id FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Shop not found'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','approved','rejected','suspended') THEN RAISE EXCEPTION 'Invalid shop status'; END IF;
  IF ((p_status IN ('rejected','suspended')) OR p_force_closed = true) AND nullif(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  UPDATE public.shops SET
    status = COALESCE(p_status, status),
    rejection_reason = CASE WHEN p_status IN ('rejected','suspended') THEN trim(p_reason) WHEN p_status = 'approved' THEN NULL ELSE rejection_reason END,
    approved_by = CASE WHEN p_status = 'approved' THEN actor ELSE approved_by END,
    approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
    admin_force_closed = COALESCE(p_force_closed, admin_force_closed),
    admin_close_reason = CASE WHEN p_force_closed = true THEN trim(p_reason) WHEN p_force_closed = false THEN NULL ELSE admin_close_reason END
  WHERE id = p_shop_id RETURNING * INTO new_row;
  PERFORM public.admin_log_action(
    CASE
      WHEN p_force_closed=true THEN 'SHOP_FORCE_CLOSED'
      WHEN p_force_closed=false THEN 'SHOP_FORCE_REOPENED'
      WHEN p_status='approved' THEN 'SHOP_APPROVED'
      WHEN p_status='rejected' THEN 'SHOP_REJECTED'
      WHEN p_status='suspended' THEN 'SHOP_SUSPENDED'
      ELSE 'SHOP_CONTROL_UPDATED'
    END, 'shop', p_shop_id::text,
    to_jsonb(old_row), to_jsonb(new_row), p_reason);
  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_order(p_order_id bigint, p_reason text)
RETURNS public.orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_row public.orders; new_row public.orders; actor bigint := public.admin_actor_id();
BEGIN
  IF nullif(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Cancellation reason is required'; END IF;
  SELECT * INTO old_row FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF old_row.status IN ('delivered','cancelled') THEN RAISE EXCEPTION 'Completed orders cannot be cancelled'; END IF;
  UPDATE public.orders SET status='cancelled', cancellation_reason=trim(p_reason), cancelled_by=actor
  WHERE id=p_order_id RETURNING * INTO new_row;
  PERFORM public.admin_log_action('ORDER_CANCELLED','order',p_order_id::text,to_jsonb(old_row),to_jsonb(new_row),p_reason);
  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_moderate_content(
  p_entity_type text, p_entity_id bigint, p_hidden boolean, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_data jsonb; new_data jsonb;
BEGIN
  PERFORM public.admin_actor_id();
  IF p_hidden AND nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Moderation reason is required'; END IF;
  IF p_entity_type='menu_item' THEN
    SELECT to_jsonb(m) INTO old_data FROM public.menu_items m WHERE id=p_entity_id FOR UPDATE;
    UPDATE public.menu_items SET is_hidden_by_admin=p_hidden, moderation_reason=CASE WHEN p_hidden THEN trim(p_reason) ELSE NULL END WHERE id=p_entity_id;
    SELECT to_jsonb(m) INTO new_data FROM public.menu_items m WHERE id=p_entity_id;
  ELSIF p_entity_type='feedback' THEN
    SELECT to_jsonb(f) INTO old_data FROM public.order_feedback f WHERE id=p_entity_id FOR UPDATE;
    UPDATE public.order_feedback SET moderation_status=CASE WHEN p_hidden THEN 'hidden' ELSE 'visible' END,
      moderation_reason=CASE WHEN p_hidden THEN trim(p_reason) ELSE NULL END WHERE id=p_entity_id;
    SELECT to_jsonb(f) INTO new_data FROM public.order_feedback f WHERE id=p_entity_id;
  ELSE RAISE EXCEPTION 'Unsupported content type'; END IF;
  IF old_data IS NULL THEN RAISE EXCEPTION 'Content not found'; END IF;
  PERFORM public.admin_log_action('CONTENT_' || CASE WHEN p_hidden THEN 'HIDDEN' ELSE 'RESTORED' END,
    p_entity_type,p_entity_id::text,old_data,new_data,p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_announcement(
  p_title text, p_message text, p_audience text DEFAULT 'all', p_target_user_id bigint DEFAULT NULL,
  p_target_shop_id bigint DEFAULT NULL, p_ends_at timestamptz DEFAULT NULL
) RETURNS public.announcements LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE new_row public.announcements; actor bigint := public.admin_actor_id();
BEGIN
  IF nullif(trim(p_title),'') IS NULL THEN RAISE EXCEPTION 'Announcement title is required'; END IF;
  IF nullif(trim(p_message),'') IS NULL THEN RAISE EXCEPTION 'Announcement message is required'; END IF;
  IF p_audience NOT IN ('all','customers','owners') THEN RAISE EXCEPTION 'Invalid announcement audience'; END IF;
  IF p_ends_at IS NOT NULL AND p_ends_at<=now() THEN RAISE EXCEPTION 'Announcement end time must be in the future'; END IF;
  INSERT INTO public.announcements(title,message,audience,target_user_id,target_shop_id,ends_at,created_by)
  VALUES(trim(p_title),trim(p_message),p_audience,p_target_user_id,p_target_shop_id,p_ends_at,actor)
  RETURNING * INTO new_row;
  PERFORM public.admin_log_action('ANNOUNCEMENT_CREATED','announcement',new_row.id::text,NULL,to_jsonb(new_row),NULL);
  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_announcement(p_announcement_id bigint, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_row public.announcements; actor bigint := public.admin_actor_id();
BEGIN
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A deletion reason is required'; END IF;
  SELECT * INTO old_row FROM public.announcements WHERE id=p_announcement_id FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Announcement not found'; END IF;
  DELETE FROM public.announcements WHERE id=p_announcement_id;
  PERFORM public.admin_log_action('ANNOUNCEMENT_DELETED','announcement',p_announcement_id::text,to_jsonb(old_row),NULL,trim(p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_setting(p_key text, p_value jsonb)
RETURNS public.system_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_row public.system_settings; new_row public.system_settings; actor bigint := public.admin_actor_id();
BEGIN
  SELECT * INTO old_row FROM public.system_settings WHERE key=p_key FOR UPDATE;
  IF old_row.key IS NULL THEN RAISE EXCEPTION 'Unknown setting'; END IF;
  UPDATE public.system_settings SET value=p_value,updated_by=actor,updated_at=now() WHERE key=p_key RETURNING * INTO new_row;
  PERFORM public.admin_log_action('SETTING_UPDATED','system_setting',p_key,to_jsonb(old_row),to_jsonb(new_row),NULL);
  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.admin_actor_id();
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM public.users),
    'suspended_users', (SELECT count(*) FROM public.users WHERE account_status='suspended'),
    'shops', (SELECT count(*) FROM public.shops),
    'pending_shops', (SELECT count(*) FROM public.shops WHERE status='pending'),
    'orders_today', (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('day',timezone('Asia/Yangon',now())) AT TIME ZONE 'Asia/Yangon'),
    'revenue_today', (SELECT coalesce(sum(total_amount),0) FROM public.orders WHERE status='delivered' AND created_at >= date_trunc('day',timezone('Asia/Yangon',now())) AT TIME ZONE 'Asia/Yangon'),
    'active_orders', (SELECT count(*) FROM public.orders WHERE status IN ('pending','preparing','ready','out_for_delivery')),
    'average_rating', (SELECT round(coalesce(avg(rating),0),1) FROM public.order_feedback WHERE moderation_status='visible')
  ) INTO result;
  RETURN result;
END;
$$;

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read approved menus" ON public.menu_items;
CREATE POLICY "Authenticated read approved menus" ON public.menu_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.shops s WHERE s.id=shop_id AND s.status='approved')
  AND (NOT is_hidden_by_admin OR public.owns_approved_shop(shop_id) OR public.is_admin())
);

DROP POLICY IF EXISTS "Approved owners read shop feedback" ON public.order_feedback;
CREATE POLICY "Approved owners read shop feedback" ON public.order_feedback FOR SELECT TO authenticated
USING (public.owns_approved_shop(shop_id) AND moderation_status='visible');

DROP POLICY IF EXISTS "Customers create feedback for delivered orders" ON public.order_feedback;
CREATE POLICY "Customers create feedback for delivered orders" ON public.order_feedback FOR INSERT TO authenticated
WITH CHECK (
  COALESCE((SELECT value='true'::jsonb FROM public.system_settings WHERE key='feedback_enabled'),true)
  AND customer_id=public.current_profile_id()
  AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.customer_id=public.current_profile_id() AND o.shop_id=shop_id AND o.status='delivered')
);

CREATE POLICY "Admins read audit logs" ON public.admin_audit_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins manage announcements" ON public.announcements FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Users read relevant announcements" ON public.announcements FOR SELECT TO authenticated USING (
  is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()) AND
  (target_user_id IS NULL OR target_user_id=public.current_profile_id()) AND
  (audience='all' OR (audience='customers' AND public.current_profile_role()='customer') OR (audience='owners' AND public.current_profile_role()='owner'))
);
CREATE POLICY "Users manage own announcement reads" ON public.announcement_reads FOR ALL TO authenticated
  USING (user_id=public.current_profile_id()) WITH CHECK (user_id=public.current_profile_id());
CREATE POLICY "Admins read all settings" ON public.system_settings FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Users read public settings" ON public.system_settings FOR SELECT TO authenticated USING (is_public);

GRANT SELECT ON public.admin_audit_logs, public.announcements, public.announcement_reads, public.system_settings TO authenticated;
GRANT INSERT, UPDATE ON public.announcement_reads TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_actor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspension(bigint,boolean,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_control_shop(bigint,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_content(text,bigint,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_announcement(text,text,text,bigint,bigint,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_announcement(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_setting(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_overview() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_log_action(text,text,text,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_actor_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_suspension(bigint,boolean,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_control_shop(bigint,text,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cancel_order(bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_moderate_content(text,bigint,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_announcement(text,text,text,bigint,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_announcement(bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_setting(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_overview() FROM PUBLIC;

-- Re-grant only the externally callable, self-authorizing functions.
GRANT EXECUTE ON FUNCTION public.admin_actor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspension(bigint,boolean,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_control_shop(bigint,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_content(text,bigint,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_announcement(text,text,text,bigint,bigint,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_announcement(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_setting(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_overview() TO authenticated;

COMMIT;

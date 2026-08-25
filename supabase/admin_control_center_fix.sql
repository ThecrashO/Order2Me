-- Order2Me Admin Control Center corrective patch
-- Run once after admin_control_center.sql. Safe to rerun.

BEGIN;

-- Payment validation remains the owner's order-acceptance responsibility.
DROP FUNCTION IF EXISTS public.admin_review_payment(bigint,text,text);

-- A suspended account no longer resolves as an operational identity.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.users
  WHERE auth_user_id=auth.uid()
    AND account_status='active'
  LIMIT 1;
$$;

-- Maintenance and the global ordering switch both stop order insertion.
CREATE OR REPLACE FUNCTION public.shop_accepts_orders(target_shop_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT value='true'::jsonb FROM public.system_settings WHERE key='ordering_enabled'),true)
    AND NOT COALESCE((SELECT value='true'::jsonb FROM public.system_settings WHERE key='maintenance_mode'),false)
    AND EXISTS (
      SELECT 1 FROM public.shops s
      CROSS JOIN LATERAL (SELECT (timezone('Asia/Yangon',now()))::date local_date,
        (timezone('Asia/Yangon',now()))::time local_time) clock
      WHERE s.id=target_shop_id AND s.status='approved' AND s.is_open AND NOT s.admin_force_closed
        AND (s.accepting_orders OR s.accepting_orders_date<>clock.local_date)
        AND (s.opening_time=s.closing_time OR
          (s.opening_time<s.closing_time AND clock.local_time>=s.opening_time AND clock.local_time<s.closing_time) OR
          (s.opening_time>s.closing_time AND (clock.local_time>=s.opening_time OR clock.local_time<s.closing_time)))
    );
$$;

-- Enforce the configured maximum amount at the database boundary.
DROP POLICY IF EXISTS "Customers create orders at approved shops" ON public.orders;
CREATE POLICY "Customers create orders at approved shops"
ON public.orders FOR INSERT TO authenticated WITH CHECK (
  customer_id=public.current_profile_id()
  AND public.current_profile_role()='customer'
  AND public.shop_accepts_orders(shop_id)
  AND total_amount>0
  AND total_amount<=COALESCE(
    (SELECT (value #>> '{}')::numeric FROM public.system_settings WHERE key='maximum_order_amount'),
    500000
  )
);

-- Prevent owner-profile creation while owner registration is disabled.
CREATE OR REPLACE FUNCTION public.enforce_owner_signup_setting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.role='owner'
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND NOT COALESCE((SELECT value='true'::jsonb FROM public.system_settings WHERE key='owner_signup_enabled'),true) THEN
    RAISE EXCEPTION 'New owner registration is temporarily disabled' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_owner_signup_setting ON public.users;
CREATE TRIGGER trg_enforce_owner_signup_setting BEFORE INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_signup_setting();

-- Use a distinct audit action for every shop operation.
CREATE OR REPLACE FUNCTION public.admin_control_shop(
  p_shop_id bigint, p_status text DEFAULT NULL, p_force_closed boolean DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS public.shops LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_row public.shops; new_row public.shops; actor bigint:=public.admin_actor_id(); action_name text;
BEGIN
  SELECT * INTO old_row FROM public.shops WHERE id=p_shop_id FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Shop not found'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','approved','rejected','suspended') THEN RAISE EXCEPTION 'Invalid shop status'; END IF;
  IF ((p_status IN ('rejected','suspended')) OR p_force_closed=true) AND nullif(trim(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  UPDATE public.shops SET
    status=COALESCE(p_status,status),
    rejection_reason=CASE WHEN p_status IN ('rejected','suspended') THEN trim(p_reason) WHEN p_status='approved' THEN NULL ELSE rejection_reason END,
    approved_by=CASE WHEN p_status='approved' THEN actor ELSE approved_by END,
    approved_at=CASE WHEN p_status='approved' THEN now() ELSE approved_at END,
    admin_force_closed=COALESCE(p_force_closed,admin_force_closed),
    admin_close_reason=CASE WHEN p_force_closed=true THEN trim(p_reason) WHEN p_force_closed=false THEN NULL ELSE admin_close_reason END
  WHERE id=p_shop_id RETURNING * INTO new_row;
  action_name:=CASE
    WHEN p_force_closed=true THEN 'SHOP_FORCE_CLOSED'
    WHEN p_force_closed=false THEN 'SHOP_FORCE_REOPENED'
    WHEN p_status='approved' THEN 'SHOP_APPROVED'
    WHEN p_status='rejected' THEN 'SHOP_REJECTED'
    WHEN p_status='suspended' THEN 'SHOP_SUSPENDED'
    ELSE 'SHOP_CONTROL_UPDATED' END;
  PERFORM public.admin_log_action(action_name,'shop',p_shop_id::text,to_jsonb(old_row),to_jsonb(new_row),p_reason);
  RETURN new_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.admin_actor_id();
  SELECT jsonb_build_object(
    'users',(SELECT count(*) FROM public.users),
    'suspended_users',(SELECT count(*) FROM public.users WHERE account_status='suspended'),
    'shops',(SELECT count(*) FROM public.shops),
    'pending_shops',(SELECT count(*) FROM public.shops WHERE status='pending'),
    'orders_today',(SELECT count(*) FROM public.orders WHERE created_at>=date_trunc('day',timezone('Asia/Yangon',now())) AT TIME ZONE 'Asia/Yangon'),
    'revenue_today',(SELECT coalesce(sum(total_amount),0) FROM public.orders WHERE status='delivered' AND created_at>=date_trunc('day',timezone('Asia/Yangon',now())) AT TIME ZONE 'Asia/Yangon'),
    'active_orders',(SELECT count(*) FROM public.orders WHERE status IN ('pending','preparing','ready','out_for_delivery')),
    'average_rating',(SELECT round(coalesce(avg(rating),0),1) FROM public.order_feedback WHERE moderation_status='visible')
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_setting(p_key text, p_value jsonb)
RETURNS public.system_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_row public.system_settings; new_row public.system_settings; actor bigint:=public.admin_actor_id(); numeric_value numeric;
BEGIN
  SELECT * INTO old_row FROM public.system_settings WHERE key=p_key FOR UPDATE;
  IF old_row.key IS NULL THEN RAISE EXCEPTION 'Unknown setting'; END IF;
  IF p_key IN ('ordering_enabled','maintenance_mode','owner_signup_enabled','feedback_enabled')
     AND jsonb_typeof(p_value)<>'boolean' THEN RAISE EXCEPTION 'This setting requires true or false'; END IF;
  IF p_key IN ('maximum_order_amount','default_preparation_minutes') THEN
    IF jsonb_typeof(p_value)<>'number' THEN RAISE EXCEPTION 'This setting requires a number'; END IF;
    numeric_value:=(p_value #>> '{}')::numeric;
    IF p_key='maximum_order_amount' AND (numeric_value<1000 OR numeric_value>10000000) THEN RAISE EXCEPTION 'Maximum order amount must be between 1,000 and 10,000,000'; END IF;
    IF p_key='default_preparation_minutes' AND (numeric_value<1 OR numeric_value>180) THEN RAISE EXCEPTION 'Preparation time must be between 1 and 180 minutes'; END IF;
  END IF;
  UPDATE public.system_settings SET value=p_value,updated_by=actor,updated_at=now() WHERE key=p_key RETURNING * INTO new_row;
  PERFORM public.admin_log_action('SETTING_UPDATED','system_setting',p_key,to_jsonb(old_row),to_jsonb(new_row),NULL);
  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_owner_signup_setting() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_control_shop(bigint,text,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_setting(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_control_shop(bigint,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_setting(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_accepts_orders(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verification: each successful admin action should add one row.
SELECT id, action, entity_type, entity_id, reason, created_at
FROM public.admin_audit_logs ORDER BY created_at DESC LIMIT 20;

-- ============================================================================
-- BADSHAH AI v2 — Supabase schema
-- ============================================================================
-- Run order: run this file ONCE in the Supabase SQL Editor (Dashboard ->
-- SQL Editor -> New query -> paste -> Run). It is written to be re-runnable:
-- CREATE OR REPLACE is used for functions, DROP POLICY IF EXISTS precedes
-- each policy, and seed INSERTs use ON CONFLICT DO NOTHING.
--
-- Auth: Supabase Auth, email + password, no email confirmation.
-- Admin: profiles.is_admin. The admin user is created SEPARATELY (in the
-- Supabase Auth dashboard / by another step) — this script NEVER creates
-- users and contains NO passwords or API keys.
--
-- Notes:
-- * public.is_admin() is SECURITY DEFINER so it bypasses RLS. That is
--   deliberate: profiles policies call is_admin(), and is_admin() reads
--   profiles — without SECURITY DEFINER that would recurse infinitely.
-- * Pro status (is_pro / plan_id / pro_expires_at / is_admin) can only be
--   changed by an admin: a BEFORE UPDATE trigger on profiles enforces it,
--   and the approve/grant/revoke RPCs are the intended way to change it.
-- * The FT Fusion API key lives only as a Supabase Edge Function secret,
--   never in this schema or in the frontend.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) Tables (all with RLS enabled, see section 3)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plans (
  id text PRIMARY KEY,
  name text,
  months int,
  price_pkr int,
  token_limit bigint,
  is_custom boolean DEFAULT false,
  sort_order int
);

-- NOTE: plans is created before profiles because profiles.plan_id
-- references plans(id); a FK target must exist when the table is created.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  is_admin boolean DEFAULT false,
  is_pro boolean DEFAULT false,
  plan_id text REFERENCES public.plans(id),
  pro_expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  last_ip text,
  last_device text
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id text REFERENCES public.plans(id),
  starts_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  payment_order_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id text REFERENCES public.plans(id),
  amount_pkr int NOT NULL,
  method text CHECK (method IN ('easypaisa', 'jazzcash', 'nayapay', 'bank')),
  payer_name text,
  screenshot_path text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.help_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text,
  message text NOT NULL,
  reply text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'replied')),
  created_at timestamptz DEFAULT now(),
  replied_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip text,
  device text,
  created_at timestamptz DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 2) Indexes
-- --------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON public.payment_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON public.payment_orders (status);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.login_history (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_help_messages_status ON public.help_messages (status);

-- --------------------------------------------------------------------------
-- 3) Row Level Security — enable on every table
-- --------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 4) Helper: public.is_admin()
--    SECURITY DEFINER so it bypasses RLS and avoids infinite recursion
--    (profiles policies call is_admin(), and is_admin() reads profiles).
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
$$;

-- --------------------------------------------------------------------------
-- 5) RLS policies
-- --------------------------------------------------------------------------

-- profiles: users SELECT/UPDATE own row; admins SELECT/UPDATE all.
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- plans: SELECT for all authenticated users; only admins can write.
DROP POLICY IF EXISTS "Authenticated users can view plans" ON public.plans;
CREATE POLICY "Authenticated users can view plans"
  ON public.plans FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage plans" ON public.plans;
CREATE POLICY "Admins can manage plans"
  ON public.plans FOR ALL
  USING (public.is_admin());

-- subscriptions: users SELECT own; admins all; no direct writes for users.
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (public.is_admin());

-- payment_orders: users INSERT own, SELECT own; admins all.
DROP POLICY IF EXISTS "Users can create own payment orders" ON public.payment_orders;
CREATE POLICY "Users can create own payment orders"
  ON public.payment_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own payment orders" ON public.payment_orders;
CREATE POLICY "Users can view own payment orders"
  ON public.payment_orders FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage payment orders" ON public.payment_orders;
CREATE POLICY "Admins can manage payment orders"
  ON public.payment_orders FOR ALL
  USING (public.is_admin());

-- help_messages: users INSERT own, SELECT own; admins all (incl. replies).
DROP POLICY IF EXISTS "Users can create own help messages" ON public.help_messages;
CREATE POLICY "Users can create own help messages"
  ON public.help_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own help messages" ON public.help_messages;
CREATE POLICY "Users can view own help messages"
  ON public.help_messages FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage help messages" ON public.help_messages;
CREATE POLICY "Admins can manage help messages"
  ON public.help_messages FOR ALL
  USING (public.is_admin());

-- admin_settings: SELECT for authenticated users (the app needs the
-- maintenance flag and model config); writes are admin-only.
DROP POLICY IF EXISTS "Authenticated users can view admin settings" ON public.admin_settings;
CREATE POLICY "Authenticated users can view admin settings"
  ON public.admin_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage admin settings" ON public.admin_settings;
CREATE POLICY "Admins can manage admin settings"
  ON public.admin_settings FOR ALL
  USING (public.is_admin());

-- login_history: users INSERT own, SELECT own; admins SELECT all.
DROP POLICY IF EXISTS "Users can log own logins" ON public.login_history;
CREATE POLICY "Users can log own logins"
  ON public.login_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own login history" ON public.login_history;
CREATE POLICY "Users can view own login history"
  ON public.login_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all login history" ON public.login_history;
CREATE POLICY "Admins can view all login history"
  ON public.login_history FOR SELECT
  USING (public.is_admin());

-- --------------------------------------------------------------------------
-- 6) Triggers
-- --------------------------------------------------------------------------

-- 6a) Create a profiles row whenever a new auth user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6b) Block non-admin changes to protected profile columns.
--      If the caller is not an admin (auth.uid() is null or is_admin is
--      false) and any protected column changed, the update is rejected.
CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF OLD.is_pro IS DISTINCT FROM NEW.is_pro
     OR OLD.plan_id IS DISTINCT FROM NEW.plan_id
     OR OLD.pro_expires_at IS DISTINCT FROM NEW.pro_expires_at
     OR OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM public.profiles p
    WHERE p.id = auth.uid();
    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'Only admins can change pro/admin fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_admin_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_admin_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_fields();

-- --------------------------------------------------------------------------
-- 7) Admin RPCs (all SECURITY DEFINER with an internal admin check)
-- --------------------------------------------------------------------------

-- 7a) Approve a pending payment order and grant Pro for the plan's duration.
CREATE OR REPLACE FUNCTION public.approve_payment_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_order public.payment_orders%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_existing_expires timestamptz;
  v_months int;
  v_new_expires timestamptz;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not admin';
  END IF;

  SELECT * INTO v_order FROM public.payment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment order not found';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'payment order is not pending';
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = v_order.plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan not found';
  END IF;

  SELECT pro_expires_at INTO v_existing_expires
  FROM public.profiles WHERE id = v_order.user_id;

  -- A 0/null month count (e.g. a custom plan) grants 1 month.
  v_months := COALESCE(NULLIF(v_plan.months, 0), 1);
  v_new_expires :=
    (CASE WHEN v_existing_expires IS NOT NULL AND v_existing_expires > now()
          THEN v_existing_expires ELSE now() END)
    + make_interval(months => v_months);

  INSERT INTO public.subscriptions
    (user_id, plan_id, starts_at, expires_at, status, payment_order_id)
  VALUES
    (v_order.user_id, v_order.plan_id, now(), v_new_expires, 'active', p_order_id);

  UPDATE public.payment_orders
  SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_order_id;

  UPDATE public.profiles
  SET is_pro = true, plan_id = v_order.plan_id, pro_expires_at = v_new_expires
  WHERE id = v_order.user_id;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_new_expires);
END;
$$;

-- 7b) Reject a pending payment order.
CREATE OR REPLACE FUNCTION public.reject_payment_order(p_order_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_order public.payment_orders%ROWTYPE;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not admin';
  END IF;

  SELECT * INTO v_order FROM public.payment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment order not found';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'payment order is not pending';
  END IF;

  UPDATE public.payment_orders
  SET status = 'rejected', admin_note = p_note,
      reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7c) Grant Pro directly, without a payment order (admin gift / manual grant).
--     The duration is freely selectable by the admin:
--       * p_plan_id only  -> the plan's duration in months
--       * p_days         -> that many days
--       * p_months       -> that many months
--       * p_expires_at   -> Pro runs until this exact date/time (wins over
--                           p_days / p_months)
--     At least one of p_plan_id / p_days / p_months / p_expires_at is
--     required. When the user already has Pro running and p_extend is true
--     (default), the new time is added on top of the current expiry
--     instead of starting from now. The plan recorded on the profile falls
--     back to the user's current plan, then to the custom plan row.
CREATE OR REPLACE FUNCTION public.grant_pro(
  p_user_id uuid,
  p_plan_id text DEFAULT NULL,
  p_days int DEFAULT NULL,
  p_months int DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_extend boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_plan public.plans%ROWTYPE;
  v_existing_expires timestamptz;
  v_existing_plan text;
  v_plan_id text;
  v_months int;
  v_new_expires timestamptz;
  v_base timestamptz;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not admin';
  END IF;

  SELECT pro_expires_at, plan_id INTO v_existing_expires, v_existing_plan
  FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  -- Base time: extend from the current expiry when it is still in the
  -- future and extending was requested; otherwise start from now.
  v_base := now();
  IF COALESCE(p_extend, true)
     AND v_existing_expires IS NOT NULL
     AND v_existing_expires > now() THEN
    v_base := v_existing_expires;
  END IF;

  -- An explicit end date wins over days / months / plan.
  IF p_expires_at IS NOT NULL THEN
    IF p_expires_at <= now() THEN
      RAISE EXCEPTION 'expiry date must be in the future';
    END IF;
    v_new_expires := p_expires_at;
    v_plan_id := p_plan_id;
  ELSIF p_days IS NOT NULL THEN
    IF p_days < 1 OR p_days > 3650 THEN
      RAISE EXCEPTION 'days must be between 1 and 3650';
    END IF;
    v_new_expires := v_base + make_interval(days => p_days);
    v_plan_id := p_plan_id;
  ELSIF p_months IS NOT NULL THEN
    IF p_months < 1 OR p_months > 120 THEN
      RAISE EXCEPTION 'months must be between 1 and 120';
    END IF;
    v_new_expires := v_base + make_interval(months => p_months);
    v_plan_id := p_plan_id;
  ELSIF p_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'plan not found';
    END IF;
    -- A 0/null month count (e.g. a custom plan) grants 1 month.
    v_months := COALESCE(NULLIF(v_plan.months, 0), 1);
    v_new_expires := v_base + make_interval(months => v_months);
    v_plan_id := p_plan_id;
  ELSE
    RAISE EXCEPTION 'pick a plan, a number of days/months, or an end date';
  END IF;

  -- Fall back to the user's current plan, then to the custom plan row.
  IF v_plan_id IS NULL THEN
    v_plan_id := v_existing_plan;
  END IF;
  IF v_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.plans WHERE id = v_plan_id) THEN
    v_plan_id := 'plan-custom';
  END IF;

  INSERT INTO public.subscriptions
    (user_id, plan_id, starts_at, expires_at, status, payment_order_id)
  VALUES
    (p_user_id, v_plan_id, now(), v_new_expires, 'active', NULL);

  UPDATE public.profiles
  SET is_pro = true, plan_id = v_plan_id, pro_expires_at = v_new_expires
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_new_expires, 'plan_id', v_plan_id);
END;
$$;

-- 7d) Revoke Pro from a user and cancel their active subscriptions.
CREATE OR REPLACE FUNCTION public.revoke_pro(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not admin';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  UPDATE public.profiles
  SET is_pro = false, plan_id = NULL, pro_expires_at = NULL
  WHERE id = p_user_id;

  UPDATE public.subscriptions
  SET status = 'cancelled'
  WHERE user_id = p_user_id AND status = 'active';

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7e) Grant or remove admin status. An admin cannot demote themselves.
CREATE OR REPLACE FUNCTION public.set_admin_status(p_user_id uuid, p_is_admin boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not admin';
  END IF;

  IF p_user_id = auth.uid() AND NOT p_is_admin THEN
    RAISE EXCEPTION 'admins cannot demote themselves';
  END IF;

  UPDATE public.profiles
  SET is_admin = p_is_admin
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7f) Set (or clear) a user's Pro expiry directly.
--     p_expires_at NULL clears Pro entirely. A future date keeps/turns Pro
--     on; a past date turns Pro off. Used by the admin "Edit Expiry" action
--     (replaces the old direct profiles update so the is_pro flag and the
--     subscription rows stay consistent).
CREATE OR REPLACE FUNCTION public.set_pro_expiry(p_user_id uuid, p_expires_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_is_pro boolean;
  v_plan_id text;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not admin';
  END IF;

  SELECT plan_id INTO v_plan_id FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF p_expires_at IS NULL THEN
    UPDATE public.profiles
    SET is_pro = false, plan_id = NULL, pro_expires_at = NULL
    WHERE id = p_user_id;
    UPDATE public.subscriptions
    SET status = 'cancelled'
    WHERE user_id = p_user_id AND status = 'active';
    RETURN jsonb_build_object('ok', true, 'cleared', true);
  END IF;

  v_is_pro := p_expires_at > now();
  IF v_plan_id IS NULL THEN
    v_plan_id := 'plan-custom';
  END IF;

  UPDATE public.profiles
  SET is_pro = v_is_pro, plan_id = v_plan_id, pro_expires_at = p_expires_at
  WHERE id = p_user_id;

  IF NOT v_is_pro THEN
    UPDATE public.subscriptions
    SET status = 'cancelled'
    WHERE user_id = p_user_id AND status = 'active';
  END IF;

  RETURN jsonb_build_object('ok', true, 'expires_at', p_expires_at, 'is_pro', v_is_pro);
END;
$$;

-- --------------------------------------------------------------------------
-- 8) Seed data (re-runnable: ON CONFLICT DO NOTHING)
-- --------------------------------------------------------------------------

INSERT INTO public.plans (id, name, months, price_pkr, token_limit, is_custom, sort_order)
VALUES
  ('plan-1m', '1 Month', 1, 100, 2000000, false, 1),
  ('plan-3m', '3 Months', 3, 230, 5000000, false, 2),
  ('plan-5m', '5 Months', 5, 400, 8000000, false, 3),
  ('plan-8m', '8 Months', 8, 699, 12000000, false, 4),
  ('plan-1y', '1 Year', 12, 999, 20000000, false, 5),
  ('plan-custom', 'Custom', 0, 0, 0, true, 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admin_settings (key, value)
VALUES
  ('maintenance', '{"on": false}'),
  ('models', '{"disabled": []}'),
  ('apk_url', '{"url": "Badshah222-ai.apk"}'),
  ('payment_accounts', '{"easypaisa": "03095413705", "jazzcash": "03251787969", "nayapay": "03251787969", "bank_name": "Bank of Khyber (BOK)", "iban": "PK57KHYB5085003008639737"}'),
  ('safety_filter', '{"enabled": true}'),
  ('site_name', '{"name": "BADSHAH AI"}'),
  ('support_contact', '{"value": "03251787969", "whatsapp": "03251787969"}')
ON CONFLICT (key) DO NOTHING;

-- --------------------------------------------------------------------------
-- 9) Storage bucket for payment-proof screenshots (private)
--    Objects are stored under <user-uuid>/<filename> so the folder name is
--    the owner's id; Supabase also sets storage.objects.owner on upload.
-- --------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload their own payment proofs into the bucket.
DROP POLICY IF EXISTS "Users can upload payment proofs" ON storage.objects;
CREATE POLICY "Users can upload payment proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can view their own payment proofs.
DROP POLICY IF EXISTS "Users can view own payment proofs" ON storage.objects;
CREATE POLICY "Users can view own payment proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admins can view every payment proof in the bucket.
DROP POLICY IF EXISTS "Admins can view all payment proofs" ON storage.objects;
CREATE POLICY "Admins can view all payment proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND public.is_admin()
  );

-- ==============================================================================
-- Cafe WiFi access for customers with a confirmed reservation
--
-- * wifi_settings holds the network name/password the admin sets. It is never
--   readable with the public (anon) key — unlike cafe_settings — so the password
--   can't leak through the browser's Supabase client.
-- * Only the service role (the /api/wifi Vercel function) can call the wifi_*
--   functions. The API verifies who is asking before calling wifi_access().
-- * wifi_access() is the single place that decides whether a customer may see the
--   password: their own dine-in booking, confirmed (and paid, if applicable), and
--   now within 15 minutes before the slot until 30 minutes after it ends.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.wifi_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ssid text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  -- Optional window in which these credentials are valid (e.g. a weekly password)
  valid_from timestamptz,
  valid_until timestamptz,
  -- Length of a reservation slot; access ends 30 minutes after slot + this
  session_minutes integer NOT NULL DEFAULT 120 CHECK (session_minutes BETWEEN 30 AND 720),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.wifi_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wifi_settings FROM PUBLIC;
REVOKE ALL ON public.wifi_settings FROM anon, authenticated;
GRANT ALL ON public.wifi_settings TO service_role;

-- Admin: current settings (password included — the API only calls this for a verified admin)
CREATE OR REPLACE FUNCTION public.wifi_admin_get()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object(
       'ssid', w.ssid, 'password', w.password, 'valid_from', w.valid_from, 'valid_until', w.valid_until,
       'session_minutes', w.session_minutes, 'updated_at', w.updated_at, 'updated_by', w.updated_by)
     FROM public.wifi_settings w WHERE w.id = 1),
    jsonb_build_object('ssid', '', 'password', '', 'valid_from', NULL, 'valid_until', NULL,
                       'session_minutes', 120, 'updated_at', NULL, 'updated_by', NULL)
  );
$$;

-- Admin: save settings. _settings = { ssid, password, valid_from?, valid_until?, session_minutes? }
CREATE OR REPLACE FUNCTION public.wifi_admin_save(_settings jsonb, _actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ssid text := btrim(coalesce(_settings->>'ssid', ''));
  _password text := coalesce(_settings->>'password', '');
  _from timestamptz := nullif(btrim(coalesce(_settings->>'valid_from', '')), '')::timestamptz;
  _until timestamptz := nullif(btrim(coalesce(_settings->>'valid_until', '')), '')::timestamptz;
  _minutes integer := coalesce(nullif(_settings->>'session_minutes', '')::integer, 120);
BEGIN
  IF length(_ssid) < 1 OR length(_ssid) > 32 THEN RAISE EXCEPTION 'WIFI_INVALID_SSID'; END IF;
  -- WPA/WPA2 passphrase rules
  IF length(_password) < 8 OR length(_password) > 63 THEN RAISE EXCEPTION 'WIFI_INVALID_PASSWORD'; END IF;
  IF _from IS NOT NULL AND _until IS NOT NULL AND _until <= _from THEN RAISE EXCEPTION 'WIFI_INVALID_WINDOW'; END IF;
  IF _minutes < 30 OR _minutes > 720 THEN RAISE EXCEPTION 'WIFI_INVALID_SESSION'; END IF;

  INSERT INTO public.wifi_settings (id, ssid, password, valid_from, valid_until, session_minutes, updated_at, updated_by)
  VALUES (1, _ssid, _password, _from, _until, _minutes, now(), _actor)
  ON CONFLICT (id) DO UPDATE
    SET ssid = EXCLUDED.ssid, password = EXCLUDED.password, valid_from = EXCLUDED.valid_from,
        valid_until = EXCLUDED.valid_until, session_minutes = EXCLUDED.session_minutes,
        updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

  RETURN public.wifi_admin_get();
END;
$$;

-- Customer: may this user see the WiFi for this booking right now?
-- status: available | not_yet | ended | not_configured | awaiting_confirmation |
--         awaiting_payment | cancelled | not_dine_in | not_found
-- ssid/password are included ONLY when status = 'available'.
CREATE OR REPLACE FUNCTION public.wifi_access(_user_id uuid, _code text, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  w public.wifi_settings%ROWTYPE;
  _slot timestamptz;
  _opens timestamptz;
  _closes timestamptz;
  _result jsonb;
BEGIN
  -- Someone else's booking looks exactly like a missing one
  SELECT * INTO b FROM public.bookings WHERE code = _code AND user_id = _user_id AND _user_id IS NOT NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', _code, 'status', 'not_found'); END IF;

  IF coalesce(b.order_type, 'DINE_IN') <> 'DINE_IN' THEN
    RETURN jsonb_build_object('code', _code, 'status', 'not_dine_in');
  END IF;
  IF b.status IN ('cancelled', 'no_show', 'expired') THEN
    RETURN jsonb_build_object('code', _code, 'status', 'cancelled');
  END IF;
  IF coalesce(b.status, '') NOT IN ('confirmed', 'completed', 'billed') THEN
    RETURN jsonb_build_object('code', _code, 'status', 'awaiting_confirmation');
  END IF;
  -- Paid, if applicable: a pre-order deposit, or an order the customer chose to pay online
  IF (b.payment_required AND b.payment_state NOT IN ('PAID', 'PARTIALLY_PAID'))
     OR (NOT b.payment_required AND b.payment_method IN ('online_razorpay', 'upi_razorpay')
         AND b.payment_state <> 'PAID' AND coalesce(b.payment_status, '') <> 'paid') THEN
    RETURN jsonb_build_object('code', _code, 'status', 'awaiting_payment');
  END IF;

  _slot := public.preorder_scheduled_at('DINE_IN', b.date, b.time, NULL, _now);
  IF _slot IS NULL THEN RETURN jsonb_build_object('code', _code, 'status', 'not_found'); END IF;

  SELECT * INTO w FROM public.wifi_settings WHERE id = 1;
  _opens := _slot - interval '15 minutes';
  _closes := _slot + make_interval(mins => coalesce(w.session_minutes, 120)) + interval '30 minutes';
  _result := jsonb_build_object('code', _code, 'available_from', _opens, 'available_until', _closes);

  IF _now < _opens THEN RETURN _result || jsonb_build_object('status', 'not_yet'); END IF;
  IF _now > _closes THEN RETURN _result || jsonb_build_object('status', 'ended'); END IF;

  IF w.id IS NULL OR w.ssid = '' OR w.password = ''
     OR (w.valid_from IS NOT NULL AND _now < w.valid_from)
     OR (w.valid_until IS NOT NULL AND _now > w.valid_until) THEN
    RETURN _result || jsonb_build_object('status', 'not_configured');
  END IF;

  RETURN _result || jsonb_build_object('status', 'available', 'ssid', w.ssid, 'password', w.password);
END;
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['wifi_admin_get()', 'wifi_admin_save(jsonb, text)', 'wifi_access(uuid, text, timestamptz)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END;
$$;

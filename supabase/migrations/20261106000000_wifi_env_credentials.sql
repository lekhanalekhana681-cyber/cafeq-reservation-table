-- 20261106000000_wifi_env_credentials.sql
-- The WiFi password was never shown because wifi_settings starts empty: until an admin saved
-- a password, wifi_access() answered "not_configured" for every reservation.
-- Now the server's environment (WIFI_PASSWORD, WIFI_SSID) supplies the credentials, passed in
-- by /api/wifi — the password stays out of git and out of every public table.
--   password: WIFI_PASSWORD if set, else the one saved in Admin › WiFi
--   network:  the name saved in Admin › WiFi if any (keeps the existing name), else WIFI_SSID
-- All other rules are unchanged: own dine-in booking, confirmed, paid if applicable,
-- 15 minutes before the slot until 30 minutes after it ends.

DROP FUNCTION IF EXISTS public.wifi_access(uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.wifi_access(
  _user_id uuid,
  _code text,
  _now timestamptz DEFAULT now(),
  _env_ssid text DEFAULT NULL,
  _env_password text DEFAULT NULL
)
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
  _ssid text;
  _password text;
  _from_env boolean := coalesce(_env_password, '') <> '';
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

  _ssid := coalesce(nullif(btrim(coalesce(w.ssid, '')), ''), nullif(btrim(coalesce(_env_ssid, '')), ''));
  _password := CASE WHEN _from_env THEN _env_password ELSE nullif(coalesce(w.password, ''), '') END;

  IF _ssid IS NULL OR _password IS NULL
     -- The optional valid-from/until window belongs to the password saved in Admin › WiFi
     OR (NOT _from_env AND w.valid_from IS NOT NULL AND _now < w.valid_from)
     OR (NOT _from_env AND w.valid_until IS NOT NULL AND _now > w.valid_until) THEN
    RETURN _result || jsonb_build_object('status', 'not_configured');
  END IF;

  RETURN _result || jsonb_build_object('status', 'available', 'ssid', _ssid, 'password', _password);
END;
$$;

REVOKE ALL ON FUNCTION public.wifi_access(uuid, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wifi_access(uuid, text, timestamptz, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wifi_access(uuid, text, timestamptz, text, text) TO service_role;

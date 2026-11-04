-- 20261107000000_pay_at_cafe_and_gst.sql
-- 1. "Pay at cafe" (pay_on_arrival) is allowed on every order, food pre-orders included, so a
--    pre-order never fails because online payment is down. Such an order isn't held for a deposit
--    and is still priced on the server; staff collect the money in Admin › Payments.
-- 2. Order totals include CGST 2.5% + SGST 2.5% on the items, exactly like the bill
--    (each tax rounded to the paisa; no GST on the parcel charge or delivery fee).
-- 3. pay_choose_at_cafe(): switch an unpaid order to Pay at cafe after online payment failed.
-- 4. A failed online payment is stored on the order (payment_status 'failed') and listed in Admin.

-- bookings.total was whole rupees; with GST a total can be e.g. ₹131.26
ALTER TABLE public.bookings ALTER COLUMN total TYPE numeric(10,2);

-- ─── GST ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_gst_paise(_subtotal_paise bigint)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (round(_subtotal_paise * 0.025) + round(_subtotal_paise * 0.025))::bigint;  -- CGST + SGST
$$;

CREATE OR REPLACE FUNCTION public.compute_order_total_paise(_items jsonb, _order_type text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  e jsonb;
  qty int;
  unit numeric;
  available boolean;
  total bigint := 0;
BEGIN
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) LOOP
    qty := CASE WHEN (e->>'qty') ~ '^\d+$' THEN (e->>'qty')::int END;
    IF qty IS NULL OR qty < 1 OR qty > 50 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY:%', e->>'name' USING ERRCODE = '22023';
    END IF;
    SELECT m.price, coalesce((to_jsonb(m)->>'is_available')::boolean, true)
      INTO unit, available
      FROM public.menu_items m
      WHERE m.id::text = e->>'id' OR lower(m.name) = lower(e->>'name')
      ORDER BY (m.id::text = e->>'id') DESC
      LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'UNKNOWN_MENU_ITEM:%', e->>'name' USING ERRCODE = '22023';
    END IF;
    IF NOT available THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE:%', e->>'name' USING ERRCODE = '22023';
    END IF;
    total := total + qty * round(unit) * 100;
  END LOOP;

  total := total + public.order_gst_paise(total);

  IF _order_type = 'TAKEAWAY' THEN
    total := total + public.cafe_setting_amount('packaging_charge', 0) * 100;
  ELSIF _order_type = 'DELIVERY' THEN
    total := total + public.cafe_setting_amount('delivery_fee', 40) * 100;
  END IF;
  RETURN total::int;
END;
$$;

-- ─── Pay at cafe is allowed on every order ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_payment_method_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  preorder boolean := public.order_has_preorder(NEW.items);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only re-check when the public key changes the method or the items
    IF current_user NOT IN ('anon', 'authenticated')
       OR (NEW.payment_method IS NOT DISTINCT FROM OLD.payment_method AND NEW.items IS NOT DISTINCT FROM OLD.items) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.payment_method IS NULL THEN
    NEW.payment_method := CASE WHEN preorder THEN 'online_razorpay' ELSE 'pay_on_arrival' END;
  END IF;

  IF NEW.payment_method NOT IN ('online_razorpay', 'upi_razorpay', 'upi_prepay', 'pay_on_arrival') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD:%', NEW.payment_method USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Insert trigger: Pay at cafe skips the deposit hold, but the price is still the server's.
CREATE OR REPLACE FUNCTION public.prepare_preorder_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  mode text := public.preorder_payment_mode();
BEGIN
  NEW.scheduled_at := public.preorder_scheduled_at(NEW.order_type::text, NEW.date, NEW.time, NEW.pickup_time);
  NEW.payment_required := false;
  NEW.payment_state := 'UNPAID';
  NEW.deposit_due_paise := 0;
  NEW.amount_paid_paise := 0;
  NEW.payment_expires_at := NULL;
  NEW.forfeited_at := NULL;
  NEW.forfeit_reason := NULL;
  NEW.total_amount_paise := coalesce(NEW.total, 0) * 100;

  IF mode <> 'NONE' AND public.is_preorder(NEW.items, NEW.order_type::text, NEW.scheduled_at) THEN
    NEW.total_amount_paise := public.compute_order_total_paise(NEW.items, NEW.order_type::text);
    IF NEW.payment_method = 'pay_on_arrival' THEN
      NEW.total := NEW.total_amount_paise / 100.0;
      NEW.payment_status := 'pending_cash';
      RETURN NEW;
    END IF;
    NEW.deposit_due_paise := public.compute_deposit_paise(
      NEW.total_amount_paise, mode,
      public.cafe_setting_number('deposit_percent', 30),
      public.cafe_setting_number('deposit_min_inr', 50));
    IF NEW.deposit_due_paise > 0 THEN
      NEW.payment_required := true;
      NEW.payment_state := 'PENDING';
      NEW.status := 'pending_payment';
      NEW.payment_method := 'online_razorpay';
      NEW.payment_status := 'pending_online';
      NEW.payment_expires_at := now() + interval '15 minutes';
      NEW.total := NEW.total_amount_paise / 100.0;
      NEW.deposit_required := false;
      NEW.deposit_amount := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.price_takeaway_on_server()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_type::text = 'TAKEAWAY' AND jsonb_array_length(coalesce(NEW.items, '[]'::jsonb)) > 0 THEN
    NEW.total_amount_paise := public.compute_order_total_paise(NEW.items, 'TAKEAWAY');
    NEW.total := NEW.total_amount_paise / 100.0;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Customer: switch an unpaid order to Pay at cafe ────────────────────────
CREATE OR REPLACE FUNCTION public.pay_choose_at_cafe(_code text, _phone text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  given text := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 10);
  due integer;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF length(given) < 10 OR given <> right(regexp_replace(coalesce(b.phone, ''), '\D', '', 'g'), 10) THEN
    RAISE EXCEPTION 'PHONE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF b.status IN ('cancelled', 'no_show', 'expired', 'billed') THEN
    RAISE EXCEPTION 'NOT_PAYABLE:%', b.status USING ERRCODE = '22023';
  END IF;
  IF b.amount_paid_paise > 0 OR b.payment_state IN ('PAID', 'PARTIALLY_PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FORFEITED')
     OR b.payment_status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = '22023';
  END IF;

  due := public.upi_qr_amount_paise(b);
  UPDATE public.bookings SET
    payment_method = 'pay_on_arrival',
    payment_status = 'pending_cash',
    payment_reference = NULL,
    payment_required = false,
    payment_state = 'UNPAID',
    deposit_due_paise = 0,
    total_amount_paise = due,
    total = due / 100.0,
    status = CASE WHEN status = 'pending_payment' THEN 'pending' ELSE status END,
    payment_expires_at = NULL
  WHERE id = b.id
  RETURNING * INTO b;

  PERFORM public.pay_audit(b.code, 'pay_at_cafe_chosen', due, NULL, 'customer');
  RETURN jsonb_build_object('booking', to_jsonb(b));
END;
$$;

-- ─── Failed payments are stored on the order ────────────────────────────────
-- Customer's checkout reported a failure (phone must match). A later success replaces it.
CREATE OR REPLACE FUNCTION public.pay_report_failed(_code text, _phone text, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  given text := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 10);
BEGIN
  SELECT * INTO b FROM public.bookings WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF length(given) < 10 OR given <> right(regexp_replace(coalesce(b.phone, ''), '\D', '', 'g'), 10) THEN
    RAISE EXCEPTION 'PHONE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  -- Only an unpaid online order can fail; anything else is left exactly as it is
  IF b.payment_method IN ('online_razorpay', 'upi_razorpay') AND b.amount_paid_paise = 0
     AND coalesce(b.payment_status, '') <> 'paid' AND b.status NOT IN ('cancelled', 'no_show', 'expired', 'billed') THEN
    UPDATE public.bookings SET payment_status = 'failed' WHERE id = b.id RETURNING * INTO b;
    PERFORM public.pay_audit(b.code, 'payment_failed', NULL, left(coalesce(_reason, 'Checkout failed'), 500), 'customer');
  END IF;
  RETURN jsonb_build_object('booking', to_jsonb(b));
END;
$$;

-- Razorpay's payment.failed webhook marks the order too
CREATE OR REPLACE FUNCTION public.pay_mark_failed(_razorpay_order_id text, _razorpay_payment_id text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p public.payments;
BEGIN
  UPDATE public.payments SET status = 'failed', error_reason = left(_reason, 500), updated_at = now()
  WHERE razorpay_order_id = _razorpay_order_id AND status IN ('created', 'failed')
  RETURNING * INTO p;
  IF p.id IS NOT NULL THEN
    UPDATE public.bookings SET payment_status = 'failed'
    WHERE id = p.booking_id AND amount_paid_paise = 0 AND coalesce(payment_status, '') <> 'paid'
      AND payment_method IN ('online_razorpay', 'upi_razorpay');
    PERFORM public.pay_audit(p.booking_code, 'payment_failed', p.amount_paise, _reason, 'razorpay');
  END IF;
  RETURN coalesce(to_jsonb(p), '{}'::jsonb);
END;
$$;

-- ─── Admin list: every order with money to track ────────────────────────────
CREATE OR REPLACE FUNCTION public.pay_list(_filter text DEFAULT 'all', _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH rows AS (
    SELECT b.code, b.name, b.phone, b.order_type::text AS order_type, b.status, b.payment_state,
           b.payment_method, b.payment_status, b.payment_reference,
           coalesce(b.packaging_charge, 0) AS packaging_charge, coalesce(b.delivery_fee, 0) AS delivery_fee,
           b.total_amount_paise, b.deposit_due_paise, b.amount_paid_paise, b.balance_due_paise,
           b.scheduled_at, b.forfeited_at, b.forfeit_reason, b.created_at,
           coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at) FROM public.payments p WHERE p.booking_id = b.id), '[]'::jsonb) AS payments,
           coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.payment_audit_log a WHERE a.booking_code = b.code), '[]'::jsonb) AS audit
    FROM public.bookings b
    WHERE (b.payment_required
           OR b.payment_method IN ('online_razorpay', 'upi_razorpay')
           OR (b.payment_method = 'upi_prepay' AND b.payment_status IN ('pending_verification', 'paid', 'failed'))
           OR (b.payment_method = 'pay_on_arrival' AND jsonb_array_length(coalesce(b.items, '[]'::jsonb)) > 0))
      AND CASE coalesce(_filter, 'all')
        WHEN 'paid' THEN b.payment_state IN ('PARTIALLY_PAID', 'PAID')
        WHEN 'refunded' THEN b.payment_state IN ('REFUNDED', 'PARTIALLY_REFUNDED')
        WHEN 'forfeited' THEN b.payment_state = 'FORFEITED'
        WHEN 'pending' THEN b.payment_state = 'PENDING' OR b.status IN ('pending_payment', 'expired')
                            OR b.payment_status IN ('pending_verification', 'pending_cash', 'pending_online')
        WHEN 'failed' THEN b.payment_status = 'failed'
        WHEN 'verify' THEN b.payment_status = 'pending_verification'
        ELSE true
      END
    ORDER BY (b.payment_status = 'pending_verification') DESC, b.created_at DESC
    LIMIT _limit
  )
  SELECT jsonb_build_object(
    'orders', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM rows r), '[]'::jsonb),
    'totals', (
      SELECT jsonb_build_object(
        'collected_paise', coalesce(sum(p.amount_paise) FILTER (WHERE p.status IN ('captured', 'partially_refunded', 'refunded')), 0),
        'refunded_paise', coalesce(sum(p.refunded_amount_paise), 0),
        'forfeited_paise', coalesce((SELECT sum(amount_paid_paise) FROM public.bookings WHERE payment_state = 'FORFEITED'), 0)
      ) FROM public.payments p)
  );
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'pay_choose_at_cafe(text, text)', 'pay_report_failed(text, text, text)',
    'pay_mark_failed(text, text, text)', 'pay_list(text, integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END;
$$;

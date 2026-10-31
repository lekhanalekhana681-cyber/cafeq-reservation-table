-- 20261105000000_parcel_charge_and_upi_verify.sql
-- 1. Takeaway parcel charge: ₹30 flat per takeaway order (cafe_settings.packaging_charge).
--    Dine-in and delivery orders never pay it. The takeaway total is priced on the server
--    from the menu + this charge, so the amount sent by the browser is never trusted.
-- 2. Real cafe UPI ID / payee name replace the old placeholder.
-- 3. UPI QR "I have paid" needs the 12-digit UPI transaction ID (UTR); staff then
--    Confirm (→ PAID) or Reject it in Admin › Payments. Only a confirmed payment is PAID.

-- ─── 1. Parcel charge + UPI details ─────────────────────────────────────────
INSERT INTO public.cafe_settings (key, value) VALUES ('packaging_charge', '30')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.cafe_settings (key, value) VALUES ('upi_id', '7349540534@axl')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  WHERE public.cafe_settings.value IN ('cafeq@upi', 'dummycafe@upi');

INSERT INTO public.cafe_settings (key, value) VALUES ('upi_payee_name', 'LEKHANA B S')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  WHERE public.cafe_settings.value IN ('Cafeq', 'The CAFEQ', 'Cafe Name');

-- Takeaway orders: the stored total is the server price (items + parcel charge).
-- Runs after the order-type and pre-order triggers (triggers fire in name order).
CREATE OR REPLACE FUNCTION public.price_takeaway_on_server()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_type::text = 'TAKEAWAY' AND jsonb_array_length(coalesce(NEW.items, '[]'::jsonb)) > 0 THEN
    NEW.total_amount_paise := public.compute_order_total_paise(NEW.items, 'TAKEAWAY');
    NEW.total := NEW.total_amount_paise / 100;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_price_takeaway_on_server ON public.bookings;
CREATE TRIGGER trg_zz_price_takeaway_on_server
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.price_takeaway_on_server();

-- What a UPI QR payment must cover, priced on the server.
CREATE OR REPLACE FUNCTION public.upi_qr_amount_paise(b public.bookings)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- Food + charges priced from the menu; a booking with nothing to price keeps its stored total
  SELECT CASE WHEN b.payment_required THEN b.total_amount_paise
    ELSE coalesce(nullif(
           (CASE WHEN jsonb_array_length(coalesce(b.items, '[]'::jsonb)) > 0
                 THEN public.compute_order_total_paise(b.items, b.order_type::text) ELSE 0 END)
           + CASE WHEN b.deposit_required THEN LEAST(GREATEST(coalesce(b.deposit_amount, 0), 0), 100) * 100 ELSE 0 END,
         0), b.total_amount_paise, 0)
  END::int;
$$;

-- ─── 2. Customer: "I have paid" (needs the 12-digit UTR) ────────────────────
CREATE OR REPLACE FUNCTION public.pay_claim_upi_qr(_code text, _phone text, _reference text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  given text := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 10);
  utr text := regexp_replace(coalesce(_reference, ''), '\s', '', 'g');
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
  IF b.payment_state IN ('PAID', 'PARTIALLY_PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FORFEITED') OR b.payment_status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = '22023';
  END IF;
  IF b.payment_status = 'pending_verification' THEN
    RETURN jsonb_build_object('booking', to_jsonb(b));  -- tapped twice
  END IF;
  IF utr !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'UTR_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings o
             WHERE o.id <> b.id AND o.payment_reference = utr
               AND o.payment_status IN ('pending_verification', 'paid')) THEN
    RAISE EXCEPTION 'UTR_ALREADY_USED' USING ERRCODE = '23505';
  END IF;

  UPDATE public.bookings SET
    payment_method = 'upi_prepay',
    payment_status = 'pending_verification',
    payment_reference = utr,
    total_amount_paise = CASE WHEN payment_required THEN total_amount_paise ELSE public.upi_qr_amount_paise(b) END,
    status = CASE WHEN status = 'pending_payment' THEN 'pending' ELSE status END,
    payment_expires_at = NULL
  WHERE id = b.id
  RETURNING * INTO b;

  PERFORM public.pay_audit(b.code, 'upi_qr_claimed', b.balance_due_paise, utr, 'customer');
  RETURN jsonb_build_object('booking', to_jsonb(b));
END;
$$;

-- The public key (orders not held for a deposit flag "I have paid" directly) follows the same
-- rules: a 12-digit UTR not used on another order, and it can never mark an order paid.
CREATE OR REPLACE FUNCTION public.guard_upi_qr_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.payment_status = 'paid' AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'paid') THEN
    RAISE EXCEPTION 'PAYMENT_FIELDS_READ_ONLY' USING ERRCODE = '42501';
  END IF;
  IF NEW.payment_status = 'pending_verification'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'pending_verification'
          OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference) THEN
    NEW.payment_reference := regexp_replace(coalesce(NEW.payment_reference, ''), '\s', '', 'g');
    IF NEW.payment_reference !~ '^[0-9]{12}$' THEN
      RAISE EXCEPTION 'Enter the 12-digit UPI transaction ID (UTR) from your UPI app.'
        USING ERRCODE = '23514', HINT = 'UTR_REQUIRED';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bookings o
               WHERE o.id IS DISTINCT FROM NEW.id AND o.payment_reference = NEW.payment_reference
                 AND o.payment_status IN ('pending_verification', 'paid')) THEN
      RAISE EXCEPTION 'This UPI transaction ID was already used for another order.'
        USING ERRCODE = '23514', HINT = 'UTR_ALREADY_USED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_upi_qr_status ON public.bookings;
CREATE TRIGGER trg_guard_upi_qr_status
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_upi_qr_status();

-- ─── 3. Staff: Confirm → PAID ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pay_confirm_upi_qr(_code text, _actor text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  p public.payments;
  due integer;
  amount integer;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF b.payment_status IS DISTINCT FROM 'pending_verification' THEN
    RAISE EXCEPTION 'NOT_PENDING_VERIFICATION' USING ERRCODE = '22023';
  END IF;

  due := public.upi_qr_amount_paise(b);
  amount := due - b.amount_paid_paise;
  IF amount <= 0 THEN
    RAISE EXCEPTION 'NOTHING_DUE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payments (booking_id, booking_code, kind, amount_paise, status, method, collected_by, captured_at)
  VALUES (b.id, b.code, CASE WHEN b.amount_paid_paise = 0 THEN 'full' ELSE 'balance' END,
          amount, 'captured', 'upi_qr', _actor, now())
  RETURNING * INTO p;

  UPDATE public.bookings SET
    total_amount_paise = due,
    amount_paid_paise = amount_paid_paise + amount,
    payment_state = 'PAID',
    payment_status = 'paid'
  WHERE id = b.id RETURNING * INTO b;

  PERFORM public.pay_audit(b.code, 'upi_qr_confirmed', amount, b.payment_reference, _actor);
  RETURN jsonb_build_object('booking', to_jsonb(b), 'payment', to_jsonb(p));
END;
$$;

-- ─── 4. Staff: Reject → the customer can pay again ──────────────────────────
CREATE OR REPLACE FUNCTION public.pay_reject_upi_qr(_code text, _actor text, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  utr text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF b.payment_status IS DISTINCT FROM 'pending_verification' THEN
    RAISE EXCEPTION 'NOT_PENDING_VERIFICATION' USING ERRCODE = '22023';
  END IF;
  utr := b.payment_reference;

  UPDATE public.bookings SET
    payment_status = 'failed',
    payment_reference = NULL,
    -- An unpaid pre-order goes back to waiting for payment (and expires if still unpaid)
    status = CASE WHEN payment_required AND amount_paid_paise = 0 AND status = 'pending' THEN 'pending_payment' ELSE status END,
    payment_expires_at = CASE WHEN payment_required AND amount_paid_paise = 0 AND status = 'pending'
                              THEN now() + interval '15 minutes' ELSE payment_expires_at END
  WHERE id = b.id RETURNING * INTO b;

  PERFORM public.pay_audit(b.code, 'upi_qr_rejected', NULL,
    concat_ws(' · ', 'UTR ' || utr, nullif(btrim(coalesce(_reason, '')), '')), _actor);
  RETURN jsonb_build_object('booking', to_jsonb(b));
END;
$$;

-- ─── 5. Payments list: QR orders (incl. rejected) + charges ────────────────
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
           OR (b.payment_method = 'upi_prepay' AND b.payment_status IN ('pending_verification', 'paid', 'failed')))
      AND CASE coalesce(_filter, 'all')
        WHEN 'paid' THEN b.payment_state IN ('PARTIALLY_PAID', 'PAID')
        WHEN 'refunded' THEN b.payment_state IN ('REFUNDED', 'PARTIALLY_REFUNDED')
        WHEN 'forfeited' THEN b.payment_state = 'FORFEITED'
        WHEN 'pending' THEN b.payment_state = 'PENDING' OR b.status IN ('pending_payment', 'expired')
                            OR b.payment_status = 'pending_verification'
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
    'pay_claim_upi_qr(text, text, text)', 'pay_confirm_upi_qr(text, text)',
    'pay_reject_upi_qr(text, text, text)', 'pay_list(text, integer)', 'upi_qr_amount_paise(public.bookings)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END;
$$;

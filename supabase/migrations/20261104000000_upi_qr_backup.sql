-- 20261104000000_upi_qr_backup.sql
-- UPI QR backup for when the payment gateway fails (or the customer prefers to scan):
-- 1. Food pre-orders may also use upi_prepay (UPI QR, checked by staff). Cash is still never
--    allowed for a pre-order.
-- 2. pay_claim_upi_qr(): the customer's "I have paid" → payment_status 'pending_verification'.
--    Runs on the server (/api/payments/upi-claim) so it also works for pre-orders whose payment
--    fields the public key can't touch. An unpaid pre-order is un-parked (no 15-minute expiry)
--    and waits for staff like any other new order.
-- 3. pay_list(): these orders appear in Admin › Payments (filter "verify") where staff confirm
--    them with "Collect via UPI" (pay_collect_balance → PAID).

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

  IF preorder AND NEW.payment_method = 'pay_on_arrival' THEN
    RAISE EXCEPTION 'Cash payment is not available for food pre-orders. Please pay online with Razorpay or UPI.'
      USING ERRCODE = '23514', HINT = 'CASH_NOT_ALLOWED_FOR_PREORDER';
  END IF;
  RETURN NEW;
END;
$$;

-- Customer: "I have paid" by scanning the UPI QR. The phone must match the order.
CREATE OR REPLACE FUNCTION public.pay_claim_upi_qr(_code text, _phone text, _reference text DEFAULT NULL)
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
  IF b.status IN ('cancelled', 'no_show', 'expired', 'billed') THEN
    RAISE EXCEPTION 'NOT_PAYABLE:%', b.status USING ERRCODE = '22023';
  END IF;
  IF b.payment_state IN ('PAID', 'PARTIALLY_PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FORFEITED') OR b.payment_status = 'paid' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = '22023';
  END IF;
  IF b.payment_status = 'pending_verification' THEN
    RETURN jsonb_build_object('booking', to_jsonb(b));  -- tapped twice
  END IF;

  UPDATE public.bookings SET
    payment_method = 'upi_prepay',
    payment_status = 'pending_verification',
    payment_reference = nullif(btrim(coalesce(_reference, '')), ''),
    status = CASE WHEN status = 'pending_payment' THEN 'pending' ELSE status END,
    payment_expires_at = NULL
  WHERE id = b.id
  RETURNING * INTO b;

  PERFORM public.pay_audit(b.code, 'upi_qr_claimed', b.balance_due_paise, b.payment_reference, 'customer');
  RETURN jsonb_build_object('booking', to_jsonb(b));
END;
$$;

-- Payments list for Admin, newest first, plus totals. Now also lists UPI QR orders.
CREATE OR REPLACE FUNCTION public.pay_list(_filter text DEFAULT 'all', _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH rows AS (
    SELECT b.code, b.name, b.phone, b.order_type::text AS order_type, b.status, b.payment_state,
           b.payment_method, b.payment_status, b.payment_reference,
           b.total_amount_paise, b.deposit_due_paise, b.amount_paid_paise, b.balance_due_paise,
           b.scheduled_at, b.forfeited_at, b.forfeit_reason, b.created_at,
           coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at) FROM public.payments p WHERE p.booking_id = b.id), '[]'::jsonb) AS payments,
           coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.payment_audit_log a WHERE a.booking_code = b.code), '[]'::jsonb) AS audit
    FROM public.bookings b
    WHERE (b.payment_required
           OR (b.payment_method = 'upi_prepay' AND b.payment_status IN ('pending_verification', 'paid')))
      AND CASE coalesce(_filter, 'all')
        WHEN 'paid' THEN b.payment_state IN ('PARTIALLY_PAID', 'PAID')
        WHEN 'refunded' THEN b.payment_state IN ('REFUNDED', 'PARTIALLY_REFUNDED')
        WHEN 'forfeited' THEN b.payment_state = 'FORFEITED'
        WHEN 'pending' THEN b.payment_state = 'PENDING' OR b.status IN ('pending_payment', 'expired')
                            OR b.payment_status = 'pending_verification'
        WHEN 'verify' THEN b.payment_status = 'pending_verification'
        ELSE true
      END
    ORDER BY b.created_at DESC
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
  FOREACH fn IN ARRAY ARRAY['pay_claim_upi_qr(text, text, text)', 'pay_list(text, integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END;
$$;

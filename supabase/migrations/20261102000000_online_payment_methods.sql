-- 20261102000000_online_payment_methods.sql
-- 1. Payment method rules: an order with a food pre-order may only be paid online
--    (online_razorpay = cards/netbanking/wallets, upi_razorpay = UPI) — never cash.
--    Table-only bookings keep every method. Mirrors getAllowedPaymentMethods()
--    in src/lib/payment-methods.ts. Violations raise check_violation → HTTP 400 from the API.
-- 2. Every online payment goes through the server (/api/payments): pay_prepare_checkout now also
--    prices full online payments (not only pre-order deposits) from menu_items on the server.

-- Orders that leave payment_method out get the right default from the trigger below
ALTER TABLE public.bookings ALTER COLUMN payment_method DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.order_has_preorder(_items jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) e
    WHERE coalesce(e->>'fulfillment', 'pre_ordered') = 'pre_ordered'
  );
$$;

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
  IF preorder AND NEW.payment_method NOT IN ('online_razorpay', 'upi_razorpay') THEN
    RAISE EXCEPTION 'Food pre-orders must be paid online with Razorpay or UPI.'
      USING ERRCODE = '23514', HINT = 'ONLINE_PAYMENT_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

-- "trg_check_…" sorts first, so the client's choice is checked before other BEFORE triggers run
DROP TRIGGER IF EXISTS trg_check_payment_method_rules ON public.bookings;
CREATE TRIGGER trg_check_payment_method_rules
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_payment_method_rules();

-- Validates an order can be paid online now; returns the server amount and any reusable Razorpay order.
-- * Pre-order deposit (payment_required): the deposit computed at insert (unchanged behaviour).
-- * Any other order paying online: the full order total priced from menu_items
--   (+ the table-hold deposit, at most ₹100), stored as total_amount_paise.
CREATE OR REPLACE FUNCTION public.pay_prepare_checkout(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  open_order public.payments;
  amount integer;
  kind text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF b.payment_required THEN
    IF b.status = 'pending_payment' AND b.payment_expires_at < now() THEN
      UPDATE public.bookings SET status = 'expired', payment_state = 'UNPAID' WHERE id = b.id;
      PERFORM public.pay_audit(b.code, 'expired', NULL, 'Unpaid after 15 minutes', 'system');
      RAISE EXCEPTION 'ORDER_EXPIRED' USING ERRCODE = '22023';
    END IF;
    IF b.status = 'expired' THEN
      RAISE EXCEPTION 'ORDER_EXPIRED' USING ERRCODE = '22023';
    END IF;
    IF b.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = '22023';
    END IF;
    amount := b.deposit_due_paise;
    kind := CASE WHEN b.deposit_due_paise >= b.total_amount_paise THEN 'full' ELSE 'deposit' END;
  ELSE
    IF b.payment_method NOT IN ('online_razorpay', 'upi_razorpay') THEN
      RAISE EXCEPTION 'NOT_AN_ONLINE_ORDER' USING ERRCODE = '22023';
    END IF;
    IF b.status IN ('cancelled', 'no_show', 'expired', 'billed') THEN
      RAISE EXCEPTION 'NOT_PAYABLE:%', b.status USING ERRCODE = '22023';
    END IF;
    IF b.payment_state IN ('PAID', 'PARTIALLY_PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FORFEITED') THEN
      RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = '22023';
    END IF;
    amount := CASE WHEN jsonb_array_length(coalesce(b.items, '[]'::jsonb)) > 0
                   THEN public.compute_order_total_paise(b.items, b.order_type::text) ELSE 0 END
              + CASE WHEN b.deposit_required THEN LEAST(GREATEST(coalesce(b.deposit_amount, 0), 0), 100) * 100 ELSE 0 END;
    IF amount <= 0 THEN
      RAISE EXCEPTION 'NOTHING_TO_PAY' USING ERRCODE = '22023';
    END IF;
    kind := 'full';
    UPDATE public.bookings SET total_amount_paise = amount, payment_state = 'PENDING'
    WHERE id = b.id RETURNING * INTO b;
  END IF;

  SELECT * INTO open_order FROM public.payments
    WHERE booking_id = b.id AND status IN ('created', 'failed') AND amount_paise = amount
      AND razorpay_order_id IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'booking', to_jsonb(b),
    'amount_paise', amount,
    'kind', kind,
    'razorpay_order_id', open_order.razorpay_order_id,
    'expires_at', b.payment_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_prepare_checkout(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.pay_prepare_checkout(text) FROM anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.pay_prepare_checkout(text) TO service_role;
  END IF;
END$$;

-- 20261101000000_billed_status.sql
-- Admin flow: pending → confirmed → completed → billed (cancelled is a separate end state).
-- * Generating the bill (inserting the CQ-BILL- receipt) moves the order to 'billed' in the
--   same transaction, so an order is billed exactly when its bill exists.
-- * 'billed' and 'cancelled' are final for every role (including the /api service role):
--   a cancelled order can never be completed or billed.
-- Mirrors ORDER_STATUS_TRANSITIONS in src/lib/bookings.functions.ts.

CREATE OR REPLACE FUNCTION public.order_status_transition_allowed(_from text, _to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _from IS NOT DISTINCT FROM _to OR (_from, _to) IN (
    ('pending', 'confirmed'),
    ('pending', 'cancelled'),
    ('confirmed', 'completed'),
    ('confirmed', 'cancelled'),
    ('confirmed', 'no_show'),
    ('completed', 'billed'),
    -- unpaid pre-orders may be abandoned
    ('pending_payment', 'cancelled'),
    ('expired', 'cancelled')
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_status_flow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  from_status text;
BEGIN
  -- End states hold for everyone
  IF TG_OP = 'UPDATE' AND OLD.status IN ('billed', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION:% -> %', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;

  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Every new order waits for an admin to confirm it
    -- (pre-orders needing payment are then parked as pending_payment by trg_prepare_preorder_payment)
    NEW.status := 'pending';
    RETURN NEW;
  END IF;

  from_status := coalesce(OLD.status, 'confirmed');
  IF NOT public.order_status_transition_allowed(from_status, NEW.status) THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION:% -> %', from_status, NEW.status USING ERRCODE = '42501';
  END IF;

  -- 'billed' is only reached by generating the bill
  IF NEW.status = 'billed' AND from_status <> 'billed' AND NOT EXISTS (
    SELECT 1 FROM public.receipts WHERE booking_code = NEW.code AND receipt_number LIKE 'CQ-BILL-%'
  ) THEN
    RAISE EXCEPTION 'BILL_NOT_GENERATED' USING ERRCODE = '42501';
  END IF;

  -- The kitchen only works on confirmed orders
  IF OLD.status = 'pending'
     AND (NEW.items IS DISTINCT FROM OLD.items OR NEW.kitchen_status IS DISTINCT FROM OLD.kitchen_status) THEN
    RAISE EXCEPTION 'ORDER_NOT_CONFIRMED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Bills: only for completed (not yet billed) orders; one per order (uniq_receipts_one_bill_per_order); final
CREATE OR REPLACE FUNCTION public.enforce_bill_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  order_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.receipt_number LIKE 'CQ-BILL-%' AND current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'BILL_IS_FINAL' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.receipt_number LIKE 'CQ-BILL-%' THEN
    SELECT status INTO order_status FROM public.bookings WHERE code = NEW.booking_code;
    IF order_status IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION 'BILL_NOT_ALLOWED:%', coalesce(order_status, 'not found') USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Saving the bill marks the order billed (same transaction as the insert)
CREATE OR REPLACE FUNCTION public.mark_order_billed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.receipt_number LIKE 'CQ-BILL-%' THEN
    UPDATE public.bookings SET status = 'billed' WHERE code = NEW.booking_code AND status = 'completed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_order_billed ON public.receipts;
CREATE TRIGGER trg_mark_order_billed
  AFTER INSERT ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_order_billed();

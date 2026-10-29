-- 20261031000000_order_status_flow.sql
-- Admin order flow: pending → confirmed → completed (no skipping), and one saved bill per
-- completed order. The browser uses the public (anon) key, so the rules live here.
-- Mirrors ORDER_STATUS_TRANSITIONS in src/lib/bookings.functions.ts.
-- The service role (/api payment functions) is not restricted.

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
    -- unpaid pre-orders may be abandoned
    ('pending_payment', 'cancelled'),
    ('expired', 'cancelled')
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_status_flow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Every new order waits for an admin to confirm it
    -- (pre-orders needing payment are then parked as pending_payment by trg_prepare_preorder_payment)
    NEW.status := 'pending';
    RETURN NEW;
  END IF;

  IF NOT public.order_status_transition_allowed(coalesce(OLD.status, 'confirmed'), NEW.status) THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION:% -> %', coalesce(OLD.status, 'confirmed'), NEW.status
      USING ERRCODE = '42501';
  END IF;

  -- The kitchen only works on confirmed orders
  IF OLD.status = 'pending'
     AND (NEW.items IS DISTINCT FROM OLD.items OR NEW.kitchen_status IS DISTINCT FROM OLD.kitchen_status) THEN
    RAISE EXCEPTION 'ORDER_NOT_CONFIRMED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Named to run before trg_prepare_preorder_payment (BEFORE triggers fire in name order)
DROP TRIGGER IF EXISTS trg_order_status_flow ON public.bookings;
CREATE TRIGGER trg_order_status_flow
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_status_flow();

-- ─── Bills: only for completed orders, saved once ─────────────────────────────
-- Bills are receipts whose number starts with CQ-BILL- (payment receipts use CQ-RCP-).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_receipts_one_bill_per_order
  ON public.receipts (booking_code) WHERE receipt_number LIKE 'CQ-BILL-%';

CREATE OR REPLACE FUNCTION public.enforce_bill_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.receipt_number LIKE 'CQ-BILL-%' AND current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'BILL_IS_FINAL' USING ERRCODE = '42501';
  END IF;
  IF NEW.receipt_number LIKE 'CQ-BILL-%'
     AND NOT EXISTS (SELECT 1 FROM public.bookings WHERE code = NEW.booking_code AND status = 'completed') THEN
    RAISE EXCEPTION 'BILL_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_bill_rules ON public.receipts;
CREATE TRIGGER trg_enforce_bill_rules
  BEFORE INSERT OR UPDATE ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_bill_rules();

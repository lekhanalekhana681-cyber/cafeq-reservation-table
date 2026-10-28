-- 20261030000000_preorder_payments.sql
-- Online deposit / prepayment for pre-orders (orders with a future pickup or arrival time).
--
-- * The DB decides whether an order needs payment and computes every amount from menu_items
--   prices (never from the client). Amounts are integer paise.
-- * A pre-order is inserted as status 'pending_payment' and only becomes 'confirmed'
--   (visible on the KDS) once a Razorpay payment is captured by the server.
-- * All payment state changes go through the pay_* functions below, which only the
--   service role (the /api serverless functions) may execute.
-- * Orders that do not require payment keep their existing behaviour (payment_state UNPAID).

-- ─── 1. Settings (editable from Admin › Payments) ─────────────────────────────
INSERT INTO public.cafe_settings (key, value) VALUES
  ('preorder_payment_mode', 'DEPOSIT'),
  ('deposit_percent', '30'),
  ('deposit_min_inr', '50'),
  ('refund_cutoff_minutes', '30')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cafe_setting_number(_key text, _fallback numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT value::numeric FROM public.cafe_settings
      WHERE key = _key AND value ~ '^\s*\d+(\.\d+)?\s*$'),
    _fallback
  );
$$;

CREATE OR REPLACE FUNCTION public.preorder_payment_mode()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN m IN ('NONE', 'DEPOSIT', 'FULL') THEN m ELSE 'DEPOSIT' END
  FROM (SELECT upper(btrim(coalesce(
    (SELECT value FROM public.cafe_settings WHERE key = 'preorder_payment_mode'), 'DEPOSIT'))) AS m) s;
$$;

-- ─── 2. Order columns ────────────────────────────────────────────────────────
-- bookings.payment_status (legacy: pending_cash / pending_qr / paid / ...) is kept for the
-- existing receipt and admin screens; payment_state is the new money state of the order.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS total_amount_paise integer,
  ADD COLUMN IF NOT EXISTS deposit_due_paise integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid_paise integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS forfeited_at timestamptz,
  ADD COLUMN IF NOT EXISTS forfeit_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'balance_due_paise') THEN
    ALTER TABLE public.bookings
      ADD COLUMN balance_due_paise integer
      GENERATED ALWAYS AS (GREATEST(coalesce(total_amount_paise, 0) - amount_paid_paise, 0)) STORED;
  END IF;
END$$;

-- Existing orders: nothing paid online, total mirrored from the rupee total
UPDATE public.bookings SET total_amount_paise = coalesce(total, 0) * 100 WHERE total_amount_paise IS NULL;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_state_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_state_check CHECK (payment_state IN
  ('UNPAID', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FORFEITED'));
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_amounts_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_amounts_check
  CHECK (deposit_due_paise >= 0 AND amount_paid_paise >= 0 AND coalesce(total_amount_paise, 0) >= 0);

CREATE INDEX IF NOT EXISTS idx_bookings_pending_payment
  ON public.bookings(payment_expires_at) WHERE status = 'pending_payment';

-- ─── 3. Payment tables (service role only; no anon policies) ─────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  booking_code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deposit', 'full', 'balance')),
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text UNIQUE,
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'captured', 'failed', 'refunded', 'partially_refunded')),
  method text,
  refund_id text,
  refunded_amount_paise integer NOT NULL DEFAULT 0 CHECK (refunded_amount_paise >= 0),
  error_reason text,
  collected_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_captured_at ON public.payments(captured_at);

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  refund_id text PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  actor text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Webhook idempotency: one row per Razorpay event id
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  event_id text PRIMARY KEY,
  event text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text NOT NULL,
  action text NOT NULL,
  amount_paise integer,
  reason text,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_audit_booking ON public.payment_audit_log(booking_code);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_log ENABLE ROW LEVEL SECURITY;

-- ─── 4. Pricing & pre-order rules (mirrored in src/lib/prepayment.ts) ────────

-- When the customer is due at the cafe, in IST. Delivery orders have no pickup/arrival.
CREATE OR REPLACE FUNCTION public.preorder_scheduled_at(
  _order_type text, _date date, _time text, _pickup text, _now timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  p text := lower(btrim(coalesce(_pickup, '')));
  m text[];
  h int;
  t timestamptz;
BEGIN
  IF _order_type = 'DINE_IN' THEN
    m := regexp_match(coalesce(_time, ''), '^(\d{1,2}):(\d{2})');
    IF m IS NULL OR _date IS NULL THEN RETURN NULL; END IF;
    RETURN (_date + make_time(m[1]::int, m[2]::int, 0)) AT TIME ZONE 'Asia/Kolkata';
  END IF;

  IF _order_type = 'TAKEAWAY' THEN
    m := regexp_match(p, 'in\s+(\d+)\s*min');
    IF m IS NOT NULL THEN RETURN _now + make_interval(mins => m[1]::int); END IF;
    m := regexp_match(p, 'in\s+(\d+)\s*h');
    IF m IS NOT NULL THEN RETURN _now + make_interval(hours => m[1]::int); END IF;
    m := regexp_match(p, '(\d{1,2})[:.](\d{2})\s*(am|pm)?');
    IF m IS NOT NULL THEN
      h := m[1]::int % 12 + CASE WHEN m[3] = 'pm' THEN 12 WHEN m[3] IS NULL AND m[1]::int = 12 THEN 12 ELSE 0 END;
      IF h <= 23 AND m[2]::int <= 59 THEN
        t := ((_now AT TIME ZONE 'Asia/Kolkata')::date + make_time(h, m[2]::int, 0)) AT TIME ZONE 'Asia/Kolkata';
        IF t > _now THEN RETURN t; END IF;
      END IF;
    END IF;
    -- "ASAP", blank or unparseable: typical prep time
    RETURN _now + interval '20 minutes';
  END IF;

  RETURN NULL;
END;
$$;

-- A pre-order has food to prepare ahead and a pickup or arrival in the future.
-- Dine-in orders placed at the cafe (arrival now/past, or nothing pre-ordered) are not pre-orders.
CREATE OR REPLACE FUNCTION public.is_preorder(_items jsonb, _order_type text, _scheduled_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) e
      WHERE coalesce(e->>'fulfillment', 'pre_ordered') = 'pre_ordered'
    )
    AND (
      _order_type = 'TAKEAWAY'
      OR (_order_type = 'DINE_IN' AND _scheduled_at IS NOT NULL AND _scheduled_at > now() + interval '15 minutes')
    );
$$;

-- Order total in paise from menu_items prices (whole rupees per unit, like the menu shows)
-- plus the order-type charge. Unknown or 86'd items are rejected.
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

  IF _order_type = 'TAKEAWAY' THEN
    total := total + public.cafe_setting_amount('packaging_charge', 0) * 100;
  ELSIF _order_type = 'DELIVERY' THEN
    total := total + public.cafe_setting_amount('delivery_fee', 40) * 100;
  END IF;
  RETURN total::int;
END;
$$;

-- Amount due online now, rounded to whole rupees and never more than the total.
CREATE OR REPLACE FUNCTION public.compute_deposit_paise(_total integer, _mode text, _percent numeric, _min_inr numeric)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(_mode)
    WHEN 'FULL' THEN _total
    WHEN 'DEPOSIT' THEN LEAST(_total, GREATEST(round(_min_inr) * 100, round(_total * _percent / 10000.0) * 100))::int
    ELSE 0
  END;
$$;

-- ─── 5. Insert trigger: decide payment, price server-side, park unpaid pre-orders ──
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
      NEW.total := NEW.total_amount_paise / 100;
      NEW.deposit_required := false;
      NEW.deposit_amount := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_preorder_payment ON public.bookings;
CREATE TRIGGER trg_prepare_preorder_payment
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_preorder_payment();

-- ─── 6. Update guard: the public (anon) key cannot touch money or skip payment ──
CREATE OR REPLACE FUNCTION public.guard_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_required IS DISTINCT FROM OLD.payment_required
     OR NEW.payment_state IS DISTINCT FROM OLD.payment_state
     OR NEW.total_amount_paise IS DISTINCT FROM OLD.total_amount_paise
     OR NEW.deposit_due_paise IS DISTINCT FROM OLD.deposit_due_paise
     OR NEW.amount_paid_paise IS DISTINCT FROM OLD.amount_paid_paise
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.payment_expires_at IS DISTINCT FROM OLD.payment_expires_at
     OR NEW.forfeited_at IS DISTINCT FROM OLD.forfeited_at
     OR NEW.forfeit_reason IS DISTINCT FROM OLD.forfeit_reason THEN
    RAISE EXCEPTION 'PAYMENT_FIELDS_READ_ONLY' USING ERRCODE = '42501';
  END IF;

  IF OLD.payment_required THEN
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.total IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'PAYMENT_FIELDS_READ_ONLY' USING ERRCODE = '42501';
    END IF;
    -- Unpaid pre-orders may only be abandoned/cancelled, never sent to the kitchen
    IF OLD.status IN ('pending_payment', 'expired') THEN
      IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled')
         OR NEW.items IS DISTINCT FROM OLD.items
         OR NEW.kitchen_status IS DISTINCT FROM OLD.kitchen_status THEN
        RAISE EXCEPTION 'PAYMENT_REQUIRED' USING ERRCODE = '42501';
      END IF;
    -- Paid pre-orders are cancelled / no-showed through /api/payments (refund or forfeit)
    ELSIF OLD.amount_paid_paise > 0
          AND NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('cancelled', 'no_show') THEN
      RAISE EXCEPTION 'PAID_ORDER_USE_PAYMENTS' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payment_fields ON public.bookings;
CREATE TRIGGER trg_guard_payment_fields
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_payment_fields();

-- ─── 7. Payment operations (called by /api with the service role) ────────────

CREATE OR REPLACE FUNCTION public.pay_audit(_code text, _action text, _amount integer, _reason text, _actor text)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.payment_audit_log (booking_code, action, amount_paise, reason, actor)
  VALUES (_code, _action, _amount, _reason, coalesce(_actor, 'system'));
$$;

-- Payment view of one order (+ policy settings)
CREATE OR REPLACE FUNCTION public.pay_get_order(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  b public.bookings;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE code = _code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'booking', to_jsonb(b),
    'payments', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at) FROM public.payments p WHERE p.booking_id = b.id), '[]'::jsonb),
    'refund_cutoff_minutes', public.cafe_setting_number('refund_cutoff_minutes', 30)
  );
END;
$$;

-- Validates an order can be paid now; returns the server amount and any reusable Razorpay order.
CREATE OR REPLACE FUNCTION public.pay_prepare_checkout(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  open_order public.payments;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT b.payment_required THEN
    RAISE EXCEPTION 'PAYMENT_NOT_REQUIRED' USING ERRCODE = '22023';
  END IF;
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

  SELECT * INTO open_order FROM public.payments
    WHERE booking_id = b.id AND status IN ('created', 'failed') AND amount_paise = b.deposit_due_paise
      AND razorpay_order_id IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'booking', to_jsonb(b),
    'amount_paise', b.deposit_due_paise,
    'kind', CASE WHEN b.deposit_due_paise >= b.total_amount_paise THEN 'full' ELSE 'deposit' END,
    'razorpay_order_id', open_order.razorpay_order_id,
    'expires_at', b.payment_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_record_order(_code text, _razorpay_order_id text, _amount_paise integer, _kind text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p public.payments;
BEGIN
  INSERT INTO public.payments (booking_id, booking_code, kind, razorpay_order_id, amount_paise)
  SELECT id, code, _kind, _razorpay_order_id, _amount_paise FROM public.bookings WHERE code = _code
  RETURNING * INTO p;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN to_jsonb(p);
END;
$$;

-- Captured online payment. Idempotent: the verify call and the webhook may both arrive.
CREATE OR REPLACE FUNCTION public.pay_mark_captured(
  _razorpay_order_id text, _razorpay_payment_id text, _amount_paise integer, _method text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p public.payments;
  b public.bookings;
  paid integer;
  needs_refund boolean := false;
  was_parked boolean;
BEGIN
  SELECT * INTO p FROM public.payments WHERE razorpay_order_id = _razorpay_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p.booking_id FOR UPDATE;

  IF p.status IN ('captured', 'refunded', 'partially_refunded') THEN
    RETURN jsonb_build_object('already_processed', true, 'needs_refund', false,
                              'booking', to_jsonb(b), 'payment', to_jsonb(p));
  END IF;
  IF _amount_paise <> p.amount_paise THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  UPDATE public.payments SET
    status = 'captured', razorpay_payment_id = _razorpay_payment_id, method = _method,
    captured_at = now(), updated_at = now(), error_reason = NULL
  WHERE id = p.id RETURNING * INTO p;

  paid := b.amount_paid_paise + _amount_paise;
  was_parked := b.status IN ('pending_payment', 'expired');
  -- Paid after expiry and the pickup/arrival time has gone: refund instead of cooking.
  -- Paid for an order the customer already cancelled: refund.
  needs_refund := b.status = 'cancelled'
    OR (b.status = 'expired' AND b.scheduled_at IS NOT NULL AND b.scheduled_at < now());

  UPDATE public.bookings SET
    amount_paid_paise = paid,
    payment_state = CASE WHEN paid >= coalesce(total_amount_paise, 0) THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
    payment_status = CASE WHEN paid >= coalesce(total_amount_paise, 0) THEN 'paid' ELSE 'pending_cash' END,
    payment_reference = _razorpay_payment_id,
    status = CASE WHEN was_parked AND NOT needs_refund THEN 'confirmed' ELSE status END,
    kitchen_status = CASE WHEN was_parked AND NOT needs_refund THEN 'new' ELSE kitchen_status END,
    payment_expires_at = NULL
  WHERE id = b.id RETURNING * INTO b;

  PERFORM public.pay_audit(b.code, 'payment_captured', _amount_paise, _method, 'razorpay');
  RETURN jsonb_build_object('already_processed', false, 'needs_refund', needs_refund,
                            'booking', to_jsonb(b), 'payment', to_jsonb(p));
END;
$$;

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
    PERFORM public.pay_audit(p.booking_code, 'payment_failed', p.amount_paise, _reason, 'razorpay');
  END IF;
  RETURN coalesce(to_jsonb(p), '{}'::jsonb);
END;
$$;

-- Returns false if this webhook event was already handled
CREATE OR REPLACE FUNCTION public.pay_register_event(_event_id text, _event text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payment_webhook_events (event_id, event) VALUES (_event_id, _event);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

-- Un-registers an event whose processing failed, so Razorpay's retry is handled
CREATE OR REPLACE FUNCTION public.pay_forget_event(_event_id text)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  DELETE FROM public.payment_webhook_events WHERE event_id = _event_id;
$$;

-- Decides refund vs forfeit for a cancellation and lists what can be refunded.
-- _actor 'cafe' always refunds in full; customers get a refund only before the cutoff.
CREATE OR REPLACE FUNCTION public.pay_cancel_plan(_code text, _actor text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  cutoff timestamptz;
  refundable jsonb;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE code = _code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF b.status IN ('cancelled', 'no_show', 'completed', 'expired') THEN
    RAISE EXCEPTION 'NOT_CANCELLABLE:%', b.status USING ERRCODE = '22023';
  END IF;

  cutoff := b.scheduled_at - make_interval(mins => public.cafe_setting_number('refund_cutoff_minutes', 30)::int);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'payment_id', p.id, 'razorpay_payment_id', p.razorpay_payment_id,
           'amount_paise', p.amount_paise - p.refunded_amount_paise)), '[]'::jsonb)
    INTO refundable
    FROM public.payments p
    WHERE p.booking_id = b.id AND p.razorpay_payment_id IS NOT NULL
      AND p.status IN ('captured', 'partially_refunded') AND p.amount_paise > p.refunded_amount_paise;

  RETURN jsonb_build_object(
    'booking', to_jsonb(b),
    'cutoff_at', cutoff,
    'refundable', refundable,
    'action', CASE
      WHEN NOT b.payment_required OR jsonb_array_length(refundable) = 0 THEN 'none'
      WHEN _actor = 'cafe' OR cutoff IS NULL OR now() < cutoff THEN 'refund'
      ELSE 'forfeit'
    END
  );
END;
$$;

-- Records a refund created through the Razorpay API or reported by the refund.processed webhook.
CREATE OR REPLACE FUNCTION public.pay_apply_refund(
  _razorpay_payment_id text, _refund_id text, _amount_paise integer, _processed boolean, _actor text, _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p public.payments;
  b public.bookings;
  inserted boolean := true;
  net_online integer;
BEGIN
  SELECT * INTO p FROM public.payments WHERE razorpay_payment_id = _razorpay_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    INSERT INTO public.payment_refunds (refund_id, payment_id, amount_paise, status, actor, reason, processed_at)
    VALUES (_refund_id, p.id, _amount_paise, CASE WHEN _processed THEN 'processed' ELSE 'pending' END,
            _actor, _reason, CASE WHEN _processed THEN now() END);
  EXCEPTION WHEN unique_violation THEN
    inserted := false;
    IF _processed THEN
      UPDATE public.payment_refunds SET status = 'processed', processed_at = coalesce(processed_at, now())
      WHERE refund_id = _refund_id;
    END IF;
  END;

  SELECT * INTO b FROM public.bookings WHERE id = p.booking_id FOR UPDATE;
  IF NOT inserted THEN
    RETURN jsonb_build_object('already_processed', true, 'booking', to_jsonb(b), 'payment', to_jsonb(p));
  END IF;
  IF p.refunded_amount_paise + _amount_paise > p.amount_paise THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_PAYMENT' USING ERRCODE = '22023';
  END IF;

  UPDATE public.payments SET
    refunded_amount_paise = refunded_amount_paise + _amount_paise,
    refund_id = _refund_id,
    status = CASE WHEN refunded_amount_paise + _amount_paise >= amount_paise THEN 'refunded' ELSE 'partially_refunded' END,
    updated_at = now()
  WHERE id = p.id RETURNING * INTO p;

  SELECT coalesce(sum(amount_paise - refunded_amount_paise), 0) INTO net_online
    FROM public.payments WHERE booking_id = b.id AND razorpay_payment_id IS NOT NULL
      AND status IN ('captured', 'partially_refunded', 'refunded');

  UPDATE public.bookings SET
    amount_paid_paise = GREATEST(amount_paid_paise - _amount_paise, 0),
    payment_state = CASE WHEN net_online = 0 THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
    payment_status = CASE WHEN net_online = 0 THEN 'refunded' ELSE payment_status END
  WHERE id = b.id RETURNING * INTO b;

  PERFORM public.pay_audit(b.code, 'refund', _amount_paise, _reason, _actor);
  RETURN jsonb_build_object('already_processed', false, 'booking', to_jsonb(b), 'payment', to_jsonb(p));
END;
$$;

-- Cancels / no-shows an order and optionally forfeits what was paid.
CREATE OR REPLACE FUNCTION public.pay_set_outcome(_code text, _status text, _forfeit boolean, _actor text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
BEGIN
  IF _status IS NOT NULL AND _status NOT IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF _forfeit AND b.amount_paid_paise = 0 THEN
    RAISE EXCEPTION 'NOTHING_TO_FORFEIT' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings SET
    status = coalesce(_status, status),
    kitchen_status = CASE WHEN _status = 'cancelled' THEN 'cancelled' ELSE kitchen_status END,
    cancellation_reason = CASE WHEN _status IS NOT NULL THEN coalesce(_reason, cancellation_reason) ELSE cancellation_reason END,
    cancelled_by = CASE WHEN _status = 'cancelled' THEN CASE WHEN _actor = 'customer' THEN 'customer' ELSE 'admin' END ELSE cancelled_by END,
    payment_state = CASE WHEN _forfeit THEN 'FORFEITED' ELSE payment_state END,
    forfeited_at = CASE WHEN _forfeit THEN now() ELSE forfeited_at END,
    forfeit_reason = CASE WHEN _forfeit THEN _reason ELSE forfeit_reason END,
    payment_expires_at = NULL
  WHERE id = b.id RETURNING * INTO b;

  PERFORM public.pay_audit(b.code,
    CASE WHEN _forfeit THEN 'forfeit' WHEN _status = 'no_show' THEN 'no_show' ELSE 'cancelled' END,
    CASE WHEN _forfeit THEN b.amount_paid_paise END, _reason, _actor);
  RETURN jsonb_build_object('booking', to_jsonb(b));
END;
$$;

-- Cashier collects the remaining balance at the counter (cash or UPI).
CREATE OR REPLACE FUNCTION public.pay_collect_balance(_code text, _method text, _actor text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  p public.payments;
BEGIN
  IF _method NOT IN ('cash', 'upi') THEN
    RAISE EXCEPTION 'INVALID_METHOD' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF b.status IN ('pending_payment', 'expired', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'NOT_COLLECTABLE:%', b.status USING ERRCODE = '22023';
  END IF;
  IF b.balance_due_paise <= 0 THEN
    RAISE EXCEPTION 'NOTHING_DUE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payments (booking_id, booking_code, kind, amount_paise, status, method, collected_by, captured_at)
  VALUES (b.id, b.code, 'balance', b.balance_due_paise, 'captured', _method, _actor, now())
  RETURNING * INTO p;

  UPDATE public.bookings SET
    amount_paid_paise = amount_paid_paise + p.amount_paise,
    payment_state = 'PAID',
    payment_status = 'paid'
  WHERE id = b.id RETURNING * INTO b;

  PERFORM public.pay_audit(b.code, 'balance_collected', p.amount_paise, _method, _actor);
  RETURN jsonb_build_object('booking', to_jsonb(b), 'payment', to_jsonb(p));
END;
$$;

-- Payments list for Admin, newest first, plus totals.
CREATE OR REPLACE FUNCTION public.pay_list(_filter text DEFAULT 'all', _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH rows AS (
    SELECT b.code, b.name, b.phone, b.order_type::text AS order_type, b.status, b.payment_state,
           b.total_amount_paise, b.deposit_due_paise, b.amount_paid_paise, b.balance_due_paise,
           b.scheduled_at, b.forfeited_at, b.forfeit_reason, b.created_at,
           coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at) FROM public.payments p WHERE p.booking_id = b.id), '[]'::jsonb) AS payments,
           coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.payment_audit_log a WHERE a.booking_code = b.code), '[]'::jsonb) AS audit
    FROM public.bookings b
    WHERE b.payment_required
      AND CASE coalesce(_filter, 'all')
        WHEN 'paid' THEN b.payment_state IN ('PARTIALLY_PAID', 'PAID')
        WHEN 'refunded' THEN b.payment_state IN ('REFUNDED', 'PARTIALLY_REFUNDED')
        WHEN 'forfeited' THEN b.payment_state = 'FORFEITED'
        WHEN 'pending' THEN b.payment_state = 'PENDING' OR b.status IN ('pending_payment', 'expired')
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

-- Daily IST summary of online deposits collected, refunded and forfeited.
CREATE OR REPLACE FUNCTION public.pay_daily_summary(_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - (_days - 1),
                           (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day')::date AS day
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day,
    'collected_paise', coalesce((SELECT sum(p.amount_paise) FROM public.payments p
       WHERE p.razorpay_payment_id IS NOT NULL AND p.captured_at IS NOT NULL
         AND (p.captured_at AT TIME ZONE 'Asia/Kolkata')::date = d.day), 0),
    'refunded_paise', coalesce((SELECT sum(r.amount_paise) FROM public.payment_refunds r
       WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata')::date = d.day), 0),
    'forfeited_paise', coalesce((SELECT sum(b.amount_paid_paise) FROM public.bookings b
       WHERE b.payment_state = 'FORFEITED' AND (b.forfeited_at AT TIME ZONE 'Asia/Kolkata')::date = d.day), 0)
  ) ORDER BY d.day DESC), '[]'::jsonb)
  FROM days d;
$$;

CREATE OR REPLACE FUNCTION public.pay_update_settings(_settings jsonb, _actor text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  mode text := upper(coalesce(_settings->>'preorder_payment_mode', public.preorder_payment_mode()));
  pct numeric := coalesce((_settings->>'deposit_percent')::numeric, public.cafe_setting_number('deposit_percent', 30));
  min_inr numeric := coalesce((_settings->>'deposit_min_inr')::numeric, public.cafe_setting_number('deposit_min_inr', 50));
  cutoff numeric := coalesce((_settings->>'refund_cutoff_minutes')::numeric, public.cafe_setting_number('refund_cutoff_minutes', 30));
BEGIN
  IF mode NOT IN ('NONE', 'DEPOSIT', 'FULL') THEN RAISE EXCEPTION 'INVALID_SETTING:preorder_payment_mode' USING ERRCODE = '22023'; END IF;
  IF pct < 1 OR pct > 100 THEN RAISE EXCEPTION 'INVALID_SETTING:deposit_percent' USING ERRCODE = '22023'; END IF;
  IF min_inr < 0 OR min_inr > 100000 THEN RAISE EXCEPTION 'INVALID_SETTING:deposit_min_inr' USING ERRCODE = '22023'; END IF;
  IF cutoff < 0 OR cutoff > 10080 THEN RAISE EXCEPTION 'INVALID_SETTING:refund_cutoff_minutes' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.cafe_settings (key, value) VALUES
    ('preorder_payment_mode', mode),
    ('deposit_percent', round(pct)::text),
    ('deposit_min_inr', round(min_inr)::text),
    ('refund_cutoff_minutes', round(cutoff)::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  PERFORM public.pay_audit('SETTINGS', 'settings_updated', NULL, _settings::text, _actor);
  RETURN jsonb_build_object('preorder_payment_mode', mode, 'deposit_percent', round(pct),
                            'deposit_min_inr', round(min_inr), 'refund_cutoff_minutes', round(cutoff));
END;
$$;

-- Admin credential lookup for /api/payments/admin (password is checked with bcrypt in the function)
CREATE OR REPLACE FUNCTION public.pay_admin_user(_identifier text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', u.id, 'name', u.name, 'role', u.role,
                            'password_hash', u.password_hash, 'is_disabled', coalesce(u.is_disabled, false))
  FROM public.users u
  WHERE lower(u.email) = lower(btrim(_identifier))
     OR lower(to_jsonb(u)->>'username') = lower(btrim(_identifier))
  LIMIT 1;
$$;

-- ─── 8. Expire unpaid pre-orders after 15 minutes ─────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_unpaid_preorders()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH expired AS (
    UPDATE public.bookings SET status = 'expired', payment_state = 'UNPAID'
    WHERE status = 'pending_payment' AND payment_expires_at < now()
    RETURNING code
  ), logged AS (
    INSERT INTO public.payment_audit_log (booking_code, action, reason, actor)
    SELECT code, 'expired', 'Unpaid after 15 minutes', 'system' FROM expired
    RETURNING 1
  )
  SELECT count(*) INTO n FROM logged;
  RETURN n;
END;
$$;

-- Run every 5 minutes inside Postgres when pg_cron is enabled (Supabase › Database › Extensions)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('expire-unpaid-preorders', '*/5 * * * *', 'SELECT public.expire_unpaid_preorders()');
  END IF;
END$$;

-- ─── 9. Only the service role may run payment operations ─────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'pay_audit(text,text,integer,text,text)',
    'pay_get_order(text)',
    'pay_prepare_checkout(text)',
    'pay_record_order(text,text,integer,text)',
    'pay_mark_captured(text,text,integer,text)',
    'pay_mark_failed(text,text,text)',
    'pay_register_event(text,text)',
    'pay_forget_event(text)',
    'pay_cancel_plan(text,text)',
    'pay_apply_refund(text,text,integer,boolean,text,text)',
    'pay_set_outcome(text,text,boolean,text,text)',
    'pay_collect_balance(text,text,text)',
    'pay_list(text,integer)',
    'pay_daily_summary(integer)',
    'pay_update_settings(jsonb,text)',
    'pay_admin_user(text)',
    'expire_unpaid_preorders()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    END IF;
  END LOOP;
END$$;

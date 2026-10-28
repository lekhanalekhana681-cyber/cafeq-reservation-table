-- 20261028000000_enforce_order_type_rules.sql
-- 1. Converts bookings.order_type to the order_type_enum (DINE_IN | TAKEAWAY | DELIVERY), NOT NULL, default DINE_IN.
-- 2. Enforces per-type order rules on insert. The app talks to Supabase straight from the browser,
--    so this trigger is the only server-side check; it mirrors validateOrderDetails() in src/lib/order-types.ts.

-- The earlier migration created a SELECT * view over bookings. Views run with the owner's
-- privileges and bypass bookings RLS, and it also blocks the column type change below.
DROP VIEW IF EXISTS public.orders;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type_enum') THEN
        CREATE TYPE public.order_type_enum AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY');
    END IF;
END$$;

-- Legacy values ('dine_in', 'take-away', NULL, ...) are normalized in the cast; existing orders become DINE_IN.
ALTER TABLE public.bookings ALTER COLUMN order_type DROP DEFAULT;
ALTER TABLE public.bookings
  ALTER COLUMN order_type TYPE public.order_type_enum USING (
    CASE upper(regexp_replace(coalesce(order_type::text, ''), '[\s-]', '_', 'g'))
      WHEN 'TAKEAWAY'  THEN 'TAKEAWAY'
      WHEN 'TAKE_AWAY' THEN 'TAKEAWAY'
      WHEN 'DELIVERY'  THEN 'DELIVERY'
      ELSE 'DINE_IN'
    END
  )::public.order_type_enum;
ALTER TABLE public.bookings ALTER COLUMN order_type SET DEFAULT 'DINE_IN';
ALTER TABLE public.bookings ALTER COLUMN order_type SET NOT NULL;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_order_charges_non_negative;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_order_charges_non_negative
  CHECK (coalesce(delivery_fee, 0) >= 0 AND coalesce(packaging_charge, 0) >= 0);

-- Reads a whole-rupee amount from cafe_settings, falling back when missing or malformed.
CREATE OR REPLACE FUNCTION public.cafe_setting_amount(_key text, _fallback numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT round(value::numeric) FROM public.cafe_settings
      WHERE key = _key AND value ~ '^\s*\d+(\.\d+)?\s*$'),
    _fallback
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_type_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_delivery_fee numeric := 0;
  v_packaging numeric := 0;
BEGIN
  NEW.customer_name := nullif(btrim(coalesce(NEW.customer_name, NEW.name)), '');
  NEW.customer_phone := nullif(btrim(coalesce(NEW.customer_phone, NEW.phone)), '');

  IF NEW.customer_name IS NULL THEN
    RAISE EXCEPTION 'Please enter your name.' USING ERRCODE = 'check_violation';
  END IF;

  -- Indian mobile: optional +91 / 91 / 0 prefix, then 10 digits starting 6-9
  v_digits := regexp_replace(coalesce(NEW.customer_phone, ''), '\D', '', 'g');
  IF length(v_digits) = 12 AND left(v_digits, 2) = '91' THEN
    v_digits := right(v_digits, 10);
  ELSIF length(v_digits) = 11 AND left(v_digits, 1) = '0' THEN
    v_digits := right(v_digits, 10);
  END IF;
  IF v_digits !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Enter a valid 10-digit mobile number (e.g. +91 98765 43210).' USING ERRCODE = 'check_violation';
  END IF;

  CASE NEW.order_type
    WHEN 'DINE_IN' THEN
      NEW.table_number := nullif(btrim(NEW.table_number), '');
      IF NEW.table_number IS NULL THEN
        RAISE EXCEPTION 'Table number is required for Dine-in (e.g. 4 or T-12).' USING ERRCODE = 'check_violation';
      END IF;
      NEW.pickup_time := NULL;
      NEW.delivery_address := NULL;
      NEW.delivery_instructions := NULL;

    WHEN 'TAKEAWAY' THEN
      IF jsonb_array_length(coalesce(NEW.items, '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'Your cart is empty. Add at least one item to place a takeaway order.' USING ERRCODE = 'check_violation';
      END IF;
      v_packaging := public.cafe_setting_amount('packaging_charge', 0);
      NEW.table_number := NULL;
      NEW.delivery_address := NULL;
      NEW.delivery_instructions := NULL;

    WHEN 'DELIVERY' THEN
      IF jsonb_array_length(coalesce(NEW.items, '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'Your cart is empty. Add at least one item to place a delivery order.' USING ERRCODE = 'check_violation';
      END IF;
      NEW.delivery_address := nullif(btrim(NEW.delivery_address), '');
      IF NEW.delivery_address IS NULL THEN
        RAISE EXCEPTION 'Delivery address is required for delivery.' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.delivery_address !~ '(^|[^0-9])[1-9][0-9]{5}([^0-9]|$)' THEN
        RAISE EXCEPTION 'Delivery address must include a valid 6-digit pincode.' USING ERRCODE = 'check_violation';
      END IF;
      v_delivery_fee := public.cafe_setting_amount('delivery_fee', 40);
      NEW.table_number := NULL;
      NEW.pickup_time := NULL;
  END CASE;

  -- The client's total already includes these charges, so a mismatch means a stale or tampered total.
  IF coalesce(NEW.delivery_fee, 0) <> v_delivery_fee OR coalesce(NEW.packaging_charge, 0) <> v_packaging THEN
    RAISE EXCEPTION 'Delivery or packaging charges have changed. Please review your order total and try again.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.delivery_fee := v_delivery_fee;
  NEW.packaging_charge := v_packaging;

  RETURN NEW;
END;
$$;

-- Insert-only: legacy rows pre-date these rules, and status updates must keep working on them.
DROP TRIGGER IF EXISTS trg_enforce_order_type_rules ON public.bookings;
CREATE TRIGGER trg_enforce_order_type_rules
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_type_rules();

-- 20261029000000_per_item_kitchen_status.sql
-- Per-item kitchen tracking for the KDS.
-- Each element of bookings.items gets its own status:
--   PENDING → PREPARING → READY → SERVED   (any unfinished item may be CANCELLED)
-- plus startedAt / readyAt / servedAt / cancelledAt timestamps (ISO strings in the JSON).
-- bookings.kitchen_status is derived from the items and stored for filtering and realtime.
-- Mirrors src/lib/order-items.ts.

-- 1. Ticket-level kitchen columns (the app already used these fields; they never existed in the DB)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS kitchen_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by text;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_kitchen_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_kitchen_status_check
  CHECK (kitchen_status IN ('new', 'preparing', 'ready', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_bookings_kitchen_status ON public.bookings(kitchen_status);

-- 2. Rules
CREATE OR REPLACE FUNCTION public.kds_item_transition_allowed(_from text, _to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _to = 'CANCELLED' THEN _from NOT IN ('SERVED', 'CANCELLED')
    ELSE (_from, _to) IN (('PENDING', 'PREPARING'), ('PREPARING', 'READY'), ('READY', 'SERVED'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.kds_derive_ticket_status(_items jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH s AS (
    SELECT e->>'status' AS status
    FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) AS e
  ), live AS (
    SELECT status FROM s WHERE status IS DISTINCT FROM 'CANCELLED'
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM s) = 0 THEN 'new'
    WHEN (SELECT count(*) FROM live) = 0 THEN 'cancelled'
    WHEN (SELECT bool_and(status = 'PENDING') FROM live) THEN 'new'
    WHEN (SELECT bool_and(status = 'SERVED') FROM live) THEN 'completed'
    WHEN (SELECT bool_and(status IN ('READY', 'SERVED')) FROM live) THEN 'ready'
    ELSE 'preparing'
  END;
$$;

-- 3. Backfill: items saved before per-item tracking had "pending"/"done" (or no status).
--    Infer each item's stage from its order so existing tickets keep their place.
UPDATE public.bookings b
SET items = (
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN e->>'status' IN ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED') THEN e
      ELSE e || jsonb_build_object('status',
        CASE
          WHEN b.status = 'cancelled' THEN 'CANCELLED'
          WHEN b.status = 'completed' THEN 'SERVED'
          WHEN e->>'status' = 'done' THEN 'READY'
          ELSE 'PENDING'
        END)
    END
    ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(b.items) WITH ORDINALITY AS t(e, ord)
)
WHERE jsonb_typeof(b.items) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(b.items) AS e
    WHERE e->>'status' IS NULL OR e->>'status' NOT IN ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED')
  );

UPDATE public.bookings
SET kitchen_status = CASE
    WHEN status = 'cancelled' THEN 'cancelled'
    WHEN status = 'completed' THEN 'completed'
    ELSE public.kds_derive_ticket_status(items)
  END;

-- 4. New orders always enter the kitchen with every item pending
CREATE OR REPLACE FUNCTION public.kds_reset_new_order_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.items := (
    SELECT coalesce(jsonb_agg(
      (e - 'startedAt' - 'readyAt' - 'servedAt' - 'cancelledAt') || jsonb_build_object('status', 'PENDING')
      ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
  );
  NEW.kitchen_status := 'new';
  NEW.accepted_at := NULL;
  NEW.ready_at := NULL;
  NEW.completed_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kds_reset_new_order_items ON public.bookings;
CREATE TRIGGER trg_kds_reset_new_order_items
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.kds_reset_new_order_items();

-- 5. Atomic per-item status change.
--    The row is locked (FOR UPDATE), so two stations pressing at the same moment are serialized:
--    - item already at _next          → no-op (a double tap or both staff pressing "Ready" is harmless)
--    - item moved elsewhere meanwhile → ITEM_CONFLICT:<current> when _expected is given
--    - illegal jump                   → INVALID_TRANSITION
--    The derived ticket status and ticket timestamps are recalculated in the same statement.
CREATE OR REPLACE FUNCTION public.kds_set_item_status(
  _code text,
  _item_ids text[],
  _next text,
  _expected text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _actor text DEFAULT 'kitchen'
)
RETURNS public.bookings
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  e jsonb;
  cur text;
  new_items jsonb := '[]'::jsonb;
  matched int := 0;
  ticket text;
  ts text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  _next := upper(_next);
  _expected := upper(_expected);
  IF _next NOT IN ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION:unknown status %', _next USING ERRCODE = '22023';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF b.status = 'cancelled' AND _next <> 'CANCELLED' THEN
    RAISE EXCEPTION 'ORDER_CANCELLED' USING ERRCODE = '22023';
  END IF;

  FOR e IN SELECT value FROM jsonb_array_elements(b.items) LOOP
    IF e->>'id' = ANY(_item_ids) THEN
      matched := matched + 1;
      cur := coalesce(e->>'status', 'PENDING');
      IF cur = _next THEN
        NULL;
      ELSIF _expected IS NOT NULL AND cur <> _expected THEN
        RAISE EXCEPTION 'ITEM_CONFLICT:%', cur USING ERRCODE = '40001';
      ELSIF NOT public.kds_item_transition_allowed(cur, _next) THEN
        RAISE EXCEPTION 'INVALID_TRANSITION:% -> %', cur, _next USING ERRCODE = '22023';
      ELSE
        e := e || jsonb_build_object('status', _next) || jsonb_build_object(
          CASE _next
            WHEN 'PREPARING' THEN 'startedAt'
            WHEN 'READY' THEN 'readyAt'
            WHEN 'SERVED' THEN 'servedAt'
            ELSE 'cancelledAt'
          END, ts);
      END IF;
    END IF;
    new_items := new_items || jsonb_build_array(e);
  END LOOP;

  IF matched = 0 THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  ticket := public.kds_derive_ticket_status(new_items);

  UPDATE public.bookings SET
    items = new_items,
    kitchen_status = ticket,
    accepted_at = CASE WHEN ticket <> 'new' THEN coalesce(accepted_at, now()) ELSE accepted_at END,
    ready_at = CASE WHEN ticket = 'ready' THEN coalesce(ready_at, now()) ELSE ready_at END,
    completed_at = CASE WHEN ticket = 'completed' THEN coalesce(completed_at, now()) ELSE completed_at END,
    status = CASE WHEN ticket = 'completed' THEN 'completed' WHEN ticket = 'cancelled' THEN 'cancelled' ELSE status END,
    cancellation_reason = CASE WHEN ticket = 'cancelled' THEN coalesce(_reason, cancellation_reason) ELSE cancellation_reason END,
    cancelled_by = CASE WHEN ticket = 'cancelled' THEN coalesce(_actor, cancelled_by) ELSE cancelled_by END
  WHERE id = b.id
  RETURNING * INTO b;

  RETURN b;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kds_set_item_status(text, text[], text, text, text, text) TO anon, authenticated;

-- 6. Stream bookings changes to every KDS screen via Supabase Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END$$;

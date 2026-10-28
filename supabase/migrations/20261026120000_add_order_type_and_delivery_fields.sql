-- 20261026120000_add_order_type_and_delivery_fields.sql
-- Supabase migration to add orderType enum and fields:
-- tableNumber, customerName, customerPhone, deliveryAddress, deliveryInstructions, pickupTime, deliveryFee, packagingCharge

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type_enum') THEN
        CREATE TYPE public.order_type_enum AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY');
    END IF;
END$$;

-- Add columns to public.bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'DINE_IN',
  ADD COLUMN IF NOT EXISTS table_number text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_instructions text,
  ADD COLUMN IF NOT EXISTS pickup_time text,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_charge numeric(10,2) DEFAULT 0;

-- Ensure all existing orders default to DINE_IN
UPDATE public.bookings
SET order_type = 'DINE_IN'
WHERE order_type IS NULL OR order_type::text IN ('', 'dine_in');

-- Backfill customer_name and customer_phone from existing name and phone columns
UPDATE public.bookings
SET customer_name = name
WHERE customer_name IS NULL AND name IS NOT NULL;

UPDATE public.bookings
SET customer_phone = phone
WHERE customer_phone IS NULL AND phone IS NOT NULL;

-- Backfill table_number from seating if available
UPDATE public.bookings
SET table_number = seating
WHERE table_number IS NULL AND seating IS NOT NULL AND seating != '';

-- Add indexes for fast lookup and filtering
CREATE INDEX IF NOT EXISTS idx_bookings_order_type ON public.bookings(order_type);
CREATE INDEX IF NOT EXISTS idx_bookings_table_number ON public.bookings(table_number);

-- Configurable settings for delivery fee and packaging charge in cafe_settings
INSERT INTO public.cafe_settings (key, value) VALUES
  ('delivery_fee', '40'),
  ('packaging_charge', '0')
ON CONFLICT (key) DO NOTHING;

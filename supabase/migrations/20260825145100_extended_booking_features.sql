-- Feature 1-6 Extensions for Bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS table_type text DEFAULT 'window',
  ADD COLUMN IF NOT EXISTS has_preorder boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimated_prep_time integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_ready_time text,
  ADD COLUMN IF NOT EXISTS is_peak_hour boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_amount integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kitchen_load text DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_bookings_phone ON public.bookings (phone);
CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON public.bookings (date, time);

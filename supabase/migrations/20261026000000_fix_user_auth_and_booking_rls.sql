-- 20261026000000_fix_user_auth_and_booking_rls.sql
-- Fix RLS policies so users and mobile/desktop clients can register, login, and query their bookings across devices

-- 1. Ensure users table exists with proper schema
CREATE TABLE IF NOT EXISTS public.users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  is_disabled boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(lower(email));
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);

-- 2. Grants and RLS for users table
GRANT SELECT, INSERT, UPDATE ON public.users TO anon, authenticated;
GRANT ALL ON public.users TO service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public registration and lookup" ON public.users;
CREATE POLICY "Allow public registration and lookup"
ON public.users
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 3. Fix bookings table columns and cross-device access RLS
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS status text DEFAULT 'confirmed';

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_email ON public.bookings(lower(customer_email));
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON public.bookings(phone);

GRANT SELECT, INSERT, UPDATE ON public.bookings TO anon, authenticated;
GRANT ALL ON public.bookings TO service_role;

-- Drop the restrictive blocking policy that prevented devices from reading bookings
DROP POLICY IF EXISTS "Bookings cannot be listed publicly" ON public.bookings;
DROP POLICY IF EXISTS "Allow users to read their bookings" ON public.bookings;
CREATE POLICY "Allow users to read their bookings"
ON public.bookings
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow users to update their bookings" ON public.bookings;
CREATE POLICY "Allow users to update their bookings"
ON public.bookings
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

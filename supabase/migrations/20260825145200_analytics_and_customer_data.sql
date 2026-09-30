-- Customer data & Analytics Migration
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending_cash',
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS actual_arrival_time timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz DEFAULT now();

-- Customers table for lifetime analytics & visit counts
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL UNIQUE,
    name text NOT NULL,
    email text,
    visit_count integer NOT NULL DEFAULT 1,
    total_spent integer NOT NULL DEFAULT 0,
    favorite_items jsonb DEFAULT '[]'::jsonb,
    first_visited_at timestamptz DEFAULT now(),
    last_visited_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.customers TO anon, authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can be read and updated by service and anon for booking flow"
ON public.customers
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Upsert customer visit function
CREATE OR REPLACE FUNCTION public.record_customer_visit(
    _phone text,
    _name text,
    _email text,
    _amount integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.customers (phone, name, email, visit_count, total_spent, last_visited_at)
    VALUES (_phone, _name, _email, 1, _amount, now())
    ON CONFLICT (phone) DO UPDATE
    SET visit_count = public.customers.visit_count + 1,
        total_spent = public.customers.total_spent + _amount,
        name = EXCLUDED.name,
        email = COALESCE(EXCLUDED.email, public.customers.email),
        last_visited_at = now();
END;
$$;

CREATE TABLE public.bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    date date NOT NULL,
    time text NOT NULL,
    party integer NOT NULL,
    seating text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    notes text,
    dietary text[] DEFAULT '{}',
    occasion text,
    accessibility text[] DEFAULT '{}',
    window_priority boolean DEFAULT false,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    total integer NOT NULL DEFAULT 0,
    paid_amount integer DEFAULT 0,
    payment_method text DEFAULT 'pay_on_arrival',
    status text DEFAULT 'confirmed',
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.bookings TO anon;
GRANT SELECT, INSERT ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create a booking"
ON public.bookings
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Bookings cannot be listed publicly"
ON public.bookings
FOR SELECT
TO anon, authenticated
USING (false);

CREATE OR REPLACE FUNCTION public.get_booking_by_code(_code text)
RETURNS public.bookings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.bookings WHERE code = _code LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_by_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_booking_by_code(text) TO authenticated;

CREATE TABLE public.events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    event_date date,
    event_time text,
    image_url text,
    price integer,
    booking_link text,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.events TO anon;
GRANT SELECT ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active events are public"
ON public.events
FOR SELECT
TO anon, authenticated
USING (active = true);

CREATE TABLE public.cafe_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE,
    value text NOT NULL
);

GRANT SELECT ON public.cafe_settings TO anon;
GRANT SELECT ON public.cafe_settings TO authenticated;
GRANT ALL ON public.cafe_settings TO service_role;

ALTER TABLE public.cafe_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings are public"
ON public.cafe_settings
FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.cafe_settings (key, value) VALUES
  ('upi_id', 'cafeq@upi'),
  ('upi_payee_name', 'Cafeq');

INSERT INTO public.events (title, description, event_date, event_time, price, active) VALUES
  ('Latte Art Workshop', 'A hands-on session with our head barista. Learn to pour hearts, tulips and swans.', (CURRENT_DATE + INTERVAL '10 days')::date, '10:00', 1200, true),
  ('Coffee & Vinyl Morning', 'Slow brews and vinyl spins. Bring a record or pick from our crate.', (CURRENT_DATE + INTERVAL '17 days')::date, '09:00', 0, true),
  ('Chef''s Tasting Menu', 'Five courses of small plates paired with single-origin pour-overs.', (CURRENT_DATE + INTERVAL '24 days')::date, '19:00', 2500, true);

DROP FUNCTION IF EXISTS public.get_booking_by_code(text);

ALTER POLICY "Bookings cannot be listed publicly" ON public.bookings
USING (false);

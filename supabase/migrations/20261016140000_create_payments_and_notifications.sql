-- 20261016140000_create_payments_and_notifications.sql
-- Migration for Razorpay online payments, PDF digital receipts, notification logs & preferences

-- 1. Digital Receipts Table
CREATE TABLE IF NOT EXISTS public.receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_code text NOT NULL,
    receipt_number text NOT NULL UNIQUE,
    order_id text,
    payment_id text,
    payment_method text DEFAULT 'online_razorpay',
    amount numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) NOT NULL DEFAULT 0,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_email text,
    pdf_data text, -- Base64 data URI of generated receipt PDF
    created_at timestamptz DEFAULT now(),
    emailed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_receipts_booking_code ON public.receipts(booking_code);
CREATE INDEX IF NOT EXISTS idx_receipts_payment_id ON public.receipts(payment_id);

GRANT SELECT, INSERT, UPDATE ON public.receipts TO anon, authenticated;
GRANT ALL ON public.receipts TO service_role;

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select and insert on receipts"
ON public.receipts
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 2. Notification Logs Table
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL, -- reservation_confirmed | reservation_reminder | order_accepted | order_ready | payment_success | cancellation
    channel text NOT NULL,    -- sms | email | whatsapp
    recipient text NOT NULL,
    status text NOT NULL DEFAULT 'sent', -- pending | sent | failed
    provider text NOT NULL,   -- msg91 | twilio | smtp | whatsapp_cloud
    message_preview text,
    error_message text,
    attempts integer DEFAULT 1,
    booking_code text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_booking_code ON public.notification_logs(booking_code);
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON public.notification_logs(recipient);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON public.notification_logs(created_at DESC);

GRANT SELECT, INSERT ON public.notification_logs TO anon, authenticated;
GRANT ALL ON public.notification_logs TO service_role;

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow logging and reading notification logs"
ON public.notification_logs
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 3. Notification Preferences Table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    phone text,
    email text,
    sms_enabled boolean DEFAULT true,
    email_enabled boolean DEFAULT true,
    whatsapp_enabled boolean DEFAULT true,
    reminders_enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_prefs_phone ON public.notification_preferences(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON public.notification_preferences(user_id) WHERE user_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO anon, authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow reading and updating preferences"
ON public.notification_preferences
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

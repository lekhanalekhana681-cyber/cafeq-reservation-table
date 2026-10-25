-- 20261025000000_ensure_menu_items_stock_availability.sql
-- Ensure is_available and essential menu columns exist with index

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'menu_items') THEN
    ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_veg BOOLEAN DEFAULT TRUE;
    ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_alcoholic BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;
    ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS tag VARCHAR;
    
    CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON public.menu_items(is_available);
  END IF;
END $$;

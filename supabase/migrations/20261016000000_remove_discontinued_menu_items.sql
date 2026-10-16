-- Migration: Remove discontinued menu items
-- 1. Tandoori Chicken Momos
-- 2. Garlic Bread with Cheese
-- 3. Cheese Chilli Toast
-- 4. White Sauce Pasta
-- 5. Brown Butter Banana Bread
-- 6. Chicken Wings (6 pcs)

DO $$
BEGIN
  -- 1. Safely remove foreign key references in booking_items if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_items') THEN
    DELETE FROM public.booking_items
    WHERE menu_item_id IN (
      SELECT id FROM public.menu_items
      WHERE LOWER(name) IN (
        'tandoori chicken momos',
        'garlic bread with cheese',
        'cheese chilli toast',
        'white sauce pasta',
        'brown butter banana bread',
        'chicken wings (6 pcs)',
        'chicken wings'
      )
    );
  END IF;

  -- 2. Delete discontinued items from menu_items
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'menu_items') THEN
    DELETE FROM public.menu_items
    WHERE LOWER(name) IN (
      'tandoori chicken momos',
      'garlic bread with cheese',
      'cheese chilli toast',
      'white sauce pasta',
      'brown butter banana bread',
      'chicken wings (6 pcs)',
      'chicken wings'
    );
  END IF;
END $$;

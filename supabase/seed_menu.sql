-- Idempotent Menu Items Seed
-- Generated on 2026-10-15T19:10:39.946Z

-- Ensure columns exist in menu_items
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS is_veg BOOLEAN DEFAULT TRUE;
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS is_alcoholic BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS tag VARCHAR;

-- Ensure unique constraint on name for UPSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_name_key'
  ) THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_name_key UNIQUE (name);
  END IF;
END $$;

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Espresso', 'Hot Beverages', 99, 'Rich, concentrated double shot of pure single-origin Arabica espresso with golden crema.', true, false, true, '/uploads/menu/espresso.webp', 'Classic', 3, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cappuccino', 'Hot Beverages', 149, 'Balanced double espresso topped with equal parts steamed milk and dense velvety foam.', true, false, true, '/uploads/menu/cappuccino.webp', 'Popular', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cafe Latte', 'Hot Beverages', 159, 'Smooth espresso balanced with silky textured steamed milk and delicate microfoam art.', true, false, true, '/uploads/menu/cafe-latte.webp', NULL, 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Filter Coffee', 'Hot Beverages', 79, 'Traditional South Indian decoction brewed with chicory and frothed full-cream milk.', true, false, true, '/uploads/menu/filter-coffee.webp', 'Traditional', 3, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Hot Chocolate', 'Hot Beverages', 169, 'Melted rich dark Belgian chocolate whisked with creamy steamed milk and mini marshmallows.', true, false, true, '/uploads/menu/hot-chocolate.webp', 'Favorite', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Masala Chai', 'Hot Beverages', 59, 'Aromatic slow-brewed tea infused with crushed green cardamom, ginger, cinnamon, and cloves.', true, false, true, '/uploads/menu/masala-chai.webp', 'Desi Special', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Green Tea', 'Hot Beverages', 79, 'Pure organic steamed whole green tea leaves with delicate floral undertones and antioxidants.', true, false, true, '/uploads/menu/green-tea.webp', NULL, 3, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Caramel Macchiato', 'Hot Beverages', 189, 'Freshly steamed vanilla milk marked with bold espresso and topped with buttery caramel drizzle.', true, false, true, '/uploads/menu/caramel-macchiato.webp', 'Sweet & Bold', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cold Coffee', 'Cold Beverages', 159, 'Blended double espresso with chilled milk, dairy cream, and crushed crystal ice.', true, false, true, '/uploads/menu/cold-coffee.webp', 'All-Time Best', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Iced Latte', 'Cold Beverages', 169, 'Chilled fresh milk and espresso poured over clear artisan ice blocks.', true, false, true, '/uploads/menu/iced-latte.webp', NULL, 3, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Iced Tea (Lemon/Peach)', 'Cold Beverages', 129, 'Crisp slow-steeped Ceylon tea shaken with fresh lemon slices or ripe peach puree and mint.', true, false, true, '/uploads/menu/iced-tea-lemonpeach.webp', 'Refreshing', 3, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Oreo Milkshake', 'Cold Beverages', 179, 'Thick vanilla cream blended with crunchy Oreo cookies, dark fudge, and chocolate drizzle.', true, false, true, '/uploads/menu/oreo-milkshake.webp', 'Bestseller', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Chocolate Milkshake', 'Cold Beverages', 169, 'Dutch cocoa and artisanal chocolate gelato churned into a rich, decadent shake.', true, false, true, '/uploads/menu/chocolate-milkshake.webp', NULL, 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Mango Smoothie', 'Cold Beverages', 159, 'Pure Alphonso mango pulp churned with Greek yogurt, chia seeds, and wildflower honey.', true, false, true, '/uploads/menu/mango-smoothie.webp', 'Seasonal', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Fresh Lime Soda', 'Cold Beverages', 89, 'Effervescent club soda with freshly hand-squeezed limes, rock salt, and mint sprigs.', true, false, true, '/uploads/menu/fresh-lime-soda.webp', NULL, 2, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cold Brew', 'Cold Beverages', 179, 'Single-origin Arabica grounds slow-steeped for 18 hours for maximum chocolatey smoothness.', true, false, true, '/uploads/menu/cold-brew.webp', 'Signature', 2, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Virgin Mojito', 'Mocktails', 149, 'Muddled fresh garden mint, Persian lime wedges, raw cane sugar, and sparkling soda.', true, false, true, '/uploads/menu/virgin-mojito.webp', 'Top Mocktail', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Blue Lagoon', 'Mocktails', 159, 'Vibrant blue Curacao cordial, fresh lemon juice, and effervescent fizz over crushed ice.', true, false, true, '/uploads/menu/blue-lagoon.webp', 'Colorful', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Watermelon Cooler', 'Mocktails', 149, 'Freshly pressed chilled watermelon juice, sweet basil seeds, lime squeeze, and mint.', true, false, true, '/uploads/menu/watermelon-cooler.webp', NULL, 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Fruit Punch', 'Mocktails', 159, 'Tropical blend of orange, pineapple, mango, and pomegranate with a dash of sweet grenadine.', true, false, true, '/uploads/menu/fruit-punch.webp', NULL, 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cucumber Mint Cooler', 'Mocktails', 139, 'Crisp organic cucumber ribbons, fresh garden spearmint, lime juice, and sparkling soda.', true, false, true, '/uploads/menu/cucumber-mint-cooler.webp', 'Detox', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Pina Colada (Virgin)', 'Mocktails', 179, 'Lush tropical coconut cream blended with ripe pineapple juice and crushed ice.', true, false, true, '/uploads/menu/pina-colada-virgin.webp', NULL, 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Strawberry Fizz', 'Mocktails', 159, 'Macerated fresh strawberries, tart lime juice, and crisp bubbly sparkling water.', true, false, true, '/uploads/menu/strawberry-fizz.webp', NULL, 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Green Apple Spritzer', 'Mocktails', 149, 'Crisp Granny Smith apple nectar, crushed mint leaves, and effervescent sparkling soda.', true, false, true, '/uploads/menu/green-apple-spritzer.webp', NULL, 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Classic Mojito', 'Cocktails (18+)', 349, 'Premium white rum, muddled garden mint, fresh lime, raw sugar, and sparkling soda.', true, true, true, '/uploads/menu/classic-mojito.webp', '18+ Only', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Margarita', 'Cocktails (18+)', 379, 'Blanco agave tequila, orange triple sec, and freshly squeezed tart lime juice with salted rim.', true, true, true, '/uploads/menu/margarita.webp', '18+ Only', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Long Island Iced Tea', 'Cocktails (18+)', 449, 'Potent blend of vodka, rum, tequila, gin, triple sec, sour mix, and splash of cola.', true, true, true, '/uploads/menu/long-island-iced-tea.webp', '18+ High Proof', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cosmopolitan', 'Cocktails (18+)', 399, 'Citron vodka, orange liqueur, cranberry nectar, and fresh lime shaken ice-cold.', true, true, true, '/uploads/menu/cosmopolitan.webp', '18+ Only', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Pina Colada', 'Cocktails (18+)', 379, 'Golden Caribbean spiced rum, rich coconut cream, and pineapple juice blended to smooth bliss.', true, true, true, '/uploads/menu/pina-colada.webp', '18+ Only', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Whiskey Sour', 'Cocktails (18+)', 399, 'Aged Kentucky bourbon whiskey, freshly squeezed lemon juice, simple syrup, and Angostura bitters.', true, true, true, '/uploads/menu/whiskey-sour.webp', '18+ Bar Special', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Sangria (Glass)', 'Cocktails (18+)', 349, 'Bold Spanish red wine steeped with macerated oranges, berries, apples, and a splash of brandy.', true, true, true, '/uploads/menu/sangria-glass.webp', '18+ Wine Cocktail', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Old Fashioned', 'Cocktails (18+)', 429, 'Straight bourbon whiskey slowly stirred with raw sugar cube, aromatic bitters, and expressed orange peel.', true, true, true, '/uploads/menu/old-fashioned.webp', '18+ Vintage', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Tequila Sunrise', 'Cocktails (18+)', 369, 'Blue agave tequila and freshly pressed orange juice with sinking sweet pomegranate grenadine.', true, true, true, '/uploads/menu/tequila-sunrise.webp', '18+ Only', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Veg Steamed Momos', 'Momos (6 pcs)', 119, 'Delicate thin-wrapper Himalayan dumplings filled with finely chopped cabbage, carrots, and scallions.', true, false, true, '/uploads/menu/veg-steamed-momos.webp', 'Steamed', 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Chicken Steamed Momos', 'Momos (6 pcs)', 149, 'Juicy minced chicken seasoned with coriander, ginger, garlic, and Himalayan spices.', false, false, true, '/uploads/menu/chicken-steamed-momos.webp', 'Bestseller', 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Paneer Momos', 'Momos (6 pcs)', 139, 'Fresh grated cottage cheese, garden herbs, and mild ground spices in soft steamed parcels.', true, false, true, '/uploads/menu/paneer-momos.webp', NULL, 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Veg Fried Momos', 'Momos (6 pcs)', 139, 'Crispy golden fried vegetable momos served with fiery red chili garlic chutney.', true, false, true, '/uploads/menu/veg-fried-momos.webp', 'Crunchy', 12, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Chicken Fried Momos', 'Momos (6 pcs)', 169, 'Deep golden crisp chicken dumplings served with spicy Schezwan dip and garlic mayo.', false, false, true, '/uploads/menu/chicken-fried-momos.webp', NULL, 12, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Tandoori Chicken Momos', 'Momos (6 pcs)', 189, 'Chicken momos marinated in spicy hung yogurt and roasted over hot tandoor coals.', false, false, true, '/uploads/menu/tandoori-chicken-momos.webp', 'Chef Special', 14, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cheese Corn Momos', 'Momos (6 pcs)', 149, 'Gooey mozzarella cheese and sweet golden American corn kernels stuffed in tender dumplings.', true, false, true, '/uploads/menu/cheese-corn-momos.webp', NULL, 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Schezwan Chicken Momos', 'Momos (6 pcs)', 179, 'Wok-tossed chicken momos coated in spicy, tangy garlic Schezwan gravy with scallions.', false, false, true, '/uploads/menu/schezwan-chicken-momos.webp', 'Spicy', 12, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Chocolate Momos (dessert)', 'Momos (6 pcs)', 129, 'Sweet golden crispy momos filled with molten Belgian dark chocolate and roasted almond slivers.', true, false, true, '/uploads/menu/chocolate-momos-dessert.webp', 'Dessert Momo', 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('French Fries', 'Starters & Snacks', 99, 'Hand-cut crispy golden potato fries seasoned with sea salt, served with garlic aioli.', true, false, true, '/uploads/menu/french-fries.webp', 'Classic Snack', 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Peri Peri Fries', 'Starters & Snacks', 129, 'Crunchy potato fries generously dusted with zesty, hot African peri-peri chili rub.', true, false, true, '/uploads/menu/peri-peri-fries.webp', 'Spicy Kick', 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cheese Nachos', 'Starters & Snacks', 159, 'Warm stone-ground tortilla chips topped with molten cheddar cheese sauce, salsa, and jalapenos.', true, false, true, '/uploads/menu/cheese-nachos.webp', NULL, 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Veg Spring Rolls', 'Starters & Snacks', 129, 'Crispy fried pastry rolls filled with wok-tossed shredded cabbage, bell peppers, and glass noodles.', true, false, true, '/uploads/menu/veg-spring-rolls.webp', NULL, 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Paneer Tikka', 'Starters & Snacks', 219, 'Charcoal-grilled cottage cheese cubes marinated in Kashmiri chili, hung curd, and spices.', true, false, true, '/uploads/menu/paneer-tikka.webp', 'Tandoor Special', 14, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Chicken Wings (6 pcs)', 'Starters & Snacks', 249, 'Crispy fried chicken wings tossed in your choice of smokey BBQ or spicy buffalo glaze.', false, false, true, '/uploads/menu/chicken-wings-6-pcs.webp', 'Bestseller', 14, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Garlic Bread with Cheese', 'Starters & Snacks', 139, 'Toasted French baguette slathered with roasted garlic butter and smothered in melted mozzarella.', true, false, true, '/uploads/menu/garlic-bread-with-cheese.webp', NULL, 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Crispy Corn', 'Starters & Snacks', 149, 'Golden sweet corn kernels flash-fried and wok-tossed with green chilies, peppers, and chaat masala.', true, false, true, '/uploads/menu/crispy-corn.webp', NULL, 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Veg Burger', 'Burgers & Sandwiches', 129, 'Crisp seasoned veggie patty, fresh iceberg lettuce, sliced tomato, and herb mayo on a sesame bun.', true, false, true, '/uploads/menu/veg-burger.webp', NULL, 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Chicken Burger', 'Burgers & Sandwiches', 169, 'Tender grilled chicken fillet, sharp vintage cheddar, dill pickles, and honey mustard sauce.', false, false, true, '/uploads/menu/chicken-burger.webp', 'Popular', 12, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Paneer Burger', 'Burgers & Sandwiches', 159, 'Crispy crumbed spiced paneer patty topped with chipotle coleslaw and fresh greens.', true, false, true, '/uploads/menu/paneer-burger.webp', NULL, 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Grilled Veg Sandwich', 'Burgers & Sandwiches', 119, 'Toasted multi-grain bread layered with sliced cucumber, tomato, bell pepper, and spicy mint chutney.', true, false, true, '/uploads/menu/grilled-veg-sandwich.webp', NULL, 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Club Sandwich', 'Burgers & Sandwiches', 179, 'Triple-decker toasted sandwich with layered grilled vegetables, cheddar cheese, and house aioli.', true, false, true, '/uploads/menu/club-sandwich.webp', 'Hearty', 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Chicken Tikka Sandwich', 'Burgers & Sandwiches', 169, 'Juicy tandoori chicken tikka pieces, red onion rings, and mint mayonnaise between grilled bread.', false, false, true, '/uploads/menu/chicken-tikka-sandwich.webp', NULL, 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cheese Chilli Toast', 'Burgers & Sandwiches', 109, 'Thick crusty bread baked with melted sharp cheddar, chopped spicy green chilies, and fresh cilantro.', true, false, true, '/uploads/menu/cheese-chilli-toast.webp', NULL, 7, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Margherita Pizza', 'Pizza & Pasta', 249, 'Classic hand-stretched crust topped with San Marzano tomato sauce, fresh mozzarella, and sweet basil.', true, false, true, '/uploads/menu/margherita-pizza.webp', 'Italian Classic', 15, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Farmhouse Pizza', 'Pizza & Pasta', 299, 'Loaded with roasted bell peppers, sliced red onions, button mushrooms, sweet corn, and black olives.', true, false, true, '/uploads/menu/farmhouse-pizza.webp', NULL, 15, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Pepperoni Pizza', 'Pizza & Pasta', 349, 'Crispy crust layered with tomato sauce, mozzarella, and cured spicy pepperoni slices.', false, false, true, '/uploads/menu/pepperoni-pizza.webp', 'House Special', 15, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('White Sauce Pasta', 'Pizza & Pasta', 219, 'Penne pasta enveloped in velvety rich garlic Parmesan cream sauce with sauteed mushrooms.', true, false, true, '/uploads/menu/white-sauce-pasta.webp', NULL, 12, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Red Sauce Pasta', 'Pizza & Pasta', 209, 'Penne tossed in spicy slow-cooked San Marzano tomato, garlic, and fresh basil arrabbiata sauce.', true, false, true, '/uploads/menu/red-sauce-pasta.webp', NULL, 12, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Chicken Alfredo Pasta', 'Pizza & Pasta', 269, 'Fettuccine pasta tossed with tender grilled chicken breast strips in rich aged Parmesan alfredo.', false, false, true, '/uploads/menu/chicken-alfredo-pasta.webp', 'Bestseller', 14, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Mac and Cheese', 'Pizza & Pasta', 229, 'Elbow macaroni enveloped in creamy triple-blend cheddar and Gruyere cheese, finished with crunchy herb crumbs.', true, false, true, '/uploads/menu/mac-and-cheese.webp', 'Comfort Food', 12, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Brownie with Ice Cream', 'Desserts', 169, 'Warm fudgy Belgian dark chocolate brownie served with Madagascar vanilla gelato and hot fudge.', true, false, true, '/uploads/menu/brownie-with-ice-cream.webp', 'All-Time Favorite', 6, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Chocolate Lava Cake', 'Desserts', 159, 'Warm dark cocoa sponge cake with an irresistible molten liquid chocolate core.', true, false, true, '/uploads/menu/chocolate-lava-cake.webp', 'Molten Center', 6, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cheesecake Slice', 'Desserts', 189, 'Silky New York style baked cheesecake on a buttery biscuit base, served with berry coulis.', true, false, true, '/uploads/menu/cheesecake-slice.webp', NULL, 3, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Tiramisu', 'Desserts', 199, 'Authentic Italian recipe with espresso-soaked savoiardi ladyfingers and whipped mascarpone cream.', true, false, true, '/uploads/menu/tiramisu.webp', 'Authentic', 3, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Waffle with Nutella', 'Desserts', 179, 'Freshly ironed golden Belgian waffle loaded with creamy Nutella, sliced banana, and whipped cream.', true, false, true, '/uploads/menu/waffle-with-nutella.webp', NULL, 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Vanilla/Chocolate Scoop', 'Desserts', 79, 'Two generous scoops of artisanal churned gelato (choice of Bourbon vanilla or Belgian dark cocoa).', true, false, true, '/uploads/menu/vanillachocolate-scoop.webp', NULL, 2, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Banoffee Pie', 'Desserts', 189, 'Classic English dessert with fresh bananas, thick caramel toffee dulce de leche, and whipped cream.', true, false, true, '/uploads/menu/banoffee-pie.webp', NULL, 3, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Velvet Cappuccino', 'Coffee & Drinks', 149, 'Rich double espresso with thick velvety microfoam & dusted cocoa.', true, false, true, '/uploads/menu/velvet-cappuccino.webp', 'Popular', 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Artisan Vanilla Bean Latte', 'Coffee & Drinks', 169, 'Double shot espresso, Madagascar vanilla, silky steamed milk.', true, false, true, '/uploads/menu/artisan-vanilla-bean-latte.webp', 'Signature', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Ember Flat White', 'Coffee & Drinks', 159, 'Double ristretto, microfoam with house Ethiopian blend.', true, false, true, '/uploads/menu/ember-flat-white.webp', NULL, 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cardamom Honey Latte', 'Coffee & Drinks', 179, 'Crushed green cardamom, wildflower honey, oat or dairy milk.', true, false, true, '/uploads/menu/cardamom-honey-latte.webp', NULL, 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('24h Slow Cold Brew', 'Coffee & Drinks', 179, 'Slow steeped micro-lot poured over a single clear ice block.', true, false, true, '/uploads/menu/24h-slow-cold-brew.webp', NULL, 2, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Ceremonial Matcha Tonic', 'Coffee & Drinks', 199, 'Uji ceremonial matcha, premium tonic, sparkling yuzu twist.', true, false, true, '/uploads/menu/ceremonial-matcha-tonic.webp', NULL, 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Dark Belgian Iced Chocolate', 'Coffee & Drinks', 189, '70% single origin cocoa, cold cream, roasted cacao nibs.', true, false, true, '/uploads/menu/dark-belgian-iced-chocolate.webp', NULL, 3, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Warm Fudgy Brownie & Gelato', 'Bakery & Desserts', 169, 'Decadent dark chocolate brownie with molten core & vanilla bean gelato.', true, false, true, '/uploads/menu/warm-fudgy-brownie-gelato.webp', 'Chef''s Special', 6, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Golden Butter Croissant', 'Bakery & Desserts', 129, '72-hour laminated French pastry, baked fresh at 6am daily.', true, false, true, '/uploads/menu/golden-butter-croissant.webp', 'Sells out', 2, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Cardamom Orange Knot', 'Bakery & Desserts', 139, 'Braided Swedish bun with freshly ground cardamom & orange zest.', true, false, true, '/uploads/menu/cardamom-orange-knot.webp', NULL, 2, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Brown Butter Banana Bread', 'Bakery & Desserts', 149, 'Toasted slice served warm with sea salt whipped honey butter.', true, false, true, '/uploads/menu/brown-butter-banana-bread.webp', NULL, 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Artisanal Margherita Sourdough Pizza', 'Artisanal Mains', 289, '48h fermented sourdough crust, San Marzano sauce, fresh mozzarella, torn basil.', true, false, true, '/uploads/menu/artisanal-margherita-sourdough-pizza.webp', 'Wood-fired', 16, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Gourmet Brioche Cafe Burger', 'Artisanal Mains', 269, 'Juicy patty (or crispy paneer), melted vintage cheddar, caramelized onions, truffle sauce.', true, false, true, '/uploads/menu/gourmet-brioche-cafe-burger.webp', 'Must Try', 14, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Toasted Sourdough Club Sandwich', 'Artisanal Mains', 239, 'Triple-decker sourdough with herb grilled fillings, avocado, heirloom tomato, aioli.', true, false, true, '/uploads/menu/toasted-sourdough-club-sandwich.webp', NULL, 10, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Avocado & Dukkah Sourdough Toast', 'Artisanal Mains', 229, 'Hand-smashed Hass avocado, Egyptian dukkah spice, extra virgin lemon oil.', true, false, true, '/uploads/menu/avocado-dukkah-sourdough-toast.webp', 'Vegan', 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Small-Batch Skillet Shakshuka', 'Artisanal Mains', 269, 'Slow-simmered spiced tomatoes, poached eggs, whipped feta & warm focaccia.', false, false, true, '/uploads/menu/small-batch-skillet-shakshuka.webp', NULL, 15, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Crispy Herb & Truffle Fries', 'Bites & Sides', 139, 'Golden hand-cut fries tossed in fresh rosemary, sea salt, served with truffle mayo.', true, false, true, '/uploads/menu/crispy-herb-truffle-fries.webp', 'Crispy', 8, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Vibrant Seasonal Fruit Bowl', 'Fresh & Bowls', 169, 'Fresh dragonfruit, strawberries, blueberries, kiwi, Greek yogurt & passionfruit drizzle.', true, false, true, '/uploads/menu/vibrant-seasonal-fruit-bowl.webp', 'Healthy', 5, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('Roasted Maple Granola Bowl', 'Fresh & Bowls', 179, 'House-toasted oats, nuts, organic yogurt, roasted stone fruits and chia seeds.', true, false, true, '/uploads/menu/roasted-maple-granola-bowl.webp', NULL, 4, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();

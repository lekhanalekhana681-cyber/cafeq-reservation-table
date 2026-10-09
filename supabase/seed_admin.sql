-- Idempotent admin seed SQL
-- ⚠️ SECURITY WARNING: Default credentials (CafeQ / Cafe@123) are for local development only.
-- Change before deploying to production!

INSERT INTO users (id, name, email, phone, password_hash, role, created_at, updated_at)
VALUES (
  'admin_master_001',
  'CafeQ Master Admin',
  'admin@cafeq.com',
  '+91 90000 00001',
  '$2b$10$N5h9VbxVVGjOlRq4Yyf2ceyZDLAUi2MiwFhel.KG3.9QIRKxo1sNW',
  'admin',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = 'admin',
  updated_at = NOW();

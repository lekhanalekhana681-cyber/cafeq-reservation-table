-- Idempotent kitchen seed SQL
-- ⚠️ SECURITY WARNING: Default credentials (Kitchen / Kitchen@123) are for local development only.
-- Change before deploying to production!

INSERT INTO users (id, name, email, phone, password_hash, role, created_at, updated_at)
VALUES (
  'kitchen_master_001',
  'CafeQ Kitchen Staff',
  'kitchen@cafeq.com',
  '+91 90000 00002',
  '$2b$10$DkP3R3XUcvq3tzynU2PUv.JEzsAm.6iHNbOGCbnzADjeVRiTNqpDe',
  'kitchen',
  NOW(),
  NOW()
)
ON CONFLICT (email) 
DO UPDATE SET 
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  phone = EXCLUDED.phone,
  role = 'kitchen',
  updated_at = NOW();

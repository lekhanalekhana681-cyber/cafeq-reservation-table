-- Auto-generated admin seed SQL
INSERT INTO users (id, name, email, phone, password_hash, role, created_at, updated_at)
VALUES (
  'admin_1790760761592',
  'CafeQ Master Admin',
  'admin@cafeq.com',
  '+91 90000 00001',
  '$2b$10$nOky2j7BrpA8Pr67Cn.N6O1uX53xq1ITj53L/FQOlvY5cpx1hsT4u',
  'admin',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = 'admin',
  updated_at = NOW();

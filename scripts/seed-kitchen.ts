import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

// Load .env manually if process.env doesn't have it
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!process.env[key]) {
          process.env[key] = value.trim();
        }
      }
    }
  }
}

loadEnv();

// -----------------------------------------------------------------------------
// ⚠️ SECURITY WARNING:
// The default credentials (Kitchen / Kitchen@123) are intended for local development ONLY.
// In production, configure KITCHEN_USERNAME and a strong KITCHEN_PASSWORD in your environment.
// -----------------------------------------------------------------------------

const username = (
  process.env.KITCHEN_USERNAME ||
  process.env.VITE_KITCHEN_USERNAME ||
  "Kitchen"
).trim();

const email = (
  process.env.KITCHEN_EMAIL ||
  process.env.VITE_KITCHEN_EMAIL ||
  "kitchen@cafeq.com"
).trim().toLowerCase();

const password = (
  process.env.KITCHEN_PASSWORD ||
  process.env.VITE_KITCHEN_PASSWORD ||
  "Kitchen@123"
).trim();

const name = (
  process.env.KITCHEN_NAME ||
  process.env.VITE_KITCHEN_NAME ||
  "CafeQ Kitchen Staff"
).trim();

const phone = (
  process.env.KITCHEN_PHONE ||
  process.env.VITE_KITCHEN_PHONE ||
  "+91 90000 00002"
).trim();

console.log("=========================================");
console.log("CafeQ Kitchen Staff Seeding Script");
console.log("=========================================");
console.log(`Reading credentials from environment (.env):`);
console.log(`- Username:       ${username}`);
console.log(`- Email:          ${email}`);
console.log(`- Password:       [PROTECTED (${password.length} chars)]`);
console.log(`- Staff Name:     ${name}`);
console.log(`- Role:           kitchen`);

// Generate bcrypt hash
const salt = bcrypt.genSaltSync(10);
const passwordHash = bcrypt.hashSync(password, salt);

const seedsDir = path.resolve(process.cwd(), "supabase");
if (!fs.existsSync(seedsDir)) {
  fs.mkdirSync(seedsDir, { recursive: true });
}

// Generate idempotent Supabase SQL seed (UPSERT on email)
const sqlContent = `-- Idempotent kitchen seed SQL
-- ⚠️ SECURITY WARNING: Default credentials (Kitchen / Kitchen@123) are for local development only.
-- Change before deploying to production!

INSERT INTO users (id, name, email, phone, password_hash, role, created_at, updated_at)
VALUES (
  'kitchen_master_001',
  '${name.replace(/'/g, "''")}',
  '${email.replace(/'/g, "''")}',
  '${phone.replace(/'/g, "''")}',
  '${passwordHash}',
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
`;

const seedSqlPath = path.resolve(seedsDir, "seed_kitchen.sql");
fs.writeFileSync(seedSqlPath, sqlContent, "utf-8");

console.log(`✅ SQL migration script written to: ${seedSqlPath}`);
console.log(`Default Kitchen Staff Provisioned: ${username} (${email})`);
console.log("=========================================\n");

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
// The default credentials (CafeQ / Cafe@123) are intended for local development ONLY.
// In production, configure ADMIN_USERNAME and a strong ADMIN_PASSWORD in your environment.
// -----------------------------------------------------------------------------

const username = (
  process.env.ADMIN_USERNAME ||
  process.env.VITE_ADMIN_USERNAME ||
  "CafeQ"
).trim();

const email = (
  process.env.ADMIN_EMAIL ||
  process.env.VITE_ADMIN_EMAIL ||
  "admin@cafeq.com"
).trim().toLowerCase();

const password = (
  process.env.ADMIN_PASSWORD ||
  process.env.VITE_ADMIN_PASSWORD ||
  "Cafe@123"
).trim();

const name = (
  process.env.ADMIN_NAME ||
  process.env.VITE_ADMIN_NAME ||
  "CafeQ Master Admin"
).trim();

const phone = (
  process.env.ADMIN_PHONE ||
  process.env.VITE_ADMIN_PHONE ||
  "+91 90000 00001"
).trim();

console.log("=========================================");
console.log("CafeQ Administrator Seeding Script");
console.log("=========================================");
console.log(`Reading credentials from environment (.env):`);
console.log(`- Username:       ${username}`);
console.log(`- Email:          ${email}`);
console.log(`- Password:       [PROTECTED (${password.length} chars)]`);
console.log(`- Admin Name:     ${name}`);
console.log(`- Role:           admin`);

// Generate bcrypt hash
const salt = bcrypt.genSaltSync(10);
const passwordHash = bcrypt.hashSync(password, salt);

// 1. Prepare/Update Local Storage JSON seed fallback
const adminUser = {
  id: "admin_master_001",
  name,
  username,
  email,
  phone,
  role: "admin",
  createdAt: new Date().toISOString(),
  password_hash: passwordHash,
};

const seedsDir = path.resolve(process.cwd(), "supabase");
if (!fs.existsSync(seedsDir)) {
  fs.mkdirSync(seedsDir, { recursive: true });
}

// 2. Generate idempotent Supabase SQL seed (UPSERT on email)
const sqlContent = `-- Idempotent admin seed SQL
-- ⚠️ SECURITY WARNING: Default credentials (CafeQ / Cafe@123) are for local development only.
-- Change before deploying to production!

INSERT INTO users (id, name, email, phone, password_hash, role, created_at, updated_at)
VALUES (
  '${adminUser.id}',
  '${name.replace(/'/g, "''")}',
  '${email.replace(/'/g, "''")}',
  '${phone.replace(/'/g, "''")}',
  '${passwordHash}',
  'admin',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = 'admin',
  updated_at = NOW();
`;

fs.writeFileSync(path.resolve(seedsDir, "seed_admin.sql"), sqlContent, "utf-8");

console.log(`✓ Idempotent seed written to: supabase/seed_admin.sql`);
console.log(`✓ Admin password successfully encrypted using bcrypt.`);
console.log(`\nReady! You can log in using either Username or Email:`);
console.log(`  Portal URL: http://localhost:3000/admin/login`);
console.log(`  Username:   ${username}`);
console.log(`  Email:      ${email}`);
console.log(`  Password:   ${password}`);
console.log("=========================================");

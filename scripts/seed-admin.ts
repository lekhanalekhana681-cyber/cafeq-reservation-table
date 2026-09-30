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

const email = (
  process.env.ADMIN_EMAIL ||
  process.env.VITE_ADMIN_EMAIL ||
  "admin@cafeq.com"
).trim().toLowerCase();

const password = (
  process.env.ADMIN_PASSWORD ||
  process.env.VITE_ADMIN_PASSWORD ||
  "CafeQAdmin2026!"
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

console.log("-----------------------------------------");
console.log("CafeQ Administrator Seeding Script");
console.log("-----------------------------------------");
console.log(`Reading configuration from environment / .env:`);
console.log(`- Admin Name:     ${name}`);
console.log(`- Admin Email:    ${email}`);
console.log(`- Admin Password: [PROTECTED (${password.length} chars)]`);
console.log(`- Admin Phone:    ${phone}`);

// Generate hash
const salt = bcrypt.genSaltSync(10);
const passwordHash = bcrypt.hashSync(password, salt);

const adminUser = {
  id: `admin_${Date.now()}`,
  name,
  email,
  phone,
  role: "admin",
  createdAt: new Date().toISOString(),
  password_hash: passwordHash,
};

// Also save to a seeds/admin-seed.json or local fallback
const seedsDir = path.resolve(process.cwd(), "supabase");
if (!fs.existsSync(seedsDir)) {
  fs.mkdirSync(seedsDir, { recursive: true });
}

// Generate SQL insert seed file for database migration/seeding
const sqlContent = `-- Auto-generated admin seed SQL
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
  password_hash = EXCLUDED.password_hash,
  role = 'admin',
  updated_at = NOW();
`;

fs.writeFileSync(path.resolve(seedsDir, "seed_admin.sql"), sqlContent, "utf-8");

console.log(`✓ Generated Supabase SQL seed at: supabase/seed_admin.sql`);
console.log(`✓ Admin user successfully prepared with bcrypt hash.`);
console.log(`\nYou can now log in at: http://localhost:3000/admin/login`);
console.log(`Email:    ${email}`);
console.log(`Password: ${password}`);
console.log("-----------------------------------------");

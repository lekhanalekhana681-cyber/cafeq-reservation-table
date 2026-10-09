# CafeQ - Table Reservation & Cafe Management System

CafeQ is a modern cafe table reservation and operations management application with customer self-service booking and a dedicated Admin Management Console.

---

## 🔐 Administrator Account Setup

### Default Credentials (Development Only)
- **Admin Username:** `CafeQ`
- **Admin Email:** `admin@cafeq.com`
- **Admin Password:** `Cafe@123`
- **Admin Login Route:** `/admin/login`
- **Admin Dashboard:** `/admin`

> [!WARNING]
> **CRITICAL SECURITY REQUIREMENT FOR PRODUCTION DEPLOYMENT**  
> The default credentials (`CafeQ` / `Cafe@123`) are provided exclusively for local development and initial provisioning. **You MUST change the administrator password before deploying this application to production.**  
> Update `ADMIN_USERNAME` and `ADMIN_PASSWORD` in your production environment variables / `.env` file, and change the password via the Admin Console UI before going live. Never commit production credentials to source control.

---

## 🛠️ Environment Variables Configuration

Copy `.env.example` to `.env` or set environment variables in your hosting environment:

```env
# Supabase Configuration (Optional - falls back to persistent local storage)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Administrator Account Provisioning (Idempotent Seed Configuration)
ADMIN_USERNAME=CafeQ
ADMIN_PASSWORD=Cafe@123
ADMIN_EMAIL=admin@cafeq.com
ADMIN_NAME=CafeQ Master Administrator
ADMIN_PHONE=+1-555-0199
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Seed Administrator Account
The seed script is idempotent; running it multiple times safely updates the existing admin record without creating duplicate entries:

```bash
npm run seed:admin
```

This script:
1. Reads `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_EMAIL` from `.env` (or environment variables).
2. Generates a secure salt and bcrypt password hash (`bcryptjs`). Never stores passwords in plain text.
3. Generates the SQL migration script at `supabase/seed_admin.sql` for Supabase/PostgreSQL.
4. Auto-seeds the browser storage for client-side offline development.

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📋 Features Overview

### 1. Customer Portal
- **Menu & Specialties:** Browse cafe dishes, beverages, and desserts.
- **Table Reservation:** Select table, party size, date, time slot, and special requests.
- **Customer Authentication:** Register and login with secure bcrypt-hashed passwords.
- **My Bookings:** View upcoming and past reservations with instant cancellation.

### 2. Administrator Portal (`/admin/login`)
- **Direct Navigation:** Click **"Admin Login"** in the top navigation bar or navigate to `/admin/login`.
- **Flexible Login:** Authenticate using either **Username (`CafeQ`)** or **Email (`admin@cafeq.com`)** with password `Cafe@123`.
- **Role Enforcement & Security:**
  - Strict role check (`role === "admin"`). Normal customer accounts receive an immediate `403 Access denied` message.
  - Rate limiting protection: Locks after 5 failed attempts for 15 minutes.
  - Automatic 2-hour session expiration.
  - All admin dashboard routes (`/admin`, `/admin/*`) are protected and redirect unauthorized requests to `/admin/login`.
- **Operations Dashboard:**
  - Real-time KPI summary cards (Today's bookings, Total bookings, Confirmed, Completed, Cancelled).
  - Search by guest name, booking code, phone, or email.
  - Filter by status (`confirmed`, `completed`, `cancelled`, `no_show`) and date (`today`, `upcoming`, `all`).
  - Action buttons to update status: **Confirm**, **Complete**, **No-Show**, and **Cancel**.
- **Change Master Password:**
  - Interactive "Change Password" modal accessible from the top navbar and the security banner.
  - Requires verification of current password and confirmation of new password (minimum 6 characters).
  - Securely re-hashes with bcrypt and updates the database/local storage.

---

## 🧪 Testing the Admin Flow

1. Navigate to `http://localhost:3000/admin/login`.
2. Enter:
   - **Admin Username or Email:** `CafeQ`
   - **Master Password:** `Cafe@123`
3. Click **Authenticate & Open Console**.
4. You will be redirected to `http://localhost:3000/admin`.
5. Notice the **Security Notice Banner** highlighting that default credentials should be updated for production.
6. Click **Change Password** (in header or banner) to test updating the admin credentials.
7. Click **Sign Out** in the top-right corner to terminate the admin session.

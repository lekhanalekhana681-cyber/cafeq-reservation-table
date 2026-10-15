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

### 3. Kitchen Staff Portal Setup
- **Kitchen Username:** `Kitchen`
- **Kitchen Email:** `kitchen@cafeq.com`
- **Kitchen Password:** `Kitchen@123`
- **Kitchen Login Route:** `/kitchen/login`
- **Kitchen KDS Dashboard:** `/kitchen`

> [!WARNING]
> **CRITICAL SECURITY REQUIREMENT FOR PRODUCTION DEPLOYMENT**  
> The default credentials (`Kitchen` / `Kitchen@123`) are provided exclusively for local development and initial provisioning. **You MUST change the kitchen password before deploying this application to production.**  
> Update `KITCHEN_USERNAME` and `KITCHEN_PASSWORD` in your production environment variables / `.env` file, or manage credentials via the Admin Console.

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
ADMIN_PHONE=+91 90000 00001

# Kitchen Staff Account Provisioning (Idempotent Seed Configuration)
KITCHEN_USERNAME=Kitchen
KITCHEN_PASSWORD=Kitchen@123
KITCHEN_EMAIL=kitchen@cafeq.com
KITCHEN_NAME=CafeQ Kitchen Staff
KITCHEN_PHONE=+91 90000 00002
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Seed Default Accounts
The seed scripts are idempotent; running them multiple times safely updates the existing records without creating duplicates:

```bash
# Seed Administrator
npm run seed:admin

# Seed Default Kitchen Staff
npm run seed:kitchen
```

### 3. Run Automated Tests
```bash
npm test
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📋 Features Overview

### 1. Customer Portal
- **Menu & Specialties:** Browse cafe dishes, beverages, and desserts. Out-of-stock items marked by the kitchen are automatically hidden in real time.
- **Table Reservation:** Select table, party size, date, time slot, and special requests.
- **Inline Food Pre-ordering:** Optional pre-order with live kitchen load buffering.
- **Customer Authentication:** Register and login with secure bcrypt-hashed passwords.
- **My Bookings:** View upcoming and past reservations with instant cancellation.

### 2. Administrator Portal (`/admin/login`)
- **Direct Navigation:** Click **"Admin"** in the top navigation bar or navigate to `/admin/login`.
- **Flexible Login:** Authenticate using either **Username (`CafeQ`)** or **Email (`admin@cafeq.com`)** with password `Cafe@123`.
- **Role Enforcement & Security:**
  - Strict role check (`role === "admin"`). Normal customer and kitchen accounts receive an immediate `403 Access denied` message.
  - Rate limiting protection: Locks after 5 failed attempts for 15 minutes.
  - Automatic 2-hour session expiration.
- **Operations Dashboard:**
  - Real-time KPI summary cards (Today's bookings, Total bookings, Confirmed, Completed, Cancelled).
  - Search by guest name, booking code, phone, or email.
  - Filter by status and date.
- **Manage Kitchen Staff:**
  - Create new kitchen staff accounts directly from the console.
  - Enable or disable kitchen staff access with one click.
  - Reset kitchen staff passwords with secure bcrypt hashing.

### 3. Kitchen Display System (KDS) Portal (`/kitchen/login` & `/kitchen`)
- **Dedicated Route & Station:** Built specifically for kitchen line cooks, pastry chefs, and baristas.
- **Strict Role Isolation:** Kitchen users can access only kitchen screens and are prevented from viewing the administrative management console. Administrators can access both.
- **Live Real-time Orders Board:**
  - Incoming orders update instantly via multi-channel real-time event bus (`BroadcastChannel`, WebSockets, and `StorageEvent`).
  - Native Web Audio synthesizer chime alert when new paid or confirmed orders arrive.
  - Highlighted "New" ticket badge.
  - Displays ticket #, table number or order type (Dine-in, Takeaway, Delivery), item quantities, veg/non-veg indicator, and customer special instructions.
- **Kanban Pipeline Columns:**
  - `New Tickets` → `In Prep` → `Ready / Plated` → `Completed`, plus a dedicated `Cancelled` view.
  - One-tap status buttons: **Accept & Prep**, **Mark Ready**, **Complete / Served**, and **Reject**.
  - Marking an order "Ready" immediately triggers customer WhatsApp / SMS / In-App notifications.
- **Color-Coded Running Prep Timers:**
  - Live second-by-second elapsed timer on every card.
  - 🟢 **Green:** Under 50% elapsed prep time.
  - 🟡 **Yellow:** 50% - 100% elapsed prep time.
  - 🔴 **Red:** Exceeded estimated prep time (Pulsating **OVERDUE** indicator).
- **Kitchen Tools & Station Routing:**
  - Filter by preparation station: *All Stations*, *Beverages*, *Momos*, *Fast Food*, *Desserts*, *Cocktails*.
  - Filter by order type: *All Types*, *Dine-in*, *Takeaway*, *Delivery*.
  - **Item-Level Checklist:** Tap individual items to mark them done as they are plated.
  - **86 / Out of Stock Manager:** Toggle items unavailable with one tap; automatically hides them from the customer menu and reservation pre-order picker in real time.
  - **Order Rejection with Reason:** Modal to enter cancellation reasons (e.g. ingredient shortage, kitchen capacity reached), recorded and displayed to guest and admin.
  - **Top KPI Bar:** Live active queue count, average prep time today, and ready count.
  - **Daily History View:** Searchable audit trail of today's accepted, plated, served, and rejected orders.
  - **Touch & Wall Mount Ready:** High-contrast dark layout with HTML5 Fullscreen toggle.

---

## 🧪 Testing the Flows

### Testing Kitchen Terminal
1. Navigate to `http://localhost:3000/kitchen/login`.
2. Enter:
   - **Username:** `Kitchen`
   - **Password:** `Kitchen@123`
3. Click **Unlock Kitchen Console**.
4. You will arrive at the live KDS dashboard (`/kitchen`).
5. Place a reservation with pre-ordered items on `/reserve` in another tab to observe the live audio chime, real-time ticket arrival, timer, and station filters.
6. Open **86 / Out of Stock** in the kitchen header and mark an item out of stock, then verify it is hidden on `/menu`.

### Testing Admin Console
1. Navigate to `http://localhost:3000/admin/login`.
2. Enter:
   - **Admin Username:** `CafeQ`
   - **Password:** `Cafe@123`
3. Click **Authenticate & Open Console**.
4. Notice the **Manage Kitchen Staff** button to add, disable, or reset kitchen staff accounts.


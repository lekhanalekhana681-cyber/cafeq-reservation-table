-- 20260930123000_create_users_table.sql
-- Migration to add users table for CafeQ authentication and link bookings to users

create table if not exists users (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  email text not null unique,
  phone text not null,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Index on user email for fast lookups during login/registration
create index if not exists idx_users_email on users(lower(email));

-- Alter bookings table to link to user and allow cancellation/status tracking
alter table bookings add column if not exists user_id uuid references users(id) on delete set null;
alter table bookings add column if not exists status text default 'confirmed'; -- 'confirmed' | 'cancelled'

-- Indexes on bookings
create index if not exists idx_bookings_user_id on bookings(user_id);
create index if not exists idx_bookings_status on bookings(status);

-- 20260922141500_create_reserve_tables.sql
-- Supabase migration to add tables for reservation system and pre‑order

create table tables (
  id uuid default uuid_generate_v4() primary key,
  type varchar not null, -- e.g., 'top', 'communal', 'window', 'outdoor'
  min_capacity integer not null,
  max_capacity integer not null,
  total_count integer not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table menu_items (
  id uuid default uuid_generate_v4() primary key,
  name varchar not null,
  category varchar not null,
  price numeric(10,2) not null,
  description text,
  image_url varchar,
  prep_time_minutes integer default 5,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table bookings (
  id uuid default uuid_generate_v4() primary key,
  code varchar not null unique,
  date date not null,
  time time not null,
  party_size integer not null,
  table_type varchar not null,
  occasion varchar,
  name varchar not null,
  phone varchar not null,
  email varchar,
  notes text,
  dietary jsonb default '[]'::jsonb,
  accessibility jsonb default '[]'::jsonb,
  has_preorder boolean default false,
  payment_method varchar,
  payment_status varchar,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table booking_items (
  id uuid default uuid_generate_v4() primary key,
  booking_id uuid references bookings(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  quantity integer not null,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Indexes for fast lookup
create index idx_bookings_code on bookings(code);
create index idx_bookings_date on bookings(date);

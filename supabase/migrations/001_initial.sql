-- Personal PM System — initial schema (Firestore document parity)
-- Run once in Supabase: SQL Editor → New query → paste → Run

create table if not exists areas (
  id text primary key,
  document jsonb not null
);

create table if not exists vision_items (
  id text primary key,
  document jsonb not null
);

create table if not exists goals (
  id text primary key,
  document jsonb not null
);

create table if not exists tasks (
  id text primary key,
  document jsonb not null
);

create table if not exists assignees (
  id text primary key,
  document jsonb not null
);

create table if not exists metrics (
  id text primary key,
  document jsonb not null
);

create table if not exists metric_readings (
  id text primary key,
  metric_id text not null,
  recorded_at timestamptz not null,
  document jsonb not null
);

create index if not exists metric_readings_metric_recorded
  on metric_readings (metric_id, recorded_at);

create table if not exists days (
  id text primary key,
  document jsonb not null
);

create table if not exists cadence_rules (
  id text primary key,
  document jsonb not null
);

create table if not exists knowledge_entries (
  id text primary key,
  document jsonb not null
);

create table if not exists user_chats (
  id text primary key,
  document jsonb not null
);

create table if not exists initiatives (
  id text primary key,
  document jsonb not null
);

create table if not exists settings (
  id text primary key,
  document jsonb not null
);

-- Lock down direct client access; server uses service_role (bypasses RLS).
alter table areas enable row level security;
alter table vision_items enable row level security;
alter table goals enable row level security;
alter table tasks enable row level security;
alter table assignees enable row level security;
alter table metrics enable row level security;
alter table metric_readings enable row level security;
alter table days enable row level security;
alter table cadence_rules enable row level security;
alter table knowledge_entries enable row level security;
alter table user_chats enable row level security;
alter table initiatives enable row level security;
alter table settings enable row level security;

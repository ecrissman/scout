-- Scout — Web Push subscriptions
-- Run this manually in the Supabase SQL editor.
--
-- One row per browser/device subscription. `endpoint` is unique because the
-- push service URL fully identifies a subscription. `tz` lets the cron decide
-- whether it's 20:00 locally for that user without storing per-user prefs
-- elsewhere.

create extension if not exists "pgcrypto";

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  tz          text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

-- The Pages Function uses the service role key to read/write this table, so
-- RLS is enabled but no policies are added (service role bypasses RLS).
alter table public.push_subscriptions enable row level security;

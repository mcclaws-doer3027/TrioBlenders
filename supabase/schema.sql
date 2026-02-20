-- =====================================================================
--  HX-12: Neighborhood Safety Reporting System - Supabase Schema
--  Run this entire file in your Supabase SQL Editor
--  (supabase.com/dashboard -> SQL Editor -> New query -> Paste & Run)
-- =====================================================================

-- ─── 1. EXTENSIONS ───────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── 2. PROFILES ─────────────────────────────────────────────────────
-- Linked to auth.users. Stores the user's role and push notification token.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'citizen' check (role in ('citizen', 'police')),
  push_token  text,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'citizen')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── 3. SOS ALERTS ───────────────────────────────────────────────────
create table if not exists public.sos_alerts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id) on delete set null,
  lat         double precision not null,
  lng         double precision not null,
  status      text not null default 'active' check (status in ('active', 'resolved')),
  video_path  text,  -- path in sos-evidence bucket
  created_at  timestamptz not null default now()
);

create index if not exists sos_alerts_user_id_idx on public.sos_alerts(user_id);
create index if not exists sos_alerts_status_idx  on public.sos_alerts(status);

-- ─── 4. REPORTS ──────────────────────────────────────────────────────
create table if not exists public.reports (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id) on delete set null,
  description text not null,
  lat         double precision,
  lng         double precision,
  photo_path  text,  -- path in report-evidence bucket
  status      text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at  timestamptz not null default now()
);

create index if not exists reports_user_id_idx on public.reports(user_id);
create index if not exists reports_status_idx  on public.reports(status);

-- ─── 5. ROW LEVEL SECURITY ───────────────────────────────────────────

-- PROFILES: users can read all profiles, update only their own
alter table public.profiles enable row level security;

create policy "Profiles are viewable by all authenticated users"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- SOS ALERTS: citizens can insert; police & owner can select; owner can update
alter table public.sos_alerts enable row level security;

create policy "Authenticated users can insert SOS alerts"
  on public.sos_alerts for insert
  with check (auth.role() = 'authenticated');

create policy "Police can view all SOS alerts"
  on public.sos_alerts for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'police'
    )
    or user_id = auth.uid()
  );

create policy "Owner or police can update SOS alerts"
  on public.sos_alerts for update
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'police'
    )
  );

-- REPORTS: citizens can insert; police & owner can select
alter table public.reports enable row level security;

create policy "Authenticated users can insert reports"
  on public.reports for insert
  with check (auth.role() = 'authenticated');

create policy "Police can view all reports"
  on public.reports for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'police'
    )
    or user_id = auth.uid()
  );

-- ─── 6. STORAGE BUCKETS ──────────────────────────────────────────────
-- Run these separately if bucket creation via SQL is available;
-- otherwise create them manually in Storage → New bucket.

-- NOTE: If these error, just create the buckets manually in the
-- Supabase Dashboard -> Storage -> New bucket (set to Private for both).

insert into storage.buckets (id, name, public)
values ('sos-evidence', 'sos-evidence', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('report-evidence', 'report-evidence', false)
on conflict (id) do nothing;

-- Storage RLS: authenticated users can upload; police can read/download
create policy "Authenticated users can upload SOS evidence"
  on storage.objects for insert
  with check (bucket_id = 'sos-evidence' and auth.role() = 'authenticated');

create policy "Police can read SOS evidence"
  on storage.objects for select
  using (
    bucket_id = 'sos-evidence'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'police'
    )
  );

create policy "Owner can read own SOS evidence"
  on storage.objects for select
  using (
    bucket_id = 'sos-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Authenticated users can upload report evidence"
  on storage.objects for insert
  with check (bucket_id = 'report-evidence' and auth.role() = 'authenticated');

create policy "Police can read report evidence"
  on storage.objects for select
  using (
    bucket_id = 'report-evidence'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'police'
    )
  );

-- ─── 7. REALTIME ─────────────────────────────────────────────────────
-- Enable realtime for both tables so the police dashboard updates live
alter publication supabase_realtime add table public.sos_alerts;
alter publication supabase_realtime add table public.reports;

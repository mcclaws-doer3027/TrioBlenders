-- =====================================================================
--  HX-12 DEMO FIX: Allow anon inserts for no-auth demo
--  Run this in Supabase → SQL Editor → New Query → Run
--
--  CONTEXT: The app uses NO authentication (anon key only).
--  The existing schema requires auth.role() = 'authenticated' for inserts,
--  which blocks ALL inserts/uploads in the demo. This script replaces those
--  policies with anon-friendly ones for the demo.
--
--  ⚠️  FOR PRODUCTION: Replace these policies with proper auth checks.
-- =====================================================================

-- ─── SOS ALERTS ──────────────────────────────────────────────────────

-- Drop the old blocking policy
drop policy if exists "Authenticated users can insert SOS alerts" on public.sos_alerts;

-- Allow anyone (including anon) to insert SOS alerts
create policy "Anon users can insert SOS alerts"
  on public.sos_alerts for insert
  with check (true);

-- Drop the old select policy (anon can't pass the police check)
drop policy if exists "Police can view all SOS alerts" on public.sos_alerts;

-- Allow anyone to read all alerts (needed for the demo realtime feed)
create policy "Anyone can view SOS alerts"
  on public.sos_alerts for select
  using (true);

-- Drop the old update policy
drop policy if exists "Owner or police can update SOS alerts" on public.sos_alerts;

-- Allow anyone to update alerts (so uploadEvidence can set video_path + status)
create policy "Anyone can update SOS alerts"
  on public.sos_alerts for update
  using (true);

-- ─── STORAGE: sos-evidence BUCKET ───────────────────────────────────

-- Drop the old blocking upload policy
drop policy if exists "Authenticated users can upload SOS evidence" on storage.objects;

-- Allow anyone (including anon) to upload to sos-evidence
create policy "Anon users can upload SOS evidence"
  on storage.objects for insert
  with check (bucket_id = 'sos-evidence');

-- Drop the old select policies
drop policy if exists "Police can read SOS evidence" on storage.objects;
drop policy if exists "Owner can read own SOS evidence" on storage.objects;

-- Allow anyone to read from sos-evidence
create policy "Anyone can read SOS evidence"
  on storage.objects for select
  using (bucket_id = 'sos-evidence');

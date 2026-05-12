-- 2026-05-12: Prospect activity log (lead-style tracking for the gym pipeline)
--
-- Captures every interaction with a prospect: WhatsApp sends, calls, visits,
-- notes, status changes. Mirrors pulse_lead_activities but for the admin-side
-- outreach pipeline (pulse_prospects). Outcome is a separate enum so the
-- operator can record "no_response", "interested", "scheduled_visit" etc. on
-- a two-step flow — log the send, come back later and record the response.

create table if not exists pulse_prospect_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references pulse_prospects(id) on delete cascade,
  type text not null check (type in (
    'whatsapp', 'call', 'visit', 'note', 'status_change'
  )),
  outcome text check (outcome in (
    'no_response', 'answered', 'interested', 'not_interested',
    'scheduled_visit', 'onboarded', 'rejected', 'other'
  )),
  content text,
  template_key text,
  created_by uuid references pulse_profiles(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pulse_prospect_activities_prospect
  on pulse_prospect_activities(prospect_id, created_at desc);

create index if not exists idx_pulse_prospect_activities_outcome
  on pulse_prospect_activities(outcome)
  where outcome is not null;

-- RLS — only admins (full or prospects scope) can read/write. Mirrors the
-- pulse_prospects access pattern. Service-role bypasses anyway for server
-- actions; this protects against direct PostgREST access from a stolen JWT.
alter table pulse_prospect_activities enable row level security;

create policy "pulse_prospect_activities_admin_select"
  on pulse_prospect_activities
  for select
  using (
    exists (
      select 1 from pulse_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create policy "pulse_prospect_activities_admin_insert"
  on pulse_prospect_activities
  for insert
  with check (
    exists (
      select 1 from pulse_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create policy "pulse_prospect_activities_admin_update"
  on pulse_prospect_activities
  for update
  using (
    exists (
      select 1 from pulse_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create policy "pulse_prospect_activities_admin_delete"
  on pulse_prospect_activities
  for delete
  using (
    exists (
      select 1 from pulse_profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Denormalized last_outcome on the prospect itself so the pipeline table can
-- show "Interested" / "No response" badges without fetching activities. Kept
-- in sync by the recordProspectOutcome / logProspectActivity server actions.
alter table pulse_prospects
  add column if not exists last_outcome text
  check (last_outcome in (
    'no_response', 'answered', 'interested', 'not_interested',
    'scheduled_visit', 'onboarded', 'rejected', 'other'
  ));

notify pgrst, 'reload schema';

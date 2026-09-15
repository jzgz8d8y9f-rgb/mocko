-- Owner-reviewed queue of schools users typed in because they weren't on
-- the canonical list yet. No read policy on purpose: this is reviewed
-- directly (Management API), then popular entries get folded into
-- CANONICAL_SCHOOLS in a follow-up code change -- there's no in-app admin
-- UI for a single-owner app.
create table public.pending_schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.pending_schools enable row level security;

create policy "Users can suggest a school"
  on public.pending_schools for insert
  with check (auth.uid() = requested_by);

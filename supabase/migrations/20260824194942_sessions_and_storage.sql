-- Practice sessions: one row per completed HireVue Practice recording.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track text not null default 'Finance',
  format text not null check (format in ('Behavioral', 'Technical', 'Both')),
  length text not null check (length in ('Quick', 'Full')),
  question_text text not null,
  transcript text,
  wpm integer,
  filler_count integer,
  avg_pause_length numeric,
  overall_score numeric,
  category_scores jsonb,
  pointers_good jsonb,
  pointers_work jsonb,
  recording_path text,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Users can view their own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

-- Recordings bucket: private, per-user folders (recordings/{user_id}/...).
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create policy "Users can upload to their own recordings folder"
  on storage.objects for insert
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read their own recordings"
  on storage.objects for select
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

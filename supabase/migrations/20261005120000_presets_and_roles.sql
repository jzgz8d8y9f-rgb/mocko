-- Interview setup presets, saved roles, and the "last session" shortcut.
-- Everything cascade-deletes with the owning user, same as sessions/resumes,
-- so delete_own_account() cleans these up automatically.

-- A job a person is preparing for: title, company and the pasted description.
create table public.saved_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  company text not null default '',
  description text not null,
  industry text,
  created_at timestamptz not null default now()
);

alter table public.saved_roles enable row level security;

create policy "Users can view their own saved roles"
  on public.saved_roles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own saved roles"
  on public.saved_roles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own saved roles"
  on public.saved_roles for update
  using (auth.uid() = user_id);

create policy "Users can delete their own saved roles"
  on public.saved_roles for delete
  using (auth.uid() = user_id);

-- A saved Mock Interview setup. The resume and role are references, so an
-- uploaded file or pasted job description is stored once and reused.
create table public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_favorite boolean not null default false,
  industry text not null,
  length text not null check (length in ('Quick', 'Short', 'Full')),
  type text not null check (type in ('Behavioral', 'Technical', 'Both')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  resume_id uuid references public.resumes (id) on delete set null,
  resume_focus text[] not null default '{}',
  role_id uuid references public.saved_roles (id) on delete set null,
  role_question_count smallint not null default 2 check (role_question_count in (1, 2)),
  ask_questions boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.presets enable row level security;

create policy "Users can view their own presets"
  on public.presets for select
  using (auth.uid() = user_id);

create policy "Users can insert their own presets"
  on public.presets for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own presets"
  on public.presets for update
  using (auth.uid() = user_id);

create policy "Users can delete their own presets"
  on public.presets for delete
  using (auth.uid() = user_id);

-- The setup of the most recent Mock Interview (including ones that weren't
-- saved as a preset), so "Last session" can be repeated in one tap.
alter table public.profiles add column last_setup jsonb;

-- Resume Lab: saved grade results and generated cover letters.
-- Both cascade-delete with the owning user, same as sessions/resumes/etc,
-- so delete_own_account() cleans these up automatically.

create table public.resume_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid not null references public.resumes (id) on delete cascade,
  overall_score numeric not null,
  categories jsonb not null,
  flags jsonb not null default '[]'::jsonb,
  good_points jsonb not null default '[]'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.resume_reviews enable row level security;

create policy "Users can view their own resume reviews"
  on public.resume_reviews for select
  using (auth.uid() = user_id);

create policy "Users can insert their own resume reviews"
  on public.resume_reviews for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own resume reviews"
  on public.resume_reviews for delete
  using (auth.uid() = user_id);

create table public.cover_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid references public.resumes (id) on delete set null,
  job_title text not null,
  company text not null,
  job_description text not null,
  additional_info text,
  word_length text not null default 'recommended' check (word_length in ('short', 'recommended', 'long')),
  letter_text text not null,
  created_at timestamptz not null default now()
);

alter table public.cover_letters enable row level security;

create policy "Users can view their own cover letters"
  on public.cover_letters for select
  using (auth.uid() = user_id);

create policy "Users can insert their own cover letters"
  on public.cover_letters for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own cover letters"
  on public.cover_letters for delete
  using (auth.uid() = user_id);

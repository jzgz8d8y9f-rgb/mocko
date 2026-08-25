-- Mock Interview rebuild: schema for a real voice interview pipeline.
-- Every new column is nullable/defaulted so existing On-Air Practice
-- insert paths (which never send these fields) are untouched.

alter table public.sessions add column mode text not null default 'record' check (mode in ('record','voice'));
alter table public.sessions add column difficulty text check (difficulty in ('easy','medium','hard'));

alter table public.questions add column tags text[] not null default '{}';
alter table public.questions add column follow_up_bank text[] not null default '{}';
alter table public.questions add column closing_friendly boolean not null default false;
alter table public.questions add column opener boolean not null default false;

-- One row per question within a Mock Interview session -- needed so the
-- results screen can show a transcript next to each question's own
-- mini-score, and so "retry just the toughest question" can update one
-- row and recalculate the parent aggregate, neither of which a flat
-- per-question sessions row (On-Air's existing pattern) supports.
create table public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_index integer not null,
  question_id uuid references public.questions(id) on delete set null,
  question_text text not null,
  question_type text not null check (question_type in ('behavioral','technical')),
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  source text not null default 'guide' check (source in ('guide','resume','opener','closing')),
  transcript text not null,
  duration_sec integer,
  follow_up_asked boolean not null default false,
  follow_up_transcript text,
  note text,
  category_scores jsonb,
  mini_score numeric,
  is_toughest boolean not null default false,
  retried_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.session_questions enable row level security;
create policy "select own session_questions" on public.session_questions for select using (auth.uid() = user_id);
create policy "insert own session_questions" on public.session_questions for insert with check (auth.uid() = user_id);
create policy "update own session_questions" on public.session_questions for update using (auth.uid() = user_id);
create index session_questions_session_id_idx on public.session_questions(session_id);

-- Placeholder opener/closing/technical rows so Phase 3's selection
-- logic has real rows to exercise before the real guide docs arrive.
insert into public.questions (text, category, difficulty, industries, weight, opener, closing_friendly) values
('Tell me about yourself.', 'behavioral', 'easy', '{general}', 10, true, false),
('Walk me through your resume.', 'behavioral', 'easy', '{general}', 10, true, false),
('Give me a quick summary of your background and what brought you here today.', 'behavioral', 'easy', '{general}', 10, true, false);

insert into public.questions (text, category, difficulty, industries, weight, closing_friendly) values
('Is there anything about your background you feel we haven''t covered?', 'behavioral', 'easy', '{general}', 10, true),
('What questions do you have for me?', 'behavioral', 'easy', '{general}', 10, true),
('Anything else you''d like us to know before we wrap up?', 'behavioral', 'medium', '{general}', 10, true);

insert into public.questions (text, category, difficulty, industries, weight, tags) values
('Walk me through how you would build a 3-statement model from scratch.', 'technical', 'medium', '{ib}', 10, '{modeling}'),
('Walk me through a DCF, and what would make you use it over comps.', 'technical', 'medium', '{ib,pe}', 10, '{valuation}'),
('What happens to the three financial statements if depreciation increases by $10?', 'technical', 'hard', '{ib}', 10, '{accounting}'),
('How would you size the market for a new consumer subscription product?', 'technical', 'medium', '{consulting,tech}', 10, '{estimation}'),
('Explain the difference between enterprise value and equity value, and when you''d use each.', 'technical', 'easy', '{ib,pe,quant}', 10, '{valuation}');

-- Behavioral question bank, profile industry preference, and resumes
-- (for resume-tailored questions).

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  category text not null check (category in ('behavioral', 'technical')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  industries text[] not null default '{general}',
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

create policy "Anyone can read questions"
  on public.questions for select
  using (true);

alter table public.profiles add column industry text;

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  storage_path text not null,
  is_primary boolean not null default false,
  extracted_text text,
  created_at timestamptz not null default now()
);

alter table public.resumes enable row level security;

create policy "Users can view their own resumes"
  on public.resumes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own resumes"
  on public.resumes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own resumes"
  on public.resumes for update
  using (auth.uid() = user_id);

create policy "Users can delete their own resumes"
  on public.resumes for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "Users can view their own resume files"
  on storage.objects for select
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own resume files"
  on storage.objects for insert
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own resume files"
  on storage.objects for delete
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Original question bank (see plan notes: inspired by standard,
-- industry-wide behavioral prompts, not transcribed from any single
-- guide). ~20 easy / ~25 medium / ~18 hard, mostly tagged 'general'
-- with a handful of industry-specific "why this field" variants.

insert into public.questions (text, category, difficulty, industries) values
-- Easy
('Tell me about yourself.', 'behavioral', 'easy', '{general}'),
('Walk me through your resume.', 'behavioral', 'easy', '{general}'),
('Why are you interested in this role?', 'behavioral', 'easy', '{general}'),
('What do you know about our firm?', 'behavioral', 'easy', '{general}'),
('What are your greatest strengths?', 'behavioral', 'easy', '{general}'),
('What''s one area you''re actively working to improve?', 'behavioral', 'easy', '{general}'),
('Why investment banking?', 'behavioral', 'easy', '{ib}'),
('Why management consulting?', 'behavioral', 'easy', '{consulting}'),
('Why do you want to work in tech?', 'behavioral', 'easy', '{tech}'),
('Why quantitative trading or research?', 'behavioral', 'easy', '{quant}'),
('Why private equity?', 'behavioral', 'easy', '{pe}'),
('What do you do outside of work or school?', 'behavioral', 'easy', '{general}'),
('Where do you see yourself in five years?', 'behavioral', 'easy', '{general}'),
('What makes you a strong fit for this team?', 'behavioral', 'easy', '{general}'),
('What''s a recent piece of news in this industry that caught your attention?', 'behavioral', 'easy', '{general}'),
('How did you first become interested in this field?', 'behavioral', 'easy', '{general}'),
('What was your favorite class or project, and why?', 'behavioral', 'easy', '{general}'),
('What are you most proud of on your resume?', 'behavioral', 'easy', '{general}'),
('How would a close friend describe you?', 'behavioral', 'easy', '{general}'),
('What questions do you have for me?', 'behavioral', 'easy', '{general}'),
-- Medium
('Tell me about a time you disagreed with a teammate. How did you handle it?', 'behavioral', 'medium', '{general}'),
('Describe a time you had to work under a tight deadline.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you failed at something. What did you learn?', 'behavioral', 'medium', '{general}'),
('Describe a situation where you had to lead a team through a difficult moment.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you received tough feedback. How did you respond?', 'behavioral', 'medium', '{general}'),
('Describe a time you had to persuade someone who disagreed with you.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you made a mistake at work or school. How did you handle it?', 'behavioral', 'medium', '{general}'),
('Describe a time you had to manage competing priorities.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you went above and beyond what was expected of you.', 'behavioral', 'medium', '{general}'),
('Describe a time you had to work with someone difficult.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you had to learn something quickly to complete a task.', 'behavioral', 'medium', '{general}'),
('Describe a situation where you had incomplete information but had to make a decision anyway.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you took initiative without being asked.', 'behavioral', 'medium', '{general}'),
('Describe a time your team didn''t meet its goal. What happened?', 'behavioral', 'medium', '{general}'),
('Tell me about a time you had to give someone difficult feedback.', 'behavioral', 'medium', '{general}'),
('Describe an ethical dilemma you''ve faced and how you resolved it.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you had to adapt to a major, unexpected change.', 'behavioral', 'medium', '{general}'),
('Describe a time you worked with a diverse group of people toward a shared goal.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you had to say no to someone.', 'behavioral', 'medium', '{general}'),
('Describe the most difficult decision you''ve had to make in the last year.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you juggled multiple deadlines at once.', 'behavioral', 'medium', '{general}'),
('Describe a time you turned around a bad situation.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you had to use data to make a case for something.', 'behavioral', 'medium', '{ib,quant,pe}'),
('Describe a time you didn''t get along with a manager or supervisor.', 'behavioral', 'medium', '{general}'),
('Tell me about a time you had to explain something complex to someone without your background.', 'behavioral', 'medium', '{general}'),
-- Hard
('What''s the biggest criticism you''ve received, and do you agree with it?', 'behavioral', 'hard', '{general}'),
('Tell me about a time you let someone down. What would you do differently?', 'behavioral', 'hard', '{general}'),
('If I called your last manager right now, what would they say is your biggest weakness?', 'behavioral', 'hard', '{general}'),
('Describe a time you completely changed your mind about something important.', 'behavioral', 'hard', '{general}'),
('Tell me about a time you disagreed with a decision your team made and had to go along with it anyway.', 'behavioral', 'hard', '{general}'),
('What''s something you''re insecure about professionally?', 'behavioral', 'hard', '{general}'),
('Tell me about a time your work was criticized in front of others.', 'behavioral', 'hard', '{general}'),
('Describe the worst feedback you''ve ever gotten and how it changed you.', 'behavioral', 'hard', '{general}'),
('If your closest friend had to name your biggest flaw, what would they say?', 'behavioral', 'hard', '{general}'),
('Name 10 things you could use a pencil for that aren''t writing.', 'behavioral', 'hard', '{general}'),
('Sell me this stapler in 60 seconds.', 'behavioral', 'hard', '{general}'),
('If you were a kitchen appliance, which one would you be and why?', 'behavioral', 'hard', '{general}'),
('You have 60 seconds: convince me the office should switch to a 4-day work week.', 'behavioral', 'hard', '{general}'),
('Name as many uses as you can for a paperclip in one minute.', 'behavioral', 'hard', '{general}'),
('If you could only ask one question to figure out if someone would be a great hire, what would it be?', 'behavioral', 'hard', '{general}'),
('Pitch your own job search to me like you''re pitching a stock.', 'behavioral', 'hard', '{ib,pe}'),
('What''s a belief you hold that most people in this industry would disagree with?', 'behavioral', 'hard', '{general}'),
('Tell me about a time you had to defend an unpopular opinion.', 'behavioral', 'hard', '{general}');

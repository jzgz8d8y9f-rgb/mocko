-- Graded "questions you asked the interviewer" from a Mock Interview session
-- (the optional ask-the-interviewer setting). Null when the setting was off.
alter table public.sessions add column if not exists candidate_questions jsonb;

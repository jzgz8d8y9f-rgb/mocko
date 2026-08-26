-- Lets a Mock Interview be explicitly saved mid-session and resumed later.
-- Only the not-yet-asked question set needs persisting -- already-answered
-- questions are recoverable from session_questions, and current progress
-- is just the count of those rows, so this is the only new state needed.
alter table public.sessions add column saved_state jsonb;

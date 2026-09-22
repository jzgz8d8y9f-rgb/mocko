-- The setup screen now offers three lengths (Quick = 1 question, Short = 3,
-- Full = 5) but sessions.length was still restricted to the original two, so
-- saving a Short session would have failed the check.
alter table public.sessions drop constraint sessions_length_check;
alter table public.sessions add constraint sessions_length_check check (length in ('Quick', 'Short', 'Full'));

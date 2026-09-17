-- Tracks whether a user has already been shown the pre-setup click-through
-- tutorial for each interview mode, so it only auto-shows once per mode and
-- a "?" icon on the mode card is the only way to see it again afterward.
alter table public.profiles
  add column seen_voice_tutorial boolean not null default false,
  add column seen_record_tutorial boolean not null default false;

-- Anyone who's already run a session in a given mode has necessarily already
-- learned how it works through actual use -- don't interrupt them with a
-- tutorial for something they're already familiar with just because this
-- particular click-through UI is new.
update public.profiles p
set seen_voice_tutorial = true
where exists (select 1 from public.sessions s where s.user_id = p.user_id and s.mode = 'voice');

update public.profiles p
set seen_record_tutorial = true
where exists (select 1 from public.sessions s where s.user_id = p.user_id and s.mode = 'record');

-- OAuth sign-in (Google/LinkedIn) redirects away and back, so unlike the
-- in-app email signup wizard, there's no chance to collect name/username/
-- etc. before the account exists. This column lets the client tell "brand
-- new OAuth account, never onboarded" apart from a real returning session,
-- so it can send the former through the same wizard steps.
alter table public.profiles
  add column onboarding_completed boolean not null default false;

-- Every profile that already exists predates this flow entirely -- treat
-- them as already onboarded so they don't get an unexpected wizard next
-- time they sign in. Only fresh rows from here on default to false.
update public.profiles set onboarding_completed = true;

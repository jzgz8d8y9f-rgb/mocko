-- Username content/character policy. Backstop for the client-side check
-- in index.html -- a determined user could otherwise call the REST API
-- directly and bypass client-only validation.

-- Terms are stored already run through the same "collapse consecutive
-- repeated characters" normalization applied to candidates below (e.g.
-- 'asshole' -> 'ashole'), so a legitimately-spelled word and a
-- repeated-letter evasion of it ('asssshole') both normalize to the
-- same string and match this list either way.
create or replace function public.username_blocklist_terms()
returns text[] language sql immutable as $$
  select array[
    'fuck','shit','bitch','ashole','cunt','dick','pusy','whore','slut',
    'niger','niga','fagot','fag','retard',
    'nazi','hitler','kike','chink','spic','trany'
  ];
$$;

-- Normalizes a candidate username so simple evasions (leetspeak digit
-- substitution, inserted repeated characters) can't slip past the
-- blocklist substring check below.
create or replace function public.normalize_username_for_check(raw text)
returns text language sql immutable as $$
  select regexp_replace(
    translate(lower(raw), '013457$@', 'oieastsa'),
    '(.)\1+', '\1', 'g'
  );
$$;

create or replace function public.is_username_clean(raw text)
returns boolean language sql stable as $$
  select not exists (
    select 1 from unnest(public.username_blocklist_terms()) t
    where public.normalize_username_for_check(raw) like '%' || t || '%'
  );
$$;

-- Sanitize the auto-generated default username so it satisfies the new
-- charset constraint below -- email local-parts can contain '.'/'+'/etc,
-- which would otherwise make every signup with such an email fail at
-- insert time the moment that constraint goes live.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  base text;
begin
  base := regexp_replace(split_part(new.email, '@', 1), '[^A-Za-z0-9_]', '', 'g');
  if length(base) = 0 then
    base := 'user';
  end if;
  base := left(base, 13); -- leave room for '_' + 6 hex chars within the 20-char cap
  insert into public.profiles (user_id, username)
  values (new.id, base || '_' || substr(new.id::text, 1, 6));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

alter table public.profiles
  add constraint username_charset check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  add constraint username_clean check (public.is_username_clean(username));

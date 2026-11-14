-- 0001 Shared functions (low-level design sections 6.2 and 7.2 to 7.3).
-- Never edit this file once applied. A change is a new file.

-- The role carried in the session token. 'none' when there is no session.
create function public.app_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'app_role', 'none')
$$;

-- True when the caller came through the browser's data API, signed in or not.
-- Server functions (service role), scheduled jobs and migrations are not.
-- Reads the session role, so it gives the same answer inside definer functions.
create function public.is_browser() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('role', true), 'none'), session_user::text) in ('anon', 'authenticated')
$$;

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.set_owner() returns trigger
language plpgsql as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  return new;
end $$;

-- Monday of the week containing a timestamp, in UK time.
create function public.week_of(ts timestamptz) returns date
language sql immutable as $$
  select date_trunc('week', ts at time zone 'Europe/London')::date
$$;

-- First day of the quarter, in UK time.
create function public.quarter_of(ts timestamptz) returns date
language sql immutable as $$
  select date_trunc('quarter', ts at time zone 'Europe/London')::date
$$;

-- Working days between two dates, Monday to Friday. Public holidays are not
-- modelled in version 1.
create function public.working_days(d1 date, d2 date) returns int
language sql immutable as $$
  select count(*)::int
  from generate_series(d1 + 1, d2, interval '1 day') g
  where extract(isodow from g) < 6
$$;

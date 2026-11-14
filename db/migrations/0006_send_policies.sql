-- 0006 send_policies (section 13.5). One row per message type.
-- max_level is the ceiling the owner cannot raise from the app.
--
-- Departure from the DDL in 13.5, recorded in docs/decisions.md: channel also
-- allows 'either', because the seed table in 20.2 lists six types as
-- "email or linkedin". The channel of each message is still email or linkedin.

create table public.send_policies (
  type text primary key,
  label text not null,
  channel text not null check (channel in ('email', 'linkedin', 'either')),
  level text not null check (level in ('automatic', 'one_click', 'draft_only')),
  max_level text not null check (max_level in ('automatic', 'one_click', 'draft_only')),
  daily_cap int,
  weekly_cap int,
  per_run_cap int,
  min_days_between_same_person int not null default 7,
  send_window_start time not null default '09:00',
  send_window_end time not null default '17:30',
  recipient_tz_default text not null default 'America/New_York',
  requires_template boolean not null default true,
  paused boolean not null default false,
  paused_reason text,
  updated_at timestamptz not null default now()
);

create function public.send_level_rank(level text) returns int
language sql immutable as $$
  select case level when 'draft_only' then 0 when 'one_click' then 1 when 'automatic' then 2 end
$$;

-- The ceiling holds whoever is writing, so a slip in Settings or in code
-- cannot make a draft-only type automatic.
alter table public.send_policies
  add constraint send_policies_level_within_ceiling
  check (public.send_level_rank(level) <= public.send_level_rank(max_level));

create function public.send_policies_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if is_browser() then
    -- The owner may change the level, caps, hours and the pause. Nothing else.
    if new.type is distinct from old.type
       or new.max_level is distinct from old.max_level
       or new.channel is distinct from old.channel
       or new.requires_template is distinct from old.requires_template then
      raise exception 'This setting can only be changed by a migration';
    end if;
  end if;
  if new.level is distinct from old.level then
    perform write_audit('send level change', 'send_policies', null,
      jsonb_build_object('type', new.type, 'from', old.level, 'to', new.level));
  end if;
  return new;
end $$;

create trigger t_guard before update on public.send_policies
for each row execute function public.send_policies_guard();

-- P-SETTINGS: owner may select and update. Insert and delete only by migration.
revoke all on public.send_policies from anon;
revoke insert, delete, truncate, references, trigger on public.send_policies from authenticated;

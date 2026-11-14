-- 0013 app_settings (section 13.6). A single row of typed columns, not a key
-- and value store, so every setting is checked by the database.

create table public.app_settings (
  id boolean primary key default true check (id),
  -- The stop switch. True halts all sending at once.
  all_sending_paused boolean not null default false,
  icp_json jsonb not null default '{}',
  coaching_title_phrases text[] not null default array['coaching', 'LinkedIn audit', 'resume review', 'CV review'],
  league_days_premier int not null default 18 check (league_days_premier > 0),
  league_days_championship int not null default 30 check (league_days_championship > 0),
  league_days_league_one int not null default 49 check (league_days_league_one > 0),
  health_client_cooling_days int not null default 5,
  health_client_cold_days int not null default 7,
  health_candidate_cooling_days int not null default 3,
  health_candidate_cold_days int not null default 5,
  feedback_nudge_days int not null default 2,
  feedback_cooling_days int not null default 4,
  feedback_cold_days int not null default 7,
  stale_after_days int not null default 14 check (stale_after_days > 0),
  deck_default boolean not null default true,
  -- Home shows four numbers, in this order. The count stays at four (26.3).
  home_stats text[] not null default array['needs_you', 'follow_ups', 'calls_today', 'this_week']
    check (cardinality(home_stats) = 4 and home_stats <@ array[
      'needs_you', 'follow_ups', 'calls_today', 'this_week',
      'cold_searches', 'league_due', 'drafts_to_post']),
  theme text not null default 'paper' check (theme in ('paper', 'night')),
  font_sans text not null default 'Space Grotesk',
  font_mono text not null default 'Space Mono',
  working_hours jsonb not null default '{
    "mon": ["09:00", "20:00"], "tue": ["09:00", "20:00"], "wed": ["09:00", "20:00"],
    "thu": ["09:00", "20:00"], "fri": ["09:00", "17:00"]}',
  reviewer_email text check (reviewer_email is null or reviewer_email = lower(btrim(reviewer_email))),
  updated_at timestamptz not null default now()
);

-- Keeps the allow-list in step with the one reviewer address, and logs the
-- stop switch and reviewer changes (section 13.7).
create function public.app_settings_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.all_sending_paused is distinct from old.all_sending_paused then
    perform write_audit(case when new.all_sending_paused then 'stop switch on' else 'stop switch off' end,
      'app_settings', null, null);
  end if;
  if new.reviewer_email is distinct from old.reviewer_email then
    delete from allowed_emails where role = 'reviewer';
    if new.reviewer_email is not null then
      if exists (select 1 from allowed_emails where email = new.reviewer_email) then
        raise exception 'That address already has access';
      end if;
      insert into allowed_emails (email, role) values (new.reviewer_email, 'reviewer');
    end if;
    perform write_audit(case when new.reviewer_email is null then 'reviewer removed' else 'reviewer added' end,
      'app_settings', null, null);
  end if;
  return new;
end $$;

create trigger t_changed before update on public.app_settings
for each row execute function public.app_settings_changed();

-- P-SETTINGS: owner may select and update. Insert and delete only by migration.
revoke all on public.app_settings from anon;
revoke insert, delete, truncate, references, trigger on public.app_settings from authenticated;

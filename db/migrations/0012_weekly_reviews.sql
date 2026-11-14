-- 0012 weekly_reviews (section 13.3). One row per week.

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  week date not null,
  learned text,
  changes text,
  plan text,
  quarterly_focus text,
  summary_message_id uuid references public.messages (id),
  followup_block_minutes int,
  held_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, week)
);

create index weekly_reviews_summary_message on public.weekly_reviews (summary_message_id);

create trigger t_upd before update on public.weekly_reviews for each row execute function public.set_updated_at();
create trigger t_own before insert on public.weekly_reviews for each row execute function public.set_owner();

revoke all on public.weekly_reviews from anon;
revoke delete, truncate, references, trigger on public.weekly_reviews from authenticated;

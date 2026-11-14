-- 0007 inbox_items (section 8.1). One row per thing an agent found or a rule
-- raised. The item is the prompt to act; ref_table and ref_id name the record.

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  type text not null check (type in (
    'job_lead', 'signal', 'content_draft', 'event_idea', 'call_writeup',
    'follow_up', 'referral', 'client_nudge', 'wider_lead', 'auto_sent', 'system_notice')),
  agent text not null,
  run_id uuid references public.agent_runs (id),
  title text not null,
  person_id uuid references public.people (id),
  company text,
  role text,
  location text,
  why text,
  suggested_action text,
  draft text,
  draft_original text,
  source text,
  source_url text,
  links jsonb not null default '[]',
  ref_table text,
  ref_id uuid,
  dedup_key text not null,
  rank numeric(6,2) not null default 0,
  status text not null default 'new' check (status in (
    'new', 'approved', 'done', 'snoozed', 'binned', 'stale')),
  bin_reason text,
  snoozed_until date,
  due_on date,
  actioned_at timestamptz,
  closed_at timestamptz,
  purge_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Section 7.6.
create index inbox_items_status_created on public.inbox_items (status, created_at desc);
create unique index inbox_items_dedup on public.inbox_items (dedup_key) where status not in ('binned');
create index inbox_items_run on public.inbox_items (run_id);
create index inbox_items_person on public.inbox_items (person_id);
create index inbox_items_ref on public.inbox_items (ref_table, ref_id);

-- INB-2: moving to done sets actioned_at, closed_at and purge_after.
-- Binning closes the row too. Undo reopens it and clears those dates.
create function public.inbox_items_close() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('done', 'binned') then
      if new.status = 'done' then
        new.actioned_at := coalesce(new.actioned_at, now());
      end if;
      new.closed_at := coalesce(new.closed_at, now());
      new.purge_after := (new.closed_at + interval '12 months')::date;
    elsif old.status in ('done', 'binned') then
      new.actioned_at := null;
      new.closed_at := null;
      new.purge_after := null;
    end if;
  end if;
  -- draft_original is what the agent wrote and never changes.
  if old.draft_original is not null and new.draft_original is distinct from old.draft_original and is_browser() then
    raise exception 'draft_original cannot be changed';
  end if;
  return new;
end $$;

create trigger t_close before update on public.inbox_items for each row execute function public.inbox_items_close();
create trigger t_upd before update on public.inbox_items for each row execute function public.set_updated_at();
create trigger t_own before insert on public.inbox_items for each row execute function public.set_owner();

revoke all on public.inbox_items from anon;
revoke delete, truncate, references, trigger on public.inbox_items from authenticated;

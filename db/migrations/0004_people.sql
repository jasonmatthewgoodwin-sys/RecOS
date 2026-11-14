-- 0004 people (section 10.1). A thin reference to a person, not a contact
-- record. Never a CV, a phone number, pay or call note text.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  display_name text not null,
  name_key text not null,
  display_title text,
  display_company text,
  company_key text,
  city text,
  kind text not null default 'unknown' check (kind in (
    'candidate', 'client_contact', 'leader', 'referrer', 'colleague', 'unknown')),
  crm text check (crm in ('jobadder', 'spott')),
  crm_ref text,
  crm_url text,
  linkedin_url text,
  -- Only for people who are not in the CRM, such as a referral typed in by
  -- hand. Never copied from the CRM (section 6.5).
  email text,
  in_crm boolean not null default false,
  refreshed_on date,
  do_not_contact boolean not null default false,
  placed_by_desk boolean not null default false,
  notes_for_next_contact text,
  purge_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_email_only_outside_crm check (email is null or not in_crm)
);

create unique index people_crm_uniq on public.people (owner_id, crm, crm_ref) where crm_ref is not null;
create index people_name_company on public.people (owner_id, name_key, company_key);
create index people_linkedin on public.people (linkedin_url) where linkedin_url is not null;

create trigger t_upd before update on public.people for each row execute function public.set_updated_at();
create trigger t_own before insert on public.people for each row execute function public.set_owner();

revoke all on public.people from anon;
revoke delete, truncate, references, trigger on public.people from authenticated;

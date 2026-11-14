-- 0010 do_not_contact (section 8.5). Checked before any draft or send.
-- An email address on this list is stored as a salted hash, never in plain text.

create table public.do_not_contact (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  person_id uuid references public.people (id),
  name text,
  email_hash text,
  profile_url text,
  company text,
  scope text not null default 'person' check (scope in ('person', 'company')),
  reason text,
  created_at timestamptz not null default now()
);

create index do_not_contact_person on public.do_not_contact (person_id);
create index do_not_contact_email_hash on public.do_not_contact (email_hash) where email_hash is not null;

create trigger t_own before insert on public.do_not_contact for each row execute function public.set_owner();

revoke all on public.do_not_contact from anon;
revoke delete, truncate, references, trigger on public.do_not_contact from authenticated;

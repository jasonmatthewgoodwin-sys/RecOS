-- 0002 audit_log (section 13.7). Kept for 24 months.
-- Rows are written by triggers and server functions only. Pattern P-OWNER-RO.

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target_table text,
  target_id uuid,
  detail jsonb
);

create index audit_log_at on public.audit_log (at desc);

revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate, references, trigger on public.audit_log from authenticated;

-- The one way to write an audit row from inside the database. Not callable
-- from the browser: only triggers and other definer functions use it.
create function public.write_audit(p_action text, p_table text default null, p_id uuid default null, p_detail jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor, action, target_table, target_id, detail)
  values (coalesce(auth.jwt() ->> 'email', current_user), p_action, p_table, p_id, p_detail);
end $$;

revoke execute on function public.write_audit(text, text, uuid, jsonb) from public, anon, authenticated;

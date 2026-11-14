-- Row-level security for content_sources (low-level design section 6). Pattern P-OWNER.
-- Owner may select, insert and update. No delete policy: deletes are refused.
-- Safe to run again: each policy is dropped and recreated.

alter table public.content_sources enable row level security;

drop policy if exists content_sources_owner_select on public.content_sources;
create policy content_sources_owner_select on public.content_sources
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists content_sources_owner_insert on public.content_sources;
create policy content_sources_owner_insert on public.content_sources
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists content_sources_owner_update on public.content_sources;
create policy content_sources_owner_update on public.content_sources
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');

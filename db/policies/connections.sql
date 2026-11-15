-- Row-level security for connections (low-level design 24.9; migration 0040).
-- The owner reads his own rows: status, account label, when it last worked.
-- No browser role may insert, update or delete; the server functions write
-- through the definer functions in 0041. Safe to run again.

alter table public.connections enable row level security;

drop policy if exists connections_owner_select on public.connections;
create policy connections_owner_select on public.connections
  for select to authenticated
  using (app_role() = 'owner' and owner_id = auth.uid());

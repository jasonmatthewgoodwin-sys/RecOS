-- Row-level security for weekly_reviews (low-level design section 6). Pattern P-SHARED-RO.
-- Owner and reviewer may select. Only the owner may write. No delete.
-- Safe to run again: each policy is dropped and recreated.

alter table public.weekly_reviews enable row level security;

drop policy if exists weekly_reviews_read on public.weekly_reviews;
create policy weekly_reviews_read on public.weekly_reviews
  for select to authenticated
  using (app_role() in ('owner', 'reviewer'));

drop policy if exists weekly_reviews_owner_insert on public.weekly_reviews;
create policy weekly_reviews_owner_insert on public.weekly_reviews
  for insert to authenticated
  with check (app_role() = 'owner');

drop policy if exists weekly_reviews_owner_update on public.weekly_reviews;
create policy weekly_reviews_owner_update on public.weekly_reviews
  for update to authenticated
  using (app_role() = 'owner')
  with check (app_role() = 'owner');

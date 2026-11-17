-- 0058 Inbox folders (Jason asked 14 November, said yes to building them 17 November 2026; first written as 0030 on a branch that was never merged, then 0056, which Mia took the same day).
--
-- The owner makes his own folders to sort the Inbox. An item sits in at most
-- one folder; with none it shows under Inbox. Deleting a folder returns its
-- items to Inbox (on delete set null).
--
-- No browser role holds a delete grant (6.6), so a folder is removed through
-- delete_inbox_folder(), which checks for the owner itself. A folder holds no
-- record of anything, only a name the owner typed, so removing it loses nothing
-- that reporting needs.

create table public.inbox_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 40),
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- One name once per owner, whatever the case or spacing.
create unique index inbox_folders_owner_name on public.inbox_folders (owner_id, lower(btrim(name)));
create index inbox_folders_owner_position on public.inbox_folders (owner_id, position);

create trigger t_own before insert on public.inbox_folders for each row execute function public.set_owner();

alter table public.inbox_items
  add column folder_id uuid references public.inbox_folders (id) on delete set null;

create index inbox_items_folder on public.inbox_items (folder_id) where folder_id is not null;

-- Removes one of the owner's folders. Its items go back to Inbox.
create function public.delete_inbox_folder(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app_role() <> 'owner' then
    raise exception 'Only the owner can delete a folder';
  end if;
  delete from inbox_folders where id = p_id;
  if not found then
    raise exception 'No such folder';
  end if;
end $$;

-- ------------------------------------------------------------------ grants

revoke all on public.inbox_folders from anon, authenticated;
grant select, insert, update on public.inbox_folders to authenticated;
grant all on public.inbox_folders to service_role;

revoke execute on function public.delete_inbox_folder(uuid) from public, anon;
grant execute on function public.delete_inbox_folder(uuid) to authenticated, service_role;

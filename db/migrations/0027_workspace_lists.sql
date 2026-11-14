-- 0027 The owner's own workspace (14 November 2026, Mia's request, Pending
-- Jason in docs/decisions.md): lists under People can be added, renamed,
-- coloured, reordered and archived from the app, and a member can be put
-- in a group of the owner's naming, which draws a separator in the list.

alter table public.lists
  add column colour text not null default 'mist' check (colour in ('new', 'action', 'pending', 'clear', 'mist')),
  add column archived boolean not null default false;

alter table public.league_members
  add column group_name text check (group_name is null or length(btrim(group_name)) between 1 and 40);

create index league_members_group on public.league_members (list_id, group_name);

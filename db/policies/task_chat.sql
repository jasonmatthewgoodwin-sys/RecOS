-- Row-level security for task_chat (0052). The owner reads the chat and adds
-- his own lines; the agent's lines arrive through the task_result write kind.
-- No update or delete. Safe to run again.

alter table public.task_chat enable row level security;

drop policy if exists task_chat_owner_select on public.task_chat;
create policy task_chat_owner_select on public.task_chat
  for select to authenticated
  using (app_role() = 'owner');

drop policy if exists task_chat_owner_insert on public.task_chat;
create policy task_chat_owner_insert on public.task_chat
  for insert to authenticated
  with check (app_role() = 'owner' and author = 'owner');

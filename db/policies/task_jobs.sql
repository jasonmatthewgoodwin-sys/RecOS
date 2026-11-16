-- Row-level security for task_jobs (0052). The owner reads; nothing in the
-- browser writes: rows are added by request_task_job, claimed by the task
-- assistant through agent_context(task_jobs) and closed by the task_result
-- write kind. Safe to run again.

alter table public.task_jobs enable row level security;

drop policy if exists task_jobs_owner_select on public.task_jobs;
create policy task_jobs_owner_select on public.task_jobs
  for select to authenticated
  using (app_role() = 'owner');

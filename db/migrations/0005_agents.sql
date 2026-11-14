-- 0005 agents, agent_prompts, shared_blocks, agent_runs (section 13.4).

create table public.agents (
  code text primary key,
  name text not null,
  schedule text not null,
  enabled boolean not null default true,
  model_tier text not null default 'standard' check (model_tier in ('light', 'standard')),
  monthly_budget numeric(8,2),
  -- Agent keys are stored hashed. Never selectable by a browser role (6.5).
  key_hash text,
  key_created_at timestamptz,
  last_run_id uuid,
  consecutive_failures int not null default 0,
  consecutive_empty int not null default 0
);

create table public.agent_prompts (
  id uuid primary key default gen_random_uuid(),
  agent text not null references public.agents (code),
  version int not null,
  body text not null,
  shared_blocks text[] not null default '{}',
  active boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (agent, version)
);

-- AGT-1: exactly one active prompt version per agent.
create unique index agent_prompts_one_active on public.agent_prompts (agent) where active;

create table public.shared_blocks (
  code text primary key,
  title text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

create trigger t_upd before update on public.shared_blocks for each row execute function public.set_updated_at();

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent text not null references public.agents (code),
  trigger text not null check (trigger in ('schedule', 'manual', 'after_call')),
  prompt_version int,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in (
    'running', 'ok', 'partial', 'failed', 'timed_out')),
  sources_read jsonb not null default '[]',
  items_created int not null default 0,
  items_merged int not null default 0,
  items_rejected int not null default 0,
  errors jsonb not null default '[]',
  cost_estimate numeric(8,4),
  summary text
);

create index agent_runs_agent_started on public.agent_runs (agent, started_at desc);

revoke all on public.agents, public.agent_prompts, public.shared_blocks, public.agent_runs from anon, authenticated;

-- P-SETTINGS, column by column. key_hash is left out on purpose: the browser
-- can neither read nor change it (tests T-RLS-6).
grant select (code, name, schedule, enabled, model_tier, monthly_budget, key_created_at,
              last_run_id, consecutive_failures, consecutive_empty)
  on public.agents to authenticated;
grant update (schedule, enabled, model_tier, monthly_budget) on public.agents to authenticated;

-- Prompts and shared blocks are edited in Settings. A new prompt version is a
-- new row, so insert is allowed for the owner.
grant select, insert, update on public.agent_prompts to authenticated;
grant select, update on public.shared_blocks to authenticated;

-- P-OWNER-RO: runs are written by the service role.
grant select on public.agent_runs to authenticated;

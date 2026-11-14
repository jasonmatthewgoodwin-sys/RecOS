-- Row-level security for agent_requests (low-level design section 6, 16.11).
-- The stored results of agent batches. Read and written by the write endpoint
-- only, so no browser role holds a policy. Safe to run again.

alter table public.agent_requests enable row level security;

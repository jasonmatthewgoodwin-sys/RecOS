-- Row-level security for connection_states (migration 0041). The short-lived
-- Outlook sign-in state. Made by connection_oauth_begin for the owner and
-- taken by the outlook function's callback, both definer functions, so no
-- browser role holds a policy. Safe to run again.

alter table public.connection_states enable row level security;

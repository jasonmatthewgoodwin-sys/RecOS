-- The Monday follow-up sweep reads 30 days, and reads all of them (Jason,
-- 16 November 2026). The first live sweep stopped paging at 12 November, so
-- older replies owed never reached the queue. Changes two lines of the
-- active a5_followups prompt. Safe to run twice.

update public.agent_prompts
set body = replace(replace(body,
  $o$- full_sweep (Monday 07:30): inbox and sent items, last 14 days.$o$,
  $n$- full_sweep (Monday 07:30): inbox and sent items, last 30 days.$n$),
  $o$1. Page the inbox newest first until the window is covered.$o$,
  $n$1. Page the inbox newest first until the window is covered: keep asking for the next page until the oldest message you have read is older than the first day of the window. A short first page is not the end of the mailbox. If paging stops before the window is covered, finish partial and name in errors the date you reached, so nobody reads a half-read mailbox as all clear.$n$)
where agent = 'a5_followups' and active;

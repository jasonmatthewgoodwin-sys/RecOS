-- 0047 When a job lead was actually posted (Jason, 16 November: order leads by
-- the date they were posted, not the day RecOS saw them).
-- A LinkedIn post id (urn:li:share|ugcPost|activity:<id>, or "-share-<id>" /
-- "activity-<id>" in a /posts/ link) carries its own timestamp: the top bits
-- of the id are milliseconds since 1970 (id >> 22). posted_on is filled from
-- that whenever a lead has such a link, and is otherwise left empty so the
-- screen falls back to first_seen_on.

alter table public.job_leads add column if not exists posted_on date;
comment on column public.job_leads.posted_on is 'Day the post was published, from the LinkedIn post id; null when unknown (screen falls back to first_seen_on).';

create or replace function public.li_post_date(p_urls text[]) returns date
language sql immutable set search_path = public as $$
  select (to_timestamp((m[1]::bigint >> 22) / 1000.0) at time zone 'Europe/London')::date
  from unnest(coalesce(p_urls, '{}')) u,
       lateral regexp_match(u, '(?:urn:li:(?:share|ugcPost|activity):|-share-|activity-|ugcPost-)([0-9]{18,20})') m
  where m is not null
  order by 1
  limit 1
$$;

create or replace function public.job_leads_posted_on() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.posted_on is null then
    new.posted_on := li_post_date(new.source_urls);
  end if;
  return new;
end $$;

drop trigger if exists job_leads_posted_on on public.job_leads;
create trigger job_leads_posted_on before insert or update of source_urls on public.job_leads
for each row execute function public.job_leads_posted_on();

update public.job_leads set posted_on = li_post_date(source_urls) where posted_on is null and li_post_date(source_urls) is not null;

create index if not exists job_leads_posted_on_idx on public.job_leads (posted_on desc nulls last);

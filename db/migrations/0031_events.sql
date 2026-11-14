-- 0031 Events on the content calendar (Jason, 14 November 2026, Pending in
-- docs/decisions.md): the calendar is one calendar for posts and events.
-- Jason adds his own events (panels, happy hours, webinars, breakfasts) by
-- hand; nothing syncs from Outlook. An event is a content item of kind event
-- with a type, a day and an optional time. Marking it held counts once
-- towards events_held, the way a posted post counts towards linkedin_posts.

alter table public.content_items drop constraint content_items_kind_check;
alter table public.content_items add constraint content_items_kind_check
  check (kind in ('linkedin_post', 'job_post', 'blog', 'testimonial', 'case_study', 'idea', 'event'));

alter table public.content_items
  add column event_type text check (event_type is null or event_type in ('panel', 'happy_hour', 'webinar', 'breakfast', 'other')),
  add column event_time text check (event_time is null or event_time ~ '^\d{2}:\d{2}$');

create or replace function public.content_items_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'posted' and (tg_op = 'INSERT' or old.status <> 'posted') then
    new.posted_on := coalesce(new.posted_on, current_date);
    if new.kind in ('linkedin_post', 'job_post') then
      insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
      values (new.owner_id, 'linkedin_posts', new.posted_on::timestamp at time zone 'Europe/London', 'content_items', new.id, left('Posted: ' || new.topic, 120), true)
      on conflict (kpi, source_table, source_id) do nothing;
    elsif new.kind = 'blog' then
      insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
      values (new.owner_id, 'blogs_published', new.posted_on::timestamp at time zone 'Europe/London', 'content_items', new.id, left('Published: ' || new.topic, 120), true)
      on conflict (kpi, source_table, source_id) do nothing;
    elsif new.kind = 'event' then
      insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
      values (new.owner_id, 'events_held', new.posted_on::timestamp at time zone 'Europe/London', 'content_items', new.id, left('Event held: ' || new.topic, 120), true)
      on conflict (kpi, source_table, source_id) do nothing;
    end if;
  end if;
  if new.kind = 'testimonial' and new.received_on is not null and (tg_op = 'INSERT' or old.received_on is null) then
    insert into kpi_events (owner_id, kpi, happened_at, source_table, source_id, label, is_pmm)
    values (new.owner_id, 'testimonials', new.received_on::timestamp at time zone 'Europe/London', 'content_items', new.id, 'Testimonial received', true)
    on conflict (kpi, source_table, source_id) do nothing;
  end if;
  if new.status = 'planned' and tg_op = 'UPDATE' and old.status <> 'planned' and new.planned_for is null then
    raise exception 'A planned post needs a day';
  end if;
  return new;
end $$;

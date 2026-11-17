-- 0056 The LinkedIn connection note in Jason's words (17 November 2026):
-- "<first name>, I'm one of the leading PMM headhunters in the US. Would love
-- to connect." The unapproved starter takes the new words, the starter seed
-- uses them from now on, and the requests already waiting for the note show
-- them. An approved note is never touched: Jason approves it in Settings,
-- Templates, and the engine fills every request from the approved one.

update public.templates
set body = '{{first_name}}, I''m one of the leading PMM headhunters in the US. Would love to connect.'
where type = 'linkedin_connect' and name = 'Starter' and not approved;

create or replace function public.templates_seed() returns int
language plpgsql security definer set search_path = public as $$
declare
  o uuid := aw_owner();
  n int := 0;
begin
  if is_browser() and app_role() <> 'owner' then raise exception 'not_allowed: Only the owner adds templates'; end if;
  if o is null then return 0; end if;
  insert into templates (owner_id, type, name, channel, subject, body)
  select o, s.type, s.name, s.channel, s.subject, s.body
  from (values
    ('thanks_after_call', 'Starter', 'email', 'Good to speak today',
     E'Hi {{first_name}},\n\nThanks for your time on {{call_day}}. Good to hear about what you have been doing at {{company}}.\n\n{{next_step}}\n\nSpeak soon,\n{{my_first_name}}'),
    ('cv_request', 'Starter', 'email', 'Your resume',
     E'Hi {{first_name}},\n\nWhen you get a minute, could you send over your latest resume? It means I can get you in front of the right people quickly.\n\nThanks,\n{{my_first_name}}'),
    ('submitted_confirmation', 'Starter', 'email', 'You are with the client',
     E'Hi {{first_name}},\n\nQuick one to say I have put you forward for the {{role}} role today. I will chase for feedback and come back to you as soon as I hear, and by the end of the week either way.\n\n{{my_first_name}}'),
    ('coaching_followup', 'Starter', 'email', 'Following up on our chat',
     E'Hi {{first_name}},\n\nGood to talk on {{call_day}}. {{next_step}}\n\nYou mentioned a couple of people who might get something from the same conversation. If you are happy to connect us, I would be glad to help them.\n\n{{my_first_name}}'),
    ('linkedin_connect', 'Starter', 'linkedin', null,
     '{{first_name}}, I''m one of the leading PMM headhunters in the US. Would love to connect.')
  ) as s (type, name, channel, subject, body)
  where not exists (select 1 from templates t where t.type = s.type and t.name = s.name);
  get diagnostics n = row_count;
  return n;
end $$;

-- The waiting requests show the new words until the engine fills them again.
do $$
declare
  r record;
  tpl templates%rowtype;
begin
  select * into tpl from templates where type = 'linkedin_connect' and active order by approved desc, version desc limit 1;
  if tpl.id is null then return; end if;
  for r in select * from messages where type = 'linkedin_connect' and state in ('draft', 'held', 'queued') loop
    begin
      update messages set body = left(message_fill(tpl.body, message_variables(r)), 300) where id = r.id;
    exception when others then
      update messages set body = left(tpl.body, 300) where id = r.id;
    end;
  end loop;
end $$;

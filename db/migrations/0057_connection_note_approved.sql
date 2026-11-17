-- 0057 The approved LinkedIn connection note in Jason's words (Mia for
-- Jason, 17 November 2026): "<first name>, I'm one of the leading PMM
-- headhunters in the US. Would love to connect." No greeting before the name,
-- no sign-off. Jason had approved an earlier wording at 10:55; this replaces it
-- as he asked.
--
-- Also mends 0056: its refresh of the waiting requests could not fill the
-- names (the loop row was not a message row), so their words showed the raw
-- template. Every waiting request is refilled here from the new note. Nothing
-- had been sent: the LinkedIn sender was not yet set up.

-- TPL-1: editing the approved note makes a new version; approving it retires the old.
update public.templates
set body = '{{first_name}}, I''m one of the leading PMM headhunters in the US. Would love to connect.'
where type = 'linkedin_connect' and name = 'Starter' and active
  and body <> '{{first_name}}, I''m one of the leading PMM headhunters in the US. Would love to connect.';

select public.template_approve(id)
from public.templates
where type = 'linkedin_connect' and name = 'Starter' and active and not approved;

do $$
declare
  r messages%rowtype;
  tpl templates%rowtype;
begin
  select * into tpl from templates where type = 'linkedin_connect' and approved and active order by version desc limit 1;
  if tpl.id is null then return; end if;
  perform set_config('recos.engine', 'engine', true);
  for r in select * from messages where type = 'linkedin_connect' and state in ('draft', 'held', 'queued') loop
    update messages
    set body = left(message_fill(tpl.body, message_variables(r)), 300), template_id = tpl.id, template_version = tpl.version
    where id = r.id;
  end loop;
  perform set_config('recos.engine', '', true);
end $$;

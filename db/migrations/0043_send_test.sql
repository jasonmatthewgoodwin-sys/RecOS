-- 0043 A test send to yourself (Mia, 15 November 2026: email first)
--
-- Settings, Send rules gains Send a test to yourself on every email type.
-- It makes one message addressed to the owner's own mailbox, filled from
-- the approved template with sample values (or a plain test line when no
-- template is approved yet), and queues it to go on the next tick. The
-- sender carries it exactly as it would a real one, so the whole path is
-- proved without writing to anyone else. The engine's rules still apply
-- at the tick: the stop switch, pauses and caps.

create function public.send_test(p_type text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o uuid := aw_owner();
  addr text;
  nm text;
  first text;
  pol send_policies%rowtype;
  tpl templates%rowtype;
  m messages%rowtype;
  vars jsonb;
  subj text;
  body text;
begin
  if is_browser() and app_role() <> 'owner' then raise exception 'not_allowed: Only the owner sends a test'; end if;
  if o is null then raise exception 'not_found: no owner'; end if;
  select lower(btrim(u.email)), coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(lower(btrim(u.email)), '@', 1))
    into addr, nm from auth.users u where u.id = o;
  if addr is null then raise exception 'not_found: the owner has no email address'; end if;
  select * into pol from send_policies where type = p_type;
  if pol.type is null then raise exception 'not_found: no such message type'; end if;
  if pol.channel = 'linkedin' then raise exception 'invalid: a test send is email only; LinkedIn notes are copied by hand'; end if;
  first := split_part(nm, ' ', 1);
  vars := jsonb_build_object('first_name', first, 'my_first_name', first, 'company', 'RecOS', 'role', 'Product marketing lead',
    'call_day', to_char(now() at time zone 'Europe/London', 'FMDay'), 'next_step', 'This is a test from RecOS. Nothing to do.');
  tpl := approved_template(p_type, 'email');
  if tpl.id is not null then
    subj := coalesce(message_fill(tpl.subject, vars), format('RecOS test: %s', pol.label));
    body := message_fill(tpl.body, vars);
  else
    subj := format('RecOS test: %s', pol.label);
    body := format(E'Hi %s,\n\nThis is a test of the %s email from RecOS. If you are reading it in Outlook, the sender is working. Nothing to do.\n\nRecOS', first, lower(pol.label));
  end if;
  perform set_config('recos.engine', 'engine', true);
  insert into messages (owner_id, type, channel, person_id, to_name, to_address, subject, body, template_id, template_version, variables,
    created_by, level_at_creation, state, hold_reason, send_after, approved_at)
  values (o, p_type, 'email', null, nm, addr, subj, body, tpl.id, tpl.version, vars,
    'owner', 'one_click', 'queued', 'Test send to yourself', now(), now())
  returning * into m;
  perform send_log_write(m, 'queued', 'Test send to yourself. Goes on the next tick', 'one_click', '{}'::jsonb);
  perform set_config('recos.engine', '', true);
  return jsonb_build_object('state', 'queued', 'message_id', m.id, 'to_address', addr,
    'note', format('Queued to %s. The sender picks it up on its next run.', addr));
end $$;

revoke execute on function public.send_test(text) from public, anon;
grant execute on function public.send_test(text) to authenticated, service_role;

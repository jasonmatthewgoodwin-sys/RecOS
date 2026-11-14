-- 0016 The owner's work address on the allow-list (section 5.4: seeded by a
-- migration, not through the app). Only this address may hold a session.

insert into public.allowed_emails (email, role)
values ('jason@3searchgroup.com', 'owner')
on conflict (email) do nothing;

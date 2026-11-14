-- 0026 Fix aw_person_upsert (0025): updating an existing person always failed
-- with "missing FROM-clause entry for table aw_person_upsert", because a
-- declared variable cannot be qualified with the function name (only
-- parameters can). Any agent record whose person already existed was refused.
-- Found on 14 November by the hiring-report import. Same behaviour otherwise.

create or replace function public.aw_person_upsert(p_name text, p_title text, p_company text, p_city text, p_kind text, p_linkedin text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  v_id := aw_find_person(p_name, p_company);
  if v_id is null and p_linkedin is not null then
    select p.id into v_id from people p where p.linkedin_url = p_linkedin limit 1;
  end if;
  if v_id is not null then
    update people set
      display_title = coalesce(display_title, p_title),
      display_company = coalesce(display_company, p_company),
      company_key = coalesce(company_key, norm_company(p_company)),
      city = coalesce(city, p_city),
      linkedin_url = coalesce(linkedin_url, p_linkedin)
    where people.id = v_id;
    return v_id;
  end if;
  insert into people (owner_id, display_name, name_key, display_title, display_company, company_key, city, kind, linkedin_url)
  values (aw_owner(), btrim(p_name), norm_text(p_name), p_title, p_company, norm_company(p_company), p_city, coalesce(p_kind, 'unknown'), p_linkedin)
  returning people.id into v_id;
  return v_id;
end $$;

revoke execute on function public.aw_person_upsert(text, text, text, text, text, text) from public, anon, authenticated;

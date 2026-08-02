-- ============================================================================
-- إصلاح: تريغر protect_profile_fields كان يمنع service role من تحديث status
-- (إيقاف/موافقة من إدارة التحكم عبر API) فيبقى المستخدم مفعّلًا!
-- نفّذ مرة واحدة من: Supabase ▸ SQL Editor ▸ Run
-- ============================================================================

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- السماح لتحديثات لوحة الإدارة (service role عبر access-control API)
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if not public.is_owner() then
    new.status := old.status;
    new.is_owner := old.is_owner;
    new.package_name := old.package_name;
    new.package_expires_at := old.package_expires_at;
  end if;
  return new;
end;
$$;

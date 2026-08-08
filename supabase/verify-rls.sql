-- تحقق سريع من تفعيل RLS على جداول تطبيق الفرز.
-- شغّله من SQL Editor في لوحة Supabase (مشروع الإنتاج).
-- النتيجة المتوقعة: rls_enabled = true لكل جدول أدناه.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles',
    'feedback',
    'broadcasts',
    'error_reports',
    'activation_codes',
    'sort_history',
    'uploaded_sheets'
  )
order by c.relname;

-- سياسات كل جدول (للتأكد أنها موجودة وليست فارغة)
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'feedback',
    'broadcasts',
    'error_reports',
    'activation_codes',
    'sort_history',
    'uploaded_sheets'
  )
order by tablename, policyname;

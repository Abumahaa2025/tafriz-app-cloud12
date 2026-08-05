-- ============================================================================
-- تجهيز مشروع Supabase جديد لتطبيق "الفرز" دفعة واحدة
--
-- استخدمه عند نقل التطبيق لقاعدة بيانات جديدة بدل ما تنفّذ أربعة ملفات
-- بالترتيب الصحيح. محتواه = schema.sql + كل ملفات migrate-*.sql مدموجة.
--
-- الطريقة: Supabase ▸ اختر المشروع ▸ SQL Editor ▸ New query ▸ الصق الملف
--          كاملًا ▸ Run.
--
-- الملف *آمن للتكرار* (idempotent): تقدر تشغّله أكثر من مرة على نفس المشروع
-- بدون أخطاء وبدون ما يمسح أي بيانات موجودة — بعكس schema.sql الأصلي اللي
-- يفشل من ثاني تشغيل لأن جداوله معرّفة بـ create table بدون if not exists.
--
-- بعد التشغيل راجع "التحقق النهائي" في آخر الملف.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) الجداول
-- ----------------------------------------------------------------------------

-- بروفايلات المستخدمين (تمتد فوق auth.users المدمج في Supabase)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  identifier_type text not null check (identifier_type in ('email', 'phone')),
  identifier text not null,          -- البريد أو رقم الجوال الحقيقي المعروض
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  is_owner boolean not null default false,
  full_name text,
  city text,
  package_name text,
  package_expires_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- الملاحظات / محادثة الإدارة
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  identifier text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read boolean not null default false,
  -- محادثة: كل الرسائل في نفس الخيط تشارك thread_id (عادةً = id أول رسالة)
  thread_id uuid,
  from_owner boolean not null default false,
  read_by_user boolean not null default true
);

-- ترقية مشروع نُفِّذ عليه schema.sql قديم قبل إضافة أعمدة المحادثة
alter table public.feedback
  add column if not exists thread_id uuid,
  add column if not exists from_owner boolean not null default false,
  add column if not exists read_by_user boolean not null default true;

-- الرسائل القديمة تصبح كل واحدة خيطًا مستقلًا
update public.feedback set thread_id = id where thread_id is null;

-- الرسائل العامة
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

-- الأخطاء المسجَّلة تلقائيًا
create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  context text,
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);

-- رموز التفعيل الفوري
create table if not exists public.activation_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  used_by uuid references public.profiles(id) on delete set null
);

-- سجل عمليات الفرز المكتملة (لكل مستخدم لحاله)
create table if not exists public.sort_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  data_file_name text not null,
  referral_file_name text not null,
  unsorted_count int not null,
  distinct_matched_plates int not null,
  matched_rows jsonb not null,
  created_at timestamptz not null default now()
);

-- الملفات المرفوعة كاملة (قاعدة البيانات الفعلية لكل مستخدم)
create table if not exists public.uploaded_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  headers jsonb not null,
  rows jsonb not null,
  total_rows_in_file int not null,
  truncated boolean not null default false,
  uploaded_at timestamptz not null default now()
);

-- تشييك ميداني يغذّي خريطة الأسطول. نسخة كلاود 12 ما تستعمله، لكنه مُنشأ هنا
-- حتى لو وجّهت نسخة كلاود 13 على نفس القاعدة تشتغل بدون ترحيل إضافي.
create table if not exists public.check_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plate_query text not null,
  matched boolean not null default false,
  matched_row jsonb,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 2) دالة تتحقق هل المستخدم الحالي مالك — تُستخدم داخل سياسات RLS
--    security definer عشان تتفادى الحلقة اللانهائية بقراءة نفس الجدول اللي
--    عليه RLS من داخل سياسة RLS
-- ----------------------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_owner from public.profiles where id = auth.uid()), false);
$$;


-- ----------------------------------------------------------------------------
-- 3) تفعيل RLS على كل جدول
-- ----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.feedback         enable row level security;
alter table public.broadcasts       enable row level security;
alter table public.error_reports    enable row level security;
alter table public.activation_codes enable row level security;
alter table public.sort_history     enable row level security;
alter table public.uploaded_sheets  enable row level security;
alter table public.check_records    enable row level security;


-- ----------------------------------------------------------------------------
-- 4) السياسات — كل وحدة تُحذف قبل إنشائها حتى يبقى الملف آمنًا للتكرار
-- ----------------------------------------------------------------------------

-- ---- profiles ----
drop policy if exists "read own or owner reads all" on public.profiles;
create policy "read own or owner reads all" on public.profiles
  for select using (auth.uid() = id or public.is_owner());

drop policy if exists "insert own profile on signup" on public.profiles;
create policy "insert own profile on signup" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "update own profile or owner updates any" on public.profiles;
create policy "update own profile or owner updates any" on public.profiles
  for update using (auth.uid() = id or public.is_owner());

-- ---- feedback (محادثة بين المستخدم والمالك) ----
drop policy if exists "insert own feedback" on public.feedback;
drop policy if exists "owner reads all feedback" on public.feedback;
drop policy if exists "owner updates feedback" on public.feedback;

drop policy if exists "insert own feedback or owner reply" on public.feedback;
create policy "insert own feedback or owner reply" on public.feedback
  for insert with check (auth.uid() = user_id or public.is_owner());

drop policy if exists "read own feedback or owner reads all" on public.feedback;
create policy "read own feedback or owner reads all" on public.feedback
  for select using (auth.uid() = user_id or public.is_owner());

drop policy if exists "update own feedback or owner updates" on public.feedback;
create policy "update own feedback or owner updates" on public.feedback
  for update using (auth.uid() = user_id or public.is_owner());

-- ---- broadcasts ----
drop policy if exists "any approved user reads broadcasts" on public.broadcasts;
create policy "any approved user reads broadcasts" on public.broadcasts
  for select using (auth.uid() is not null);

drop policy if exists "owner sends broadcasts" on public.broadcasts;
create policy "owner sends broadcasts" on public.broadcasts
  for insert with check (public.is_owner());

-- ---- error_reports ----
drop policy if exists "any authenticated user logs errors" on public.error_reports;
create policy "any authenticated user logs errors" on public.error_reports
  for insert with check (auth.uid() is not null);

drop policy if exists "owner reads errors" on public.error_reports;
create policy "owner reads errors" on public.error_reports
  for select using (public.is_owner());

drop policy if exists "owner resolves errors" on public.error_reports;
create policy "owner resolves errors" on public.error_reports
  for update using (public.is_owner());

-- ---- activation_codes ----
drop policy if exists "owner manages codes" on public.activation_codes;
create policy "owner manages codes" on public.activation_codes
  for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "any authenticated user can see unused codes only" on public.activation_codes;
create policy "any authenticated user can see unused codes only" on public.activation_codes
  for select using (used_by is null);

drop policy if exists "any authenticated user can redeem an unused code" on public.activation_codes;
create policy "any authenticated user can redeem an unused code" on public.activation_codes
  for update using (used_by is null) with check (used_by = auth.uid());

-- ---- sort_history ----
drop policy if exists "user reads own sort history, owner reads all" on public.sort_history;
create policy "user reads own sort history, owner reads all" on public.sort_history
  for select using (auth.uid() = user_id or public.is_owner());

drop policy if exists "user inserts own sort history" on public.sort_history;
create policy "user inserts own sort history" on public.sort_history
  for insert with check (auth.uid() = user_id);

-- ---- uploaded_sheets ----
drop policy if exists "user reads own uploads, owner reads all" on public.uploaded_sheets;
create policy "user reads own uploads, owner reads all" on public.uploaded_sheets
  for select using (auth.uid() = user_id or public.is_owner());

drop policy if exists "user inserts own uploads" on public.uploaded_sheets;
create policy "user inserts own uploads" on public.uploaded_sheets
  for insert with check (auth.uid() = user_id);

-- ---- check_records ----
drop policy if exists "team reads all check records" on public.check_records;
create policy "team reads all check records" on public.check_records
  for select using (auth.uid() is not null);

drop policy if exists "user inserts own check records" on public.check_records;
create policy "user inserts own check records" on public.check_records
  for insert with check (auth.uid() = user_id);


-- ============================================================================
-- 5) حماية حرجة على مستوى الخادم
--
-- سياسة "update own profile or owner updates any" تتحقق فقط من *أي صف* يقدر
-- المستخدم يعدّله (صفه هو)، لكنها ما تمنعه من إرسال طلب يغيّر status إلى
-- 'approved' أو is_owner إلى true لنفس صفه. أي مستخدم يفتح أدوات المطوّر
-- يقدر يفعّل حسابه بنفسه. التريغرات التالية تمنع هذا من داخل قاعدة البيانات.
--
-- ⚠️ قبل التنفيذ: تأكد أن الرقم في assign_owner_on_signup أدناه = نفس قيمة
--    OWNER_IDENTIFIER في src/lib/owner-config.ts بالضبط.
-- ============================================================================

create or replace function public.assign_owner_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.identifier = '0575051487' then
    new.is_owner := true;
    new.status := 'approved';
    new.package_name := 'مالك التطبيق';
  else
    -- حتى لو أرسل العميل is_owner=true أو status='approved' بالطلب الأصلي
    -- (تلاعب من كود الواجهة)، يُرفض هنا ويُجبر على القيم الافتراضية الآمنة
    new.is_owner := false;
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists assign_owner_on_signup_trigger on public.profiles;
create trigger assign_owner_on_signup_trigger
  before insert on public.profiles
  for each row execute function public.assign_owner_on_signup();

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- السماح لتحديثات لوحة الإدارة (service role عبر access-control API).
  -- بدون هذا الشرط يبقى المستخدم مفعّلًا رغم ضغط "إيقاف" في إدارة التحكم.
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

drop trigger if exists protect_profile_fields_trigger on public.profiles;
create trigger protect_profile_fields_trigger
  before update on public.profiles
  for each row execute function public.protect_profile_fields();


-- ============================================================================
-- التحقق النهائي — شغّل هذا الاستعلام بعد التنفيذ.
-- المفروض يرجع 8 صفوف، كلها rls_enabled = true.
-- ============================================================================
-- select c.relname as table_name, c.relrowsecurity as rls_enabled,
--        (select count(*) from pg_policies p
--          where p.schemaname = 'public' and p.tablename = c.relname) as policies
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r'
--  order by c.relname;

-- ============================================================================
-- مخطط قاعدة بيانات "الفرز" على Supabase
-- ينفَّذ مرة واحدة فقط: افتح مشروعك على supabase.com ▸ SQL Editor ▸ New query
-- الصق هذا الملف كاملًا واضغط Run.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) بروفايلات المستخدمين (تمتد فوق auth.users المدمج في Supabase)
-- --------------------------------------------------------------------------
create table public.profiles (
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

-- --------------------------------------------------------------------------
-- 2) دالة تتحقق هل المستخدم الحالي مالك — تُستخدم داخل سياسات RLS
--    (security definer عشان تتفادى الحلقة اللانهائية بقراءة نفس الجدول
--    اللي عليه RLS من داخل سياسة RLS)
-- --------------------------------------------------------------------------
create function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_owner from public.profiles where id = auth.uid()), false);
$$;

-- --------------------------------------------------------------------------
-- 3) الملاحظات (feedback)
-- --------------------------------------------------------------------------
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  identifier text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

-- --------------------------------------------------------------------------
-- 4) الرسائل العامة (broadcasts)
-- --------------------------------------------------------------------------
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 5) الأخطاء المسجَّلة تلقائيًا
-- --------------------------------------------------------------------------
create table public.error_reports (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  context text,
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);

-- --------------------------------------------------------------------------
-- 6) رموز التفعيل الفوري
-- --------------------------------------------------------------------------
create table public.activation_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  used_by uuid references public.profiles(id) on delete set null
);

-- --------------------------------------------------------------------------
-- 7) سجل عمليات الفرز المكتملة (لكل مستخدم لحاله)
-- --------------------------------------------------------------------------
create table public.sort_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  data_file_name text not null,
  referral_file_name text not null,
  unsorted_count int not null,
  distinct_matched_plates int not null,
  matched_rows jsonb not null,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 8) الملفات المرفوعة كاملة (قاعدة البيانات الفعلية لكل مستخدم)
-- --------------------------------------------------------------------------
create table public.uploaded_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  headers jsonb not null,
  rows jsonb not null,
  total_rows_in_file int not null,
  truncated boolean not null default false,
  uploaded_at timestamptz not null default now()
);

-- ============================================================================
-- تفعيل RLS (أمان على مستوى الصف) على كل جدول
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.feedback enable row level security;
alter table public.broadcasts enable row level security;
alter table public.error_reports enable row level security;
alter table public.activation_codes enable row level security;
alter table public.sort_history enable row level security;
alter table public.uploaded_sheets enable row level security;

-- ---- profiles ----
create policy "read own or owner reads all" on public.profiles
  for select using (auth.uid() = id or public.is_owner());

create policy "insert own profile on signup" on public.profiles
  for insert with check (auth.uid() = id);

create policy "update own profile or owner updates any" on public.profiles
  for update using (auth.uid() = id or public.is_owner());

-- ---- feedback ----
create policy "insert own feedback" on public.feedback
  for insert with check (auth.uid() = user_id);

create policy "owner reads all feedback" on public.feedback
  for select using (public.is_owner());

create policy "owner updates feedback" on public.feedback
  for update using (public.is_owner());

-- ---- broadcasts ----
create policy "any approved user reads broadcasts" on public.broadcasts
  for select using (auth.uid() is not null);

create policy "owner sends broadcasts" on public.broadcasts
  for insert with check (public.is_owner());

-- ---- error_reports ----
create policy "any authenticated user logs errors" on public.error_reports
  for insert with check (auth.uid() is not null);

create policy "owner reads errors" on public.error_reports
  for select using (public.is_owner());

create policy "owner resolves errors" on public.error_reports
  for update using (public.is_owner());

-- ---- activation_codes ----
create policy "owner manages codes" on public.activation_codes
  for all using (public.is_owner()) with check (public.is_owner());

create policy "any authenticated user can see unused codes only" on public.activation_codes
  for select using (used_by is null);

create policy "any authenticated user can redeem an unused code" on public.activation_codes
  for update using (used_by is null) with check (used_by = auth.uid());

-- ---- sort_history ----
create policy "user reads own sort history, owner reads all" on public.sort_history
  for select using (auth.uid() = user_id or public.is_owner());

create policy "user inserts own sort history" on public.sort_history
  for insert with check (auth.uid() = user_id);

-- ---- uploaded_sheets ----
create policy "user reads own uploads, owner reads all" on public.uploaded_sheets
  for select using (auth.uid() = user_id or public.is_owner());

create policy "user inserts own uploads" on public.uploaded_sheets
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- ملاحظة: لا حاجة لسقف صفوف يدوي هنا مثل localStorage — قاعدة بيانات Postgres
-- الحقيقية تستوعب ملايين الصفوف بلا مشاكل.
-- ============================================================================

-- ============================================================================
-- 9) حماية حرجة على مستوى الخادم — لازم تُنفَّذ، خصوصًا مع ~100 مستخدم حقيقي
-- ============================================================================
-- المشكلة: سياسة "update own profile or owner updates any" أعلاه تتحقق فقط
-- من "أي صف" يقدر المستخدم يعدّله (صفه هو)، لكنها ما تمنعه من إرسال طلب
-- تعديل يغيّر status إلى 'approved' أو is_owner إلى true لنفس صفه! أي مستخدم
-- عادي يعرف يفتح أدوات المطوّر بالمتصفح يقدر يفعّل حسابه بنفسه أو يمنح نفسه
-- صلاحية مالك. التريغر التالي يمنع هذا فعليًا من داخل قاعدة البيانات: أي
-- تعديل على status أو is_owner أو package_name أو package_expires_at من غير
-- المالك يُرفض تلقائيًا (تُعاد القيمة القديمة) بغض النظر عمّا يرسله المتصفح.
-- ============================================================================

-- عدّل السطر التالي فقط قبل التنفيذ: نفس القيمة الموجودة في
-- src/lib/owner-config.ts بالضبط (رقم جوالك أو بريدك)
-- مثال: '0575051487'
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

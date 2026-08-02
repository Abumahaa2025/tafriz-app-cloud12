-- من نسخة كلاود (tafriz-app 13): تشييك ميداني يغذّي خريطة الأسطول
-- آمن للتطبيق فوق المخطط الحالي دون حذف جداول/سياسات التغذية الراجعة.

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

alter table public.check_records enable row level security;

drop policy if exists "team reads all check records" on public.check_records;
create policy "team reads all check records" on public.check_records
  for select using (auth.uid() is not null);

drop policy if exists "user inserts own check records" on public.check_records;
create policy "user inserts own check records" on public.check_records
  for insert with check (auth.uid() = user_id);

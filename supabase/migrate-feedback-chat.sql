-- ============================================================================
-- ترقية محادثة الملاحظات (للتطبيقات اللي نفّذت schema.sql سابقًا)
-- نفّذ مرة واحدة من: Supabase ▸ SQL Editor ▸ Run
-- ============================================================================

alter table public.feedback
  add column if not exists thread_id uuid,
  add column if not exists from_owner boolean not null default false,
  add column if not exists read_by_user boolean not null default true;

-- الرسائل القديمة تصبح كل واحدة خيطًا مستقلًا
update public.feedback
set thread_id = id
where thread_id is null;

drop policy if exists "insert own feedback" on public.feedback;
drop policy if exists "owner reads all feedback" on public.feedback;
drop policy if exists "owner updates feedback" on public.feedback;
drop policy if exists "insert own feedback or owner reply" on public.feedback;
drop policy if exists "read own feedback or owner reads all" on public.feedback;
drop policy if exists "update own feedback or owner updates" on public.feedback;

create policy "insert own feedback or owner reply" on public.feedback
  for insert with check (auth.uid() = user_id or public.is_owner());

create policy "read own feedback or owner reads all" on public.feedback
  for select using (auth.uid() = user_id or public.is_owner());

create policy "update own feedback or owner updates" on public.feedback
  for update using (auth.uid() = user_id or public.is_owner());

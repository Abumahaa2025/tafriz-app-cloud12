# توصيل التطبيق بقاعدة بيانات Supabase جديدة

## المتغيرات المطلوبة

| المتغير | وين يُستعمل | ضروري؟ |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | المتصفح — رابط مشروع Supabase | نعم |
| `VITE_SUPABASE_ANON_KEY` | المتصفح + `api/access-control` | نعم |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/auth-register` و `api/access-control` | نعم |
| `SUPABASE_URL` | نفس قيمة `VITE_SUPABASE_URL` | لا (يرجع لـ `VITE_SUPABASE_URL`) |
| `OWNER_IDENTIFIER` | تحديد حساب المالك في الخادم | لا (الافتراضي `0575051487`) |
| `ANTHROPIC_API_KEY` | `api/recognize-plate` (قراءة اللوحات بالذكاء) | لا (الميزة فقط تتعطّل) |

تُضاف كلها في **Vercel ▸ Settings ▸ Environment Variables** لبيئة Production.

`VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY` مفاتيح عامة يقرأها المتصفح؛
كشفها ليس ثغرة، الحماية الحقيقية من RLS داخل قاعدة البيانات.
`SUPABASE_SERVICE_ROLE_KEY` بالعكس تمامًا — **سري ويتجاوز RLS**، لا تضعه أبدًا
في متغير يبدأ بـ `VITE_` ولا في أي ملف داخل المستودع.

## ⚠️ متغيرات `VITE_` تُحقن وقت البناء لا وقت التشغيل

هذي أكثر نقطة تسبب "غيّرت قاعدة البيانات وما تغيّر شيء":

Vite يستبدل `import.meta.env.VITE_*` بقيمها **نصًّا داخل ملف الجافاسكربت** أثناء
`npm run build`. يعني رابط القاعدة ومفتاحها ينحفظون داخل الحزمة المنشورة.

فلو عدّلت القيمة في Vercel وما أعدت النشر، يستمر المستخدمون على القاعدة القديمة
مهما حدّثوا الصفحة. **بعد أي تعديل على متغير `VITE_` لازم Redeploy** من
Vercel ▸ Deployments ▸ ⋯ ▸ Redeploy، مع إلغاء تفعيل *Use existing Build Cache*.

للتأكد أن النشرة الحالية فعلًا تستعمل القاعدة الجديدة:

```bash
curl -s https://tafriz-app-cloud12.vercel.app/ \
  | grep -o '/assets/index-[^"]*\.js' \
  | head -1 \
  | xargs -I{} curl -s https://tafriz-app-cloud12.vercel.app{} \
  | grep -o 'https://[a-z0-9]*\.supabase\.co'
```

لازم يطبع رابط المشروع الجديد. لو طبع القديم فالنشرة ما انبنت من جديد.

## خطوات النقل لقاعدة جديدة

1. **جهّز المخطط**: Supabase ▸ المشروع الجديد ▸ SQL Editor ▸ New query ▸ الصق
   `supabase/setup-new-project.sql` كاملًا ▸ Run.
   الملف يجمع `schema.sql` وكل ملفات `migrate-*.sql` في تشغيلة واحدة، وآمن
   للتكرار فتقدر تعيده بدون ما يخرب شيئًا.

2. **تأكد أن المخطط تمام** قبل ما توجّه التطبيق:

   ```bash
   npm run verify:db -- https://<project>.supabase.co <anon-key>
   ```

3. **فعّل تسجيل الدخول بالبريد**: Supabase ▸ Authentication ▸ Providers ▸ Email
   مفعّل، و Authentication ▸ Sign-ups غير موقوفة.
   التسجيل يمر عبر `api/auth-register` بمفتاح service role مع `email_confirm`،
   فما يحتاج المستخدم يأكّد بريده — لكن المزوّد نفسه لازم يكون شغّالًا.

4. **حدّث المتغيرات في Vercel** بقيم المشروع الجديد.

5. **أعد النشر** (Redeploy بدون كاش) — راجع التحذير أعلاه.

6. **سجّل حساب المالك أولًا** بنفس `OWNER_IDENTIFIER` (`0575051487`) الموجود في
   `src/lib/owner-config.ts`. تريغر `assign_owner_on_signup` يرقّيه تلقائيًا
   لمالك مُفعّل، وأي حساب ثاني يدخل `pending` وينتظر موافقتك.

## ما الذي *لا* ينتقل تلقائيًا

القاعدة الجديدة تبدأ فاضية. لا المستخدمون ولا الملفات المرفوعة ولا سجل الفرز
ولا رموز التفعيل تنتقل معك. النتيجة العملية:

- كل مستخدم لازم يسجّل من جديد ويصير `pending` حتى توافق عليه.
- الملفات المرفوعة سابقًا (`uploaded_sheets`) وسجل الفرز (`sort_history`) تختفي.
- رموز التفعيل القديمة ما تعود تشتغل — ولّد رموزًا جديدة من إدارة التحكم.

لو تبي تنقل البيانات فعلًا بدل ما تبدأ من الصفر، صدّر الجداول من المشروع القديم
(Supabase ▸ Table Editor ▸ Export CSV) واستوردها بنفس الترتيب: `profiles` أولًا
لأن بقية الجداول مرتبطة فيها بمفتاح خارجي. ملاحظة: `profiles.id` مرتبط بـ
`auth.users`، فنقل المستخدمين نفسه يحتاج Supabase ▸ Auth ▸ Migrate users أو
إعادة إنشائهم عبر service role.

## التخزين المحلي كشبكة أمان

إذا كان `VITE_SUPABASE_URL` أو `VITE_SUPABASE_ANON_KEY` ناقصًا، التطبيق **ما
ينكسر** — `src/lib/backend.ts` يحوّله تلقائيًا لتخزين محلي داخل الجوال.

هذا مريح للتجربة، لكنه خطر بالإنتاج: كل جوال يصير له بياناته لحاله، وموافقات
الإدارة ورموز التفعيل ما توصل لأحد. لو شكيت أن هذا صاير، شغّل أمر التحقق في
قسم "متغيرات VITE_" أعلاه — إذا ما طبع أي رابط `supabase.co` فالنشرة تعمل
بالتخزين المحلي.

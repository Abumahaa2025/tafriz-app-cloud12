import { localBackend } from "./backend-local";
import { supabaseBackend } from "./backend-supabase";
import { isSupabaseConfigured } from "./supabase-client";
import type { Backend } from "./backend-types";

// يتحول تلقائيًا لـ Supabase بمجرد ما تضيف VITE_SUPABASE_URL و
// VITE_SUPABASE_ANON_KEY (بيئة محلية عبر .env، أو Vercel ▸ Environment
// Variables) — بدون أي تعديل ثاني بأي صفحة. طالما ما ضفتهم، يستمر التطبيق
// بالتخزين المحلي القديم تلقائيًا فما ينكسر شيء عندك أو عند أي حد يجرّب
// المشروع بدون إعداد Supabase.
export const backend: Backend = isSupabaseConfigured ? supabaseBackend : localBackend;

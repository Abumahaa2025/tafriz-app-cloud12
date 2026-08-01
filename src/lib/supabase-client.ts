import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * null طالما ما ضفت VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في .env أو
 * إعدادات Vercel — بهذي الحالة يستمر التطبيق يشتغل بالتخزين المحلي تلقائيًا
 * (راجع lib/backend.ts) بدون ما ينكسر شيء.
 */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = supabase !== null;

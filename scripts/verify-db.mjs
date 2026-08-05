#!/usr/bin/env node
/**
 * فحص أن مشروع Supabase مجهّز بكل ما يحتاجه تطبيق "الفرز".
 *
 * استعمله بعد ما تنفّذ supabase/setup-new-project.sql على قاعدة بيانات جديدة،
 * وقبل ما توجّه التطبيق عليها — بدل ما تكتشف جدولًا ناقصًا من شاشة بيضاء عند
 * المستخدم.
 *
 *   npm run verify:db                      # يقرأ من .env
 *   npm run verify:db -- <URL> <ANON_KEY>  # أو مرّرهما مباشرة
 *
 * يستعمل مفتاح anon/publishable العام فقط — لا يحتاج service_role.
 */
import { readFileSync } from "node:fs";

/** جداول لا يشتغل التطبيق بدونها. */
const REQUIRED_TABLES = [
  "profiles",
  "feedback",
  "broadcasts",
  "error_reports",
  "activation_codes",
  "sort_history",
  "uploaded_sheets",
];

/** جداول تستعملها نسخ أحدث من التطبيق — نقصها تنبيه لا خطأ. */
const OPTIONAL_TABLES = ["check_records"];

/** أعمدة أضافتها ترقية محادثة الملاحظات. */
const FEEDBACK_CHAT_COLUMNS = ["thread_id", "from_owner", "read_by_user"];

function readEnvFile() {
  const env = {};
  for (const file of [".env", ".env.local"]) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const [argUrl, argKey] = process.argv.slice(2);
const fileEnv = readEnvFile();
const url = (argUrl || process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const anonKey = argKey || process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || "";

if (!url || !anonKey) {
  console.error("ناقص VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY.");
  console.error("مرّرهما كوسيطين، أو ضعهما في .env — راجع docs/DATABASE-SETUP.md");
  process.exit(2);
}

/** يسأل PostgREST عن صف واحد فقط: 200 = الجدول/العمود موجود. */
async function probe(table, columns = "*") {
  const endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(columns)}&limit=1`;
  try {
    const response = await fetch(endpoint, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (response.ok) return { ok: true };
    const body = await response.text();
    let message = body.slice(0, 160);
    try {
      message = JSON.parse(body).message ?? message;
    } catch {
      /* الرد ليس JSON — نعرض النص كما هو */
    }
    return { ok: false, status: response.status, message };
  } catch (error) {
    return { ok: false, status: 0, message: error.message };
  }
}

console.log(`فحص قاعدة البيانات: ${url}\n`);

const failures = [];
const warnings = [];

for (const table of REQUIRED_TABLES) {
  const result = await probe(table);
  console.log(`  ${result.ok ? "✓" : "✗"} ${table}${result.ok ? "" : ` — ${result.message}`}`);
  if (!result.ok) failures.push(`جدول ${table} غير موجود أو غير منشور`);
}

for (const table of OPTIONAL_TABLES) {
  const result = await probe(table);
  console.log(`  ${result.ok ? "✓" : "○"} ${table} (اختياري)`);
  if (!result.ok) warnings.push(`جدول ${table} ناقص — تحتاجه نسخة كلاود 13 فقط`);
}

const chat = await probe("feedback", FEEDBACK_CHAT_COLUMNS.join(","));
console.log(`  ${chat.ok ? "✓" : "✗"} أعمدة محادثة الملاحظات (${FEEDBACK_CHAT_COLUMNS.join(", ")})`);
if (!chat.ok) failures.push("أعمدة محادثة الملاحظات ناقصة — الرد على المستخدمين لن يعمل");

// profiles محمي بـ RLS: القراءة بمفتاح anon بدون تسجيل دخول لازم ترجع فاضية.
// لو رجعت صفوفًا فمعناه أن RLS غير مفعّل وبيانات المشتركين مكشوفة للعالم.
const openProfiles = await probe("profiles", "id");
if (openProfiles.ok) {
  const response = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  const rows = await response.json();
  if (Array.isArray(rows) && rows.length > 0) {
    failures.push("RLS غير مفعّل على profiles — بيانات المشتركين مقروءة للعموم");
  } else {
    console.log("  ✓ RLS يحمي profiles من القراءة العامة");
  }
}

if (warnings.length > 0) {
  console.log("\nتنبيهات:");
  for (const warning of warnings) console.log(`  ○ ${warning}`);
}

if (failures.length > 0) {
  console.error("\nفشل الفحص:");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error("\nنفّذ supabase/setup-new-project.sql على المشروع — راجع docs/DATABASE-SETUP.md");
  process.exit(1);
}

console.log("\n✓ قاعدة البيانات جاهزة للتطبيق.");

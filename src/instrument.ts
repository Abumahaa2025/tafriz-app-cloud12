/**
 * تهيئة Sentry للتطبيق (Vite + React).
 *
 * يجب استيراد هذا الملف أول سطر في src/main.tsx قبل أي كود آخر.
 * DSN يُقرأ من VITE_SENTRY_DSN فقط — متوافق مع Vite (وليس NEXT_PUBLIC_*).
 *
 * بدون المفتاح تُتخطّى التهيئة بصمت ويبقى التطبيق يعمل كالمعتاد.
 */
import * as Sentry from "@sentry/react";

const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();

export const isSentryEnabled = Boolean(dsn);

if (isSentryEnabled) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // تطويرًا 100%، وإنتاجًا عيّنة أخف لتقليل التكلفة
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/tafriz-app-cloud12\.vercel\.app/i,
      /^https:\/\/.*\.vercel\.app/i,
    ],
    sendDefaultPii: false,
  });
}

export { Sentry };

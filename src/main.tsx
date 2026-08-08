import "./instrument"; // يجب أن يبقى أول استيراد — تهيئة Sentry قبل أي كود

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";

initTheme();

if ("serviceWorker" in navigator) {
  // سجّل مبكرًا حتى يتحكّم الـ SW بالصفحة قبل موجّه التثبيت (WebAPK كتطبيق)
  void navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then(async (reg) => {
      try {
        await reg.update();
      } catch {
        // ignore
      }
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        try {
          if (!sessionStorage.getItem("tafriz_sw_claim_reload")) {
            sessionStorage.setItem("tafriz_sw_claim_reload", "1");
            window.location.reload();
          }
        } catch {
          // ignore
        }
      }
    })
    .catch(() => {
      // التسجيل يفشل بصمت على HTTP العادي (غير https) — هذا متوقع أثناء التطوير المحلي
    });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

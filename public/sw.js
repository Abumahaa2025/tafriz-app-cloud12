// Service Worker لتطبيق الفرز.
// - يتحكّم بطلبات نفس الأصل (مطلوب لتثبيت WebAPK كتطبيق لا كاختصار ويب).
// - يمرّر الشبكة مباشرة بدون كاش عدواني حتى لا تتجمّد التحديثات.
// - يدعم Web Share Target عبر /import.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const openTarget = event.notification && event.notification.data && event.notification.data.open;
  const url = openTarget === "account" ? "/?open=account" : "/?source=pwa";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if (openTarget === "account" && "postMessage" in client) {
            client.postMessage({ type: "OPEN_ACCOUNT" });
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.pathname === "/import") {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const file = formData.get("shared_file");
          if (file) {
            const cache = await caches.open("tafriz-shared");
            await cache.put(
              "/__shared-file",
              new Response(file, {
                headers: { "x-shared-file-name": file.name || "shared-file.xlsx" },
              })
            );
          }
        } catch {
          // تجاهل أي خطأ في القراءة ودّي المستخدم للصفحة الرئيسية على أي حال
        }
        return Response.redirect("/?imported=1", 303);
      })()
    );
    return;
  }

  // نفس الأصل فقط — الشبكة أولًا مع بقاء الـ SW متحكّمًا (شرط تثبيت كتطبيق)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request).catch(() => {
        if (event.request.mode === "navigate") {
          return Response.redirect(new URL("/?source=pwa", self.location.origin).href, 302);
        }
        return Response.error();
      })
    );
  }
});

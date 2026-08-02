// خدمة صغيرة تعمل في الخلفية لاستقبال الملفات التي يشاركها المستخدم من
// تطبيقات ثانية (واتساب مثلًا) عبر قائمة "مشاركة" نظام أندرويد، بشرط أن يكون
// هذا التطبيق مثبّتًا على الشاشة الرئيسية (Add to Home Screen) وأن الموقع
// يعمل عبر HTTPS. لا يعمل هذا على آيفون لأن Safari لا يدعم Web Share Target.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow("/");
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
  }
});

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { backend } from "@/lib/backend";
import {
  ensureNotificationPermission,
  notifyOwnerNewFeedback,
  notifyUserAdminReply,
} from "@/lib/feedback-notify";

/**
 * يراقب رسائل التواصل ويُظهر إشعار جوال عند وصول رسالة جديدة.
 */
export function FeedbackNotifyWatcher() {
  const { user } = useAuth();

  React.useEffect(() => {
    if (!user) return;
    ensureNotificationPermission().catch(() => {});
  }, [user?.id]);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const tick = async () => {
      try {
        if (user.isOwner) {
          const items = await backend.listFeedback();
          if (!cancelled) await notifyOwnerNewFeedback(items);
        } else {
          const items = await backend.listMyFeedback();
          if (!cancelled) await notifyUserAdminReply(items);
        }
      } catch {
        // تجاهل أخطاء الشبكة المؤقتة
      }
    };

    tick();
    const interval = setInterval(tick, 20_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id, user?.isOwner]);

  return null;
}

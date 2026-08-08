import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { backend } from "@/lib/backend";
import { OWNER_IDENTIFIER } from "@/lib/owner-config";
import { notifyOwnerNewFeedback, notifyUserAdminReply } from "@/lib/feedback-notify";

function isOwnerAccount(user: { isOwner?: boolean; identifier?: string } | null): boolean {
  if (!user) return false;
  if (user.isOwner) return true;
  if (OWNER_IDENTIFIER && user.identifier === OWNER_IDENTIFIER) return true;
  return false;
}

/**
 * يراقب رسائل التواصل ويُظهر إشعار جوال عند وصول رسالة جديدة.
 * لا يطلب إذن الإشعارات — الإذن يُطلب فقط من مسار إيماءة المستخدم المركزي.
 */
export function FeedbackNotifyWatcher() {
  const { user } = useAuth();
  const owner = isOwnerAccount(user);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const tick = async () => {
      try {
        if (owner) {
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
    // أسرع قليلًا حتى لا تفوت رسالة والمالك على الشاشة
    const interval = setInterval(tick, 8_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id, owner]);

  return null;
}

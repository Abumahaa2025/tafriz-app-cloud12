/**
 * صوت واجهة ناعم عبر Web Audio API — بدون ملفات صوتية أو تغيير هوية التطبيق.
 * يُستخدم كردّ فعل سمعي لزر الأوامر الصوتية فقط.
 */

type SoftToneKind = "listen" | "done";

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    try {
      sharedCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

function tone(
  ctx: AudioContext,
  startAt: number,
  freq: number,
  duration: number,
  peak: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** نغمة ناعمة عند بدء الاستماع أو عند اكتمال الأمر */
export function playSoftUiSound(kind: SoftToneKind = "listen"): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume().catch(() => {});
    const t0 = ctx.currentTime + 0.01;
    if (kind === "listen") {
      // صعود خفيف وهادئ — إيذان ببدء الاستماع
      tone(ctx, t0, 660, 0.12, 0.045);
      tone(ctx, t0 + 0.09, 880, 0.16, 0.035);
      return;
    }
    // هبوط لطيف — اكتمال الأمر والعودة للوضع الطبيعي
    tone(ctx, t0, 740, 0.1, 0.03);
    tone(ctx, t0 + 0.08, 520, 0.14, 0.025);
  } catch {
    // تجاهل أي فشل صوتي — لا يؤثر على الأوامر
  }
}

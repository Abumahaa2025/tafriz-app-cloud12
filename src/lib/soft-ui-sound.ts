/**
 * صوت واجهة ناعم عبر Web Audio API — بدون ملفات صوتية أو تغيير هوية التطبيق.
 * نغمة واحدة فقط عند البدء، ونغمة واحدة فقط عند الانتهاء.
 */

type SoftToneKind = "listen" | "done";

let sharedCtx: AudioContext | null = null;
let activeStop: (() => void) | null = null;
let lastPlayAt = 0;
let lastKind: SoftToneKind | null = null;

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

function stopActiveTone() {
  if (!activeStop) return;
  try {
    activeStop();
  } catch {
    // ignore
  }
  activeStop = null;
}

/** نغمة ناعمة واحدة — دون تتابع أو تكرار */
export function playSoftUiSound(kind: SoftToneKind = "listen"): void {
  try {
    const now = Date.now();
    // يمنع الأصوات المتلاحقة لنفس الحالة (ضغط مزدوج / إعادة رسم)
    if (lastKind === kind && now - lastPlayAt < 450) return;
    lastPlayAt = now;
    lastKind = kind;

    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume().catch(() => {});

    stopActiveTone();

    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    // نغمة واحدة فقط: أعلى قليلًا للبدء، أهدأ للانتهاء
    const freq = kind === "listen" ? 700 : 540;
    const dur = 0.13;
    const peak = kind === "listen" ? 0.04 : 0.032;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);

    activeStop = () => {
      try {
        osc.stop();
      } catch {
        // ignore
      }
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
    window.setTimeout(() => {
      if (activeStop) activeStop = null;
    }, Math.ceil((dur + 0.04) * 1000));
  } catch {
    // تجاهل أي فشل صوتي — لا يؤثر على الأوامر
  }
}

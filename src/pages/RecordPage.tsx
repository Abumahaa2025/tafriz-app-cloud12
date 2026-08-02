import * as React from "react";
import {
  Mic,
  Square,
  Trash2,
  Play,
  ArrowRight,
  Command,
  ExternalLink,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabKey } from "@/components/BottomNav";
import { MenuTarget } from "@/components/AppMenu";
import { idbGet } from "@/lib/idb";
import {
  CHECK_IDB_KEY,
  CheckSheetData,
  CheckSheetRow,
  indexCheckSheet,
  lookupPlateVoice,
} from "@/lib/check-engine";
import { googleMapsOpenUrl } from "@/lib/map-coords";
import {
  appVoiceHelpText,
  isAppVoiceSupported,
  parseAppVoiceCommand,
  startAppVoice,
  AppVoiceOverlay,
} from "@/lib/app-voice";
import { createSpeechPlateBuffer, speechToPlateCandidates } from "@/lib/speech-plate";

interface Recording {
  id: string;
  url: string;
  createdAt: string;
}

export default function RecordPage({
  onBack,
  onNavigateTab,
  onOpenPage,
  isOwner,
}: {
  onBack?: () => void;
  onNavigateTab?: (tab: TabKey) => void;
  onOpenPage?: (target: MenuTarget | "ai-scan") => void;
  isOwner?: boolean;
}) {
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [lastHeard, setLastHeard] = React.useState("");
  const [found, setFound] = React.useState<CheckSheetRow | null>(null);
  const [checkIndex, setCheckIndex] = React.useState<Map<string, CheckSheetRow>>(() => new Map());
  const [hasCheckFile, setHasCheckFile] = React.useState(false);

  const [recording, setRecording] = React.useState(false);
  const [recordings, setRecordings] = React.useState<Recording[]>([]);
  const [audioError, setAudioError] = React.useState<string | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const speechRef = React.useRef<{ stop: () => void } | null>(null);
  const tipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const plateBufRef = React.useRef(createSpeechPlateBuffer());

  React.useEffect(() => {
    idbGet<CheckSheetData>(CHECK_IDB_KEY).then((saved) => {
      if (!saved?.rows?.length) return;
      setHasCheckFile(true);
      setCheckIndex(indexCheckSheet(saved));
    });
    return () => {
      speechRef.current?.stop();
      speechRef.current = null;
      plateBufRef.current.reset();
      if (tipTimer.current) clearTimeout(tipTimer.current);
    };
  }, []);

  function showNotice(msg: string, ms = 3200) {
    setNotice(msg);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, ms);
  }

  function stopListening() {
    speechRef.current?.stop();
    speechRef.current = null;
    plateBufRef.current.reset();
    setListening(false);
    setInterim("");
  }

  function openOverlay(target: AppVoiceOverlay) {
    if (target === "admin" && !isOwner) {
      showNotice("إدارة التحكم متاحة لمالك التطبيق فقط");
      return false;
    }
    if (target === "home") {
      onNavigateTab?.("sort");
      onOpenPage?.("home");
      return true;
    }
    onOpenPage?.(target);
    return true;
  }

  function tryPlateLookup(candidates: string[]): boolean {
    if (!hasCheckFile || checkIndex.size === 0) {
      showNotice("ارفع ملف التشيك أولًا من تبويب التشيك");
      return false;
    }
    for (const c of candidates) {
      const hit = lookupPlateVoice(checkIndex, c);
      if (hit) {
        setFound(hit);
        return true;
      }
    }
    return false;
  }

  function handleTranscript(transcript: string, alternatives: string[]) {
    setLastHeard(transcript);
    const pool = [transcript, ...alternatives];

    // أوامر التنقّل أولًا (بدون تجميع أرقام)
    for (const alt of pool) {
      const action = parseAppVoiceCommand(alt);
      if (!action) continue;
      if (action.type === "plate_check") continue;

      if (action.type === "help") {
        showNotice(appVoiceHelpText(), 5500);
        stopListening();
        return;
      }

      if (action.type === "navigate_tab") {
        showNotice(`تم: ${action.label}`);
        stopListening();
        onNavigateTab?.(action.tab);
        return;
      }

      if (action.type === "open_overlay") {
        const ok = openOverlay(action.target);
        if (ok) {
          showNotice(`تم: ${action.label}`);
          stopListening();
        }
        return;
      }

      if (action.type === "audio_record") {
        showNotice("بدء التسجيل الصوتي");
        stopListening();
        void startRecording();
        return;
      }
    }

    // فحص لوحة مع تجميع المقاطع (١٢ + ٣٤ → ١٢٣٤)
    const ranked = plateBufRef.current.ingest([transcript]);
    const merged = new Set(ranked);
    for (const alt of alternatives) {
      for (const c of speechToPlateCandidates(alt)) merged.add(c);
    }
    const candidates = [...merged].sort((a, b) => b.length - a.length);

    if (candidates.some((c) => c.length >= 1)) {
      if (tryPlateLookup(candidates)) {
        showNotice("وُجدت اللوحة");
        stopListening();
        return;
      }
      if (candidates.some((c) => c.length >= 2) || transcript.trim().length >= 2) {
        showNotice("حاول إدخال أحرف منفصلة أو رقم");
        return;
      }
    }

    if (transcript.trim().length >= 2) {
      showNotice("حاول إدخال أحرف منفصلة أو رقم — أو قل: افتح الفرز / التشيك / الخرائط");
    }
  }

  function startListening() {
    setNotice(null);
    setFound(null);
    setLastHeard("");
    plateBufRef.current.reset();
    if (!isAppVoiceSupported()) {
      showNotice("التعرف الصوتي غير مدعوم هنا — استخدم الأزرار للتنقل");
      return;
    }
    const handle = startAppVoice({
      onFinal: handleTranscript,
      onInterim: setInterim,
      onError: (m) => showNotice(m, 4000),
      onEnd: () => setListening(false),
    });
    if (!handle) return;
    speechRef.current = handle;
    setListening(true);
  }

  async function startRecording() {
    setAudioError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordings((prev) => [
          { id: crypto.randomUUID(), url, createdAt: new Date().toLocaleTimeString("ar-SA") },
          ...prev,
        ]);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setAudioError("تعذّر الوصول للمايكروفون — تأكد من منح الإذن للمتصفح");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  const mapHref = found?.mapUrl
    ? googleMapsOpenUrl({ mapUrl: found.mapUrl, query: found.gps || found.plate })
    : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center gap-2 py-2">
        {onBack && (
          <button onClick={onBack} className="text-muted-foreground">
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
        <Command className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-black">الأوامر الصوتية</h1>
      </header>

      <p className="text-xs text-muted-foreground">
        أوامر شاملة للتطبيق بالكامل: تنقّل بين الصفحات، فتح الحساب وقاعدة البيانات، وفحص اللوحات
        مباشرة — أقوى من أمر صوت التشيك.
      </p>

      <Button
        size="lg"
        variant={listening ? "destructive" : "default"}
        onClick={listening ? stopListening : startListening}
      >
        {listening ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        {listening ? "إيقاف الأوامر" : "ابدأ الأوامر الصوتية"}
      </Button>

      {listening && (
        <p className="text-center text-xs text-muted-foreground">
          {interim ? "يسمع: " + interim : "استمع… قل أمرًا أو رقم لوحة (يتوقف عند التنفيذ)"}
        </p>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm font-medium text-amber-900 dark:text-amber-100"
        >
          {notice}
        </div>
      )}

      {lastHeard && (
        <p className="text-center text-[11px] text-muted-foreground">آخر أمر: {lastHeard}</p>
      )}

      {found && (
        <Card className="border-primary/30">
          <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
            <CheckSquare className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">نتيجة الفحص الصوتي</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-black text-primary">{found.plate}</span>
              <span className="text-xs text-muted-foreground">لوحة</span>
            </div>
            {found.gps ? (
              <p className="break-all text-xs text-muted-foreground">{found.gps}</p>
            ) : (
              <p className="text-xs text-muted-foreground">لا يوجد رابط خريطة لهذه اللوحة</p>
            )}
            {mapHref && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(mapHref, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4" />
                فتح الخريطة
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">أمثلة أوامر</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          <p>• افتح الفرز / افتح التشيك / افتح الخرائط</p>
          <p>• قاعدة البيانات / الحساب / المسح الذكي</p>
          <p>• انطق رقم أو حروف اللوحة للفحص مباشرة</p>
          <p>• تسجيل صوت — لبدء تسجيل عادي</p>
          <p>• مساعدة — لعرض القائمة</p>
        </CardContent>
      </Card>

      <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs font-bold text-muted-foreground">تسجيل صوتي عادي</p>
        <Button
          size="lg"
          variant={recording ? "destructive" : "outline"}
          className="w-full"
          onClick={recording ? stopRecording : startRecording}
          disabled={listening}
        >
          {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          {recording ? "إيقاف التسجيل" : "بدء تسجيل جديد"}
        </Button>
        {audioError && <p className="mt-2 text-xs text-destructive">{audioError}</p>}

        <div className="mt-3 flex flex-col gap-2">
          {recordings.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">لا توجد تسجيلات بعد</p>
          )}
          {recordings.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
              <button
                onClick={() => setRecordings((prev) => prev.filter((x) => x.id !== r.id))}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <audio controls src={r.url} className="h-8 flex-1" />
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Play className="h-3 w-3" />
                {r.createdAt}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

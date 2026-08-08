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
  MapPin,
  MapPinned,
  ChevronDown,
  ChevronUp,
  Zap,
  Download,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabKey } from "@/components/BottomNav";
import { MenuTarget } from "@/components/AppMenu";
import { idbGet, idbUserMessage } from "@/lib/idb";
import {
  CHECK_IDB_KEY,
  CheckSheetData,
  CheckSheetRow,
  indexCheckSheet,
  lookupPlateVoiceDetailed,
} from "@/lib/check-engine";
import { googleMapsOpenUrl } from "@/lib/map-coords";
import { requestMapsAssist } from "@/lib/ai-maps";
import { backend } from "@/lib/backend";
import {
  appVoiceHelpText,
  isAppVoiceSupported,
  parseAppVoiceCommand,
  startAppVoice,
  AppVoiceOverlay,
} from "@/lib/app-voice";
import { createSpeechPlateBuffer } from "@/lib/speech-plate";
import { playSoftUiSound } from "@/lib/soft-ui-sound";
import {
  loadFieldProfile,
  saveFieldProfile,
  profileReady,
  MAX_RECORD_MS,
  formatMmSs,
  type FieldRecordingProfile,
  type GpsPoint,
} from "@/lib/field-recording";
import {
  buildRecordedAudioBlob,
  createAudioMediaRecorder,
  isAudioRecordingSupported,
} from "@/lib/media-recorder";
import {
  dumpSessionToRows,
  loadDumpRows,
  saveDumpRows,
  type FieldDumpRow,
} from "@/lib/field-dump";

interface Recording {
  id: string;
  url: string;
  createdAt: string;
  street: string;
  registrarName: string;
  neighborhood: string;
  points: GpsPoint[];
  dumped: boolean;
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
  const recordMimeRef = React.useRef("");
  const speechRef = React.useRef<{ stop: () => void } | null>(null);
  const tipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const plateBufRef = React.useRef(createSpeechPlateBuffer());
  const plateCommitRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fieldProfile, setFieldProfile] = React.useState<FieldRecordingProfile>(() => loadFieldProfile());
  const [basicOpen, setBasicOpen] = React.useState(false);
  const [gpsPoints, setGpsPoints] = React.useState<GpsPoint[]>([]);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [streetCoords, setStreetCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [dumpRows, setDumpRows] = React.useState<FieldDumpRow[]>([]);
  const [mapsAiBusy, setMapsAiBusy] = React.useState(false);
  const [mapsAiHint, setMapsAiHint] = React.useState<string | null>(null);
  const pendingPointsRef = React.useRef<GpsPoint[]>([]);
  const recordStartedAt = React.useRef(0);
  const maxTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  /** يمنع تراكب getCurrentPosition أثناء الوضع التلقائي أو الطلبات البطيئة */
  const gpsInFlightRef = React.useRef(false);
  /** يُزاد عند الإيقاف/unmount لتجاهل callbacks متأخرة */
  const gpsRequestGenRef = React.useRef(0);
  const recordingRef = React.useRef(false);

  function updateProfile(patch: Partial<FieldRecordingProfile>) {
    setFieldProfile((prev) => {
      const next = { ...prev, ...patch };
      saveFieldProfile(next);
      return next;
    });
  }

  function showNotice(msg: string, ms = 3200) {
    setNotice(msg);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, ms);
  }

  function gpsFailureMessage(
    code: number | undefined,
    whileRecording: boolean
  ): string {
    if (code === 1 /* PERMISSION_DENIED */) {
      return whileRecording
        ? "تم رفض إذن الموقع، سيستمر التسجيل بدون GPS."
        : "تم رفض إذن الموقع.";
    }
    if (code === 3 /* TIMEOUT */) {
      return whileRecording
        ? "تعذر تحديد الموقع في الوقت المحدد، سيستمر التسجيل بدون GPS."
        : "تعذر تحديد الموقع في الوقت المحدد.";
    }
    // POSITION_UNAVAILABLE أو غير معروف
    return whileRecording
      ? "تعذر تحديد الموقع، سيستمر التسجيل بدون GPS."
      : "تعذر تحديد الموقع.";
  }

  function invalidateGpsRequests() {
    gpsRequestGenRef.current += 1;
    gpsInFlightRef.current = false;
  }

  function clearGpsWatchers() {
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    // لا يمكن إلغاء getCurrentPosition — نتجاهل أي callback لاحق
    invalidateGpsRequests();
  }

  function captureGpsPoint() {
    // طلب واحد فقط في الهواء في أي لحظة
    if (gpsInFlightRef.current) return;

    const whileRecording = recordingRef.current;

    if (!navigator.geolocation) {
      if (whileRecording) {
        showNotice("تعذر تحديد الموقع، سيستمر التسجيل بدون GPS.");
      }
      return;
    }

    const gen = gpsRequestGenRef.current;
    gpsInFlightRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gpsRequestGenRef.current !== gen) return;
        gpsInFlightRef.current = false;
        const point = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          at: new Date().toISOString(),
        };
        setGpsPoints((prev) => {
          const next = [...prev, point];
          pendingPointsRef.current = next;
          return next;
        });
        setStreetCoords({ lat: point.lat, lng: point.lng });
      },
      (err) => {
        if (gpsRequestGenRef.current !== gen) return;
        gpsInFlightRef.current = false;
        // لا يوقف التسجيل — تنبيه عبر آلية notice الحالية فقط
        showNotice(gpsFailureMessage(err?.code, whileRecording || recordingRef.current));
      },
      // timeout ضروري لتمييز TIMEOUT؛ لا يغيّر interval الالتقاط الدوري
      { timeout: 15_000, maximumAge: 0 }
    );
  }

  async function suggestStreetFromMapsAi(coords?: { lat: number; lng: number } | null) {
    const location = coords ?? streetCoords;
    if (!location) {
      captureGpsPoint();
      setMapsAiHint("التقط نقطة GPS أولًا ثم أعد المحاولة.");
      return;
    }
    setMapsAiBusy(true);
    setMapsAiHint(null);
    try {
      const points = pendingPointsRef.current;
      const result =
        points.length >= 2
          ? await requestMapsAssist({
              action: "track",
              points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
              location,
              query: "تتبع تسجيل ميداني",
            })
          : await requestMapsAssist({
              action: "locate",
              location,
            });

      const street =
        result.street ||
        [result.placeName, result.neighborhood].filter(Boolean).join(" - ") ||
        "";
      if (street || result.neighborhood?.trim()) {
        setFieldProfile((prev) => {
          const next = {
            ...prev,
            street: street || prev.street,
            neighborhood: result.neighborhood?.trim() || prev.neighborhood,
          };
          saveFieldProfile(next);
          return next;
        });
      }
      setMapsAiHint(result.summary || street || "تم تحديد الموقع عبر Gemini Maps");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر تحديد الشارع من الخرائط";
      setMapsAiHint(msg);
      backend.logError(msg, "RecordPage: maps-assist").catch(() => {});
    } finally {
      setMapsAiBusy(false);
    }
  }

  React.useEffect(() => {
    loadDumpRows()
      .then((rows) => setDumpRows(rows))
      .catch((err) => showNotice(idbUserMessage(err, "load"), 5000));
    idbGet<CheckSheetData>(CHECK_IDB_KEY)
      .then((saved) => {
        if (!saved?.rows?.length) return;
        setHasCheckFile(true);
        setCheckIndex(indexCheckSheet(saved));
      })
      .catch((err) => showNotice(idbUserMessage(err, "load"), 5000));
    return () => {
      speechRef.current?.stop();
      speechRef.current = null;
      plateBufRef.current.reset();
      if (tipTimer.current) clearTimeout(tipTimer.current);
      if (plateCommitRef.current) clearTimeout(plateCommitRef.current);
      clearGpsWatchers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** يعيد زر الأوامر الصوتية لوضعه الطبيعي بعد الأمر أو الإيقاف اليدوي */
  function stopListening(reason: "manual" | "command" | "cleanup" = "manual") {
    speechRef.current?.stop();
    speechRef.current = null;
    plateBufRef.current.reset();
    if (plateCommitRef.current) clearTimeout(plateCommitRef.current);
    setListening(false);
    setInterim("");
    // صوت انتهاء واحد فقط بعد الأمر أو الإيقاف اليدوي
    if (reason === "command" || reason === "manual") {
      playSoftUiSound("done");
    }
  }

  function openOverlay(target: AppVoiceOverlay) {
    if (target === "admin" && !isOwner) {
      showNotice("إدارة التحكم متاحة لإدارة التطبيق فقط");
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

  function commitPlateLookup(query: string) {
    if (!hasCheckFile || checkIndex.size === 0) {
      showNotice("ارفع ملف التشيك أولًا من تبويب التشيك");
      stopListening("command");
      return;
    }
    if (!query) {
      stopListening("command");
      return;
    }
    const result = lookupPlateVoiceDetailed(checkIndex, query);
    if (result.status === "exact") {
      setFound(result.row);
      showNotice("وُجدت اللوحة");
      stopListening("command");
      return;
    }
    if (result.status === "similar") {
      setFound(result.row);
      showNotice(
        `لم يُعثر على الرقم المطلوب (${result.query})، وُجد رقم قريب الشبه: ${result.row.plate}`,
        5500
      );
      stopListening("command");
      return;
    }
    showNotice("لم تُوجد مطابقة — أعد المحاولة بوضوح");
    // بعد كل عملية أمر صوتي يعود الزر لوضعه الطبيعي
    stopListening("command");
  }

  function handleTranscript(transcript: string, alternatives: string[]) {
    setLastHeard(transcript);
    const pool = [transcript, ...alternatives];

    for (const alt of pool) {
      const action = parseAppVoiceCommand(alt);
      if (!action) continue;
      if (action.type === "plate_check") continue;

      if (action.type === "help") {
        showNotice(appVoiceHelpText(), 5500);
        stopListening("command");
        return;
      }

      if (action.type === "navigate_tab") {
        showNotice(`تم: ${action.label}`);
        stopListening("command");
        onNavigateTab?.(action.tab);
        return;
      }

      if (action.type === "open_overlay") {
        const ok = openOverlay(action.target);
        if (ok) showNotice(`تم: ${action.label}`);
        // سواء نجح أو رُفض — إنهاء الجلسة والعودة للوضع الطبيعي
        stopListening("command");
        return;
      }

      if (action.type === "audio_record") {
        showNotice("بدء التسجيل الصوتي");
        stopListening("command");
        void startRecording();
        return;
      }
    }

    const ranked = plateBufRef.current.ingest([transcript]);
    const assembled = plateBufRef.current.value || ranked[0] || "";
    if (assembled) setInterim(assembled);

    if (plateCommitRef.current) clearTimeout(plateCommitRef.current);
    plateCommitRef.current = setTimeout(() => {
      const q = plateBufRef.current.value;
      if (!q) {
        if (transcript.trim().length >= 2) {
          showNotice("حاول إدخال أحرف منفصلة أو رقم — أو قل: افتح الفرز / التشيك / الخرائط");
        }
        // بعد محاولة الأمر غير المفهومة يعود الزر طبيعيًا
        stopListening("command");
        return;
      }
      commitPlateLookup(q);
    }, 1400);
  }

  function startListening() {
    // صوت ناعم واحد فور الضغط
    playSoftUiSound("listen");
    setNotice(null);
    setFound(null);
    setLastHeard("");
    plateBufRef.current.reset();
    if (plateCommitRef.current) clearTimeout(plateCommitRef.current);
    if (!isAppVoiceSupported()) {
      showNotice("التعرف الصوتي غير مدعوم هنا — استخدم الأزرار للتنقل");
      return;
    }
    // أوقف أي جلسة سابقة لتفادي سباق الضغط المزدوج / listening loop
    speechRef.current?.stop();
    speechRef.current = null;
    const handle = startAppVoice({
      onFinal: handleTranscript,
      onInterim: setInterim,
      onError: (m) => {
        showNotice(m, 4000);
        // خطأ → العودة للوضع الطبيعي بدون تكرار صوت الانتهاء
        stopListening("cleanup");
      },
      onEnd: () => {
        // انتهاء الجلسة من المحرك → زر الأوامر يعود لوضعه الطبيعي
        setListening(false);
        setInterim("");
        speechRef.current = null;
      },
    });
    if (!handle) {
      setListening(false);
      return;
    }
    speechRef.current = handle;
    setListening(true);
  }

  async function startRecording() {
    setAudioError(null);
    if (!profileReady(fieldProfile)) {
      setAudioError("أكمل اسم المسجّل والحي واسم الشارع قبل التسجيل");
      setBasicOpen(true);
      return;
    }
    if (!isAudioRecordingSupported()) {
      setAudioError("التسجيل الصوتي غير مدعوم في هذا المتصفح");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { recorder, mimeType } = createAudioMediaRecorder(stream);
      recordMimeRef.current = mimeType;
      chunksRef.current = [];
      setGpsPoints([]);
      pendingPointsRef.current = [];
      // جلسة GPS جديدة — لا تُخلط مع طلبات سابقة معلّقة
      invalidateGpsRequests();
      recordStartedAt.current = Date.now();
      setElapsedMs(0);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = buildRecordedAudioBlob(chunksRef.current, recordMimeRef.current);
        const url = URL.createObjectURL(blob);
        const pointsSnapshot = pendingPointsRef.current.slice();
        setRecordings((prev) => [
          {
            id: crypto.randomUUID(),
            url,
            createdAt: new Date().toLocaleTimeString("ar-SA"),
            street: fieldProfile.street,
            registrarName: fieldProfile.registrarName,
            neighborhood: fieldProfile.neighborhood,
            points: pointsSnapshot,
            dumped: false,
          },
          ...prev,
        ]);
        stream?.getTracks().forEach((t) => t.stop());
        clearGpsWatchers();
        setElapsedMs(0);
        pendingPointsRef.current = [];
      };
      // timeslice يساعد Safari/iOS على تفريغ القطع أثناء التسجيل الطويل
      try {
        recorder.start(1000);
      } catch {
        recorder.start();
      }
      mediaRecorderRef.current = recorder;
      recordingRef.current = true;
      setRecording(true);
      captureGpsPoint();
      tickTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - recordStartedAt.current);
      }, 250);
      maxTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS);
      if (fieldProfile.gpsMode === "auto") {
        intervalTimerRef.current = setInterval(
          () => captureGpsPoint(),
          fieldProfile.intervalSec * 1000
        );
      }
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      setAudioError("تعذّر الوصول للمايكروفون — تأكد من منح الإذن للمتصفح");
    }
  }

  function stopRecording() {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        // بعض المتصفحات ترمي إن أُوقف مرتين
      }
    }
    recordingRef.current = false;
    setRecording(false);
    clearGpsWatchers();
  }


  async function dumpRecording(rec: Recording) {
    if (rec.dumped) {
      showNotice("هذا التسجيل مفرّغ مسبقًا");
      return;
    }
    const rows = dumpSessionToRows({
      registrarName: rec.registrarName,
      neighborhood: rec.neighborhood,
      street: rec.street,
      points: rec.points,
    });
    const next = [...rows, ...dumpRows];
    setDumpRows(next);
    setRecordings((prev) => prev.map((r) => (r.id === rec.id ? { ...r, dumped: true } : r)));
    try {
      await saveDumpRows(next);
      showNotice(`تم التفريغ: ${rows.length} صف`);
    } catch (err) {
      showNotice(idbUserMessage(err, "save"), 5000);
    }
  }

  async function dumpAllPending() {
    const pending = recordings.filter((r) => !r.dumped);
    if (pending.length === 0) {
      showNotice("لا توجد ملفات معلّقة للتفريغ");
      return;
    }
    const added: FieldDumpRow[] = [];
    for (const rec of [...pending].reverse()) {
      added.push(
        ...dumpSessionToRows({
          registrarName: rec.registrarName,
          neighborhood: rec.neighborhood,
          street: rec.street,
          points: rec.points,
        })
      );
    }
    const next = [...added, ...dumpRows];
    setDumpRows(next);
    setRecordings((prev) => prev.map((r) => ({ ...r, dumped: true })));
    try {
      await saveDumpRows(next);
      showNotice(`تفريغ كل المعلق: ${added.length} صف من ${pending.length} تسجيل`);
    } catch (err) {
      showNotice(idbUserMessage(err, "save"), 5000);
    }
  }

  async function clearDumpTable() {
    setDumpRows([]);
    try {
      await saveDumpRows([]);
      showNotice("تم مسح جدول البيانات");
    } catch (err) {
      showNotice(idbUserMessage(err, "save"), 5000);
    }
  }

  function exportDumpTable() {
    if (dumpRows.length === 0) {
      showNotice("الجدول فارغ");
      return;
    }
    const header = ["رقم اللوحة", "ملاحظات", "نوع السيارة", "اسم المسجل", "الشارع", "الحي", "GPS", "تاريخ التسجيل"];
    const lines = [header.join(",")];
    for (const r of dumpRows) {
      lines.push(
        [r.plate, r.notes, r.carType, r.registrarName, r.street, r.neighborhood, r.gps, r.recordedAt]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(",")
      );
    }
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nuskha-tasjeel-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const mapHref = found?.mapUrl
    ? googleMapsOpenUrl({ mapUrl: found.mapUrl, query: found.gps || found.plate })
    : null;
  const ready = profileReady(fieldProfile);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center gap-2 py-2">
        {onBack && (
          <button onClick={onBack} className="text-muted-foreground">
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
        <Mic className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-black">التسجيل</h1>
      </header>

      <button
        type="button"
        onClick={() => setBasicOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-3 text-right"
      >
        <span className="text-sm font-bold">بيانات التسجيل الأساسية</span>
        {basicOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {basicOpen && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <Input
              placeholder="اسم المسجّل"
              value={fieldProfile.registrarName}
              onChange={(e) => updateProfile({ registrarName: e.target.value })}
              className="text-right"
            />
            <Input
              placeholder="الحي"
              value={fieldProfile.neighborhood}
              onChange={(e) => updateProfile({ neighborhood: e.target.value })}
              className="text-right"
            />
            <Input
              placeholder="الشارع"
              value={fieldProfile.street}
              onChange={(e) => updateProfile({ street: e.target.value })}
              className="text-right"
            />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-xs">
        <span
          className={`rounded-full px-2 py-1 font-bold ${
            ready ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {ready ? "جاهز للتسجيل" : "أكمل الإعدادات"}
        </span>
        <span className="text-muted-foreground">الحد الأقصى 5 دقائق</span>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Mic className="h-4 w-4 text-primary" />
            التسجيل الصوتي
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {recording && (
            <div className="w-full text-center">
              <p className="font-black tabular-nums">
                {formatMmSs(elapsedMs)} / {formatMmSs(MAX_RECORD_MS)}
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (elapsedMs / MAX_RECORD_MS) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={!recording || fieldProfile.gpsMode !== "manual"}
              onClick={captureGpsPoint}
              className="flex flex-col items-center gap-1 rounded-xl border border-border px-3 py-2 disabled:opacity-40"
            >
              <MapPin className="h-5 w-5 text-destructive" />
              <span className="text-[10px] font-bold">دبوس GPS</span>
            </button>
            <button
              type="button"
              onClick={recording ? stopRecording : () => void startRecording()}
              disabled={listening}
              className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${
                recording
                  ? "border-destructive bg-destructive text-white"
                  : "border-primary bg-primary text-primary-foreground"
              }`}
            >
              {recording ? <Square className="h-7 w-7" /> : <span className="h-6 w-6 rounded-full bg-white" />}
            </button>
            <div className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl border border-border px-2 py-2">
              <MapPinned className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-bold">{gpsPoints.length} نقطة</span>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            {recording ? "إيقاف" : "تسجيل"} · في الوضع اليدوي استخدم دبوس الموقع أثناء التسجيل
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">الشارع الحالي</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Input
            placeholder="مطلوب قبل التسجيل"
            value={fieldProfile.street}
            onChange={(e) => updateProfile({ street: e.target.value })}
            className="text-right"
          />
          {streetCoords && (
            <p className="text-[11px] text-muted-foreground">
              موقع الشارع — {streetCoords.lat.toFixed(6)}, {streetCoords.lng.toFixed(6)}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={mapsAiBusy}
            onClick={() => void suggestStreetFromMapsAi()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {mapsAiBusy ? "جاري التحديد من Gemini Maps..." : "تعرّف على الشارع من GPS"}
          </Button>
          {mapsAiHint && (
            <p className="text-[11px] text-muted-foreground">{mapsAiHint}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">تتبع الموقع (GPS)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={fieldProfile.gpsMode === "auto" ? "default" : "outline"}
              onClick={() => updateProfile({ gpsMode: "auto" })}
            >
              تلقائي
            </Button>
            <Button
              type="button"
              variant={fieldProfile.gpsMode === "manual" ? "default" : "outline"}
              onClick={() => updateProfile({ gpsMode: "manual" })}
            >
              يدوي
            </Button>
          </div>
          <label className="text-xs text-muted-foreground">الفترة بين النقاط (ثانية)</label>
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={fieldProfile.intervalSec}
            onChange={(e) =>
              updateProfile({
                intervalSec: Number(e.target.value) as FieldRecordingProfile["intervalSec"],
              })
            }
          >
            <option value={5}>5 ثانية</option>
            <option value={10}>10 ثانية</option>
            <option value={15}>15 ثانية</option>
            <option value={30}>30 ثانية</option>
          </select>
        </CardContent>
      </Card>

      {audioError && <p className="text-xs text-destructive">{audioError}</p>}

      <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs font-bold text-muted-foreground">قائمة التسجيلات</p>
        <div className="flex flex-col gap-2">
          {recordings.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">لا توجد تسجيلات بعد</p>
          )}
          {recordings.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2">
              <div className="flex items-center gap-2">
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
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>{r.street || "بدون شارع"} · {r.points.length} نقطة</span>
                <Button
                  type="button"
                  size="sm"
                  variant={r.dumped ? "outline" : "default"}
                  disabled={r.dumped}
                  onClick={() => void dumpRecording(r)}
                >
                  <Zap className="h-3.5 w-3.5" />
                  {r.dumped ? "مفرّغ" : "تفريغ"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button type="button" variant="secondary" className="w-full" onClick={() => void dumpAllPending()}>
        <Zap className="h-4 w-4" />
        تفريغ كل الملفات المعلقة بالترتيب
      </Button>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={exportDumpTable}>
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => void clearDumpTable()}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <CardTitle className="text-sm">جدول البيانات · {dumpRows.length} لوحة</CardTitle>
        </CardHeader>
        <CardContent className="max-h-64 overflow-auto">
          {dumpRows.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">لا صفوف بعد — سجّل ثم اضغط تفريغ</p>
          ) : (
            <table className="w-full text-right text-[11px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1">اللوحة</th>
                  <th className="py-1">الشارع</th>
                  <th className="py-1">GPS</th>
                  <th className="py-1">المسجّل</th>
                </tr>
              </thead>
              <tbody>
                {dumpRows.slice(0, 80).map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-1 font-bold text-primary">{r.plate || "—"}</td>
                    <td className="py-1">{r.street || "—"}</td>
                    <td className="py-1 font-mono text-[10px]">{r.gps}</td>
                    <td className="py-1">{r.registrarName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="border-t border-border pt-3">
        <header className="mb-2 flex items-center gap-2">
          <Command className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-black">الأوامر الصوتية</h2>
        </header>
        <p className="mb-2 text-xs text-muted-foreground">
          أوامر شاملة: تنقّل، فتح الصفحات، وفحص اللوحات صوتًا — محفوظة كما أنجزناها.
        </p>

        <Button
          size="lg"
          variant={listening ? "destructive" : "default"}
          className="w-full"
          onClick={() => {
            if (listening) {
              stopListening("manual");
              return;
            }
            startListening();
          }}
          disabled={recording}
          aria-pressed={listening}
          aria-label={listening ? "إيقاف الأوامر الصوتية" : "ابدأ الأوامر الصوتية"}
        >
          {listening ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          {listening ? "إيقاف الأوامر" : "ابدأ الأوامر الصوتية"}
        </Button>

        {listening && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {interim ? "يسمع: " + interim : "استمع… قل أمرًا أو رقم لوحة"}
          </p>
        )}

        {notice && (
          <div
            role="status"
            className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm font-medium text-amber-900 dark:text-amber-100"
          >
            {notice}
          </div>
        )}

        {lastHeard && (
          <p className="mt-1 text-center text-[11px] text-muted-foreground">آخر أمر: {lastHeard}</p>
        )}

        {found && (
          <Card className="mt-2 border-primary/30">
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
      </div>
    </div>
  );
}

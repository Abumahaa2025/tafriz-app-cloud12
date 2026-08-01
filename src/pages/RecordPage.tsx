import * as React from "react";
import { Mic, Square, Trash2, Play, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Recording {
  id: string;
  url: string;
  createdAt: string;
}

export default function RecordPage({ onBack }: { onBack?: () => void }) {
  const [recording, setRecording] = React.useState(false);
  const [recordings, setRecordings] = React.useState<Recording[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  async function startRecording() {
    setError(null);
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
      setError("تعذّر الوصول للمايكروفون — تأكد من منح الإذن للمتصفح");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

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

      <p className="text-xs text-muted-foreground">
        تسجيل صوتي مباشر بدون أي تحويل نصي للأوامر حاليًا — ميزة "الأوامر
        الصوتية الذكية" تحتاج ربط لاحق بخدمة تحويل كلام إلى نص، أخبرني إن أردتها.
      </p>

      <Button
        size="lg"
        variant={recording ? "destructive" : "default"}
        onClick={recording ? stopRecording : startRecording}
      >
        {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        {recording ? "إيقاف التسجيل" : "بدء تسجيل جديد"}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
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
  );
}

import * as React from "react";
import { ArrowRight, Camera, ScanLine, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { recognizePlateFromImage } from "@/lib/ai-plate-recognition";
import { backend } from "@/lib/backend";

export default function AiScanPage({ onBack }: { onBack: () => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [plate, setPlate] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  function handlePick(f: File) {
    setFile(f);
    setPlate(null);
    setError(null);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleScan() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await recognizePlateFromImage(file);
      setPlate(result.plate);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر التعرف على اللوحة";
      setError(msg);
      backend.logError(msg, "AiScanPage: recognizePlateFromImage").catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center gap-2 py-2">
        <button onClick={onBack} className="text-muted-foreground">
          <ArrowRight className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-black">التعرف الذكي على اللوحة</h1>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlePick(f);
          e.target.value = "";
        }}
      />

      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-6">
          {previewUrl ? (
            <img src={previewUrl} alt="معاينة اللوحة" className="max-h-64 rounded-xl object-contain" />
          ) : (
            <div className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground">
              <Camera className="h-8 w-8" />
              <span className="text-sm">صوّر اللوحة أو اختر صورة</span>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
            <Camera className="h-4 w-4" />
            {file ? "تغيير الصورة" : "فتح الكاميرا / اختيار صورة"}
          </Button>

          <Button className="w-full" disabled={!file || loading} onClick={handleScan}>
            <ScanLine className="h-4 w-4" />
            {loading ? "جاري التعرف..." : "تعرّف على رقم اللوحة"}
          </Button>
        </CardContent>
      </Card>

      {plate && (
        <Card>
          <CardContent className="flex items-center justify-between pt-4">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(plate).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="text-muted-foreground hover:text-primary"
            >
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </button>
            <span className="text-lg font-black">{plate}</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-center text-sm text-destructive">
          {error}
          <br />
          <span className="text-xs text-muted-foreground">
            تأكد أنك رفعت المشروع مع مفتاح ANTHROPIC_API_KEY (راجع README.md).
          </span>
        </p>
      )}
    </div>
  );
}

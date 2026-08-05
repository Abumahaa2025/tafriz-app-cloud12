export interface PlateRecognitionResult {
  plate: string;
  raw?: string;
}

/**
 * Sends an image to /api/recognize-plate (a serverless function you deploy
 * alongside this app — see api/recognize-plate.ts) and returns the plate
 * number the AI model read from it.
 */
export async function recognizePlateFromImage(file: File): Promise<PlateRecognitionResult> {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch("/api/recognize-plate", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    // الخادم يرد بـ { error, message } — ما نعرض إلا الرسالة المكتوبة عندنا
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || "تعذّر التعرف على اللوحة، حاول مرة أخرى");
  }

  return (await res.json()) as PlateRecognitionResult;
}

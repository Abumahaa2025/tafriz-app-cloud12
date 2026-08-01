// هذا الملف "خادم صغير" (serverless function) — لا يعمل بأمر npm run dev العادي
// لوحده، لكنه يعمل تلقائيًا لو رفعت المشروع على Vercel (أو حوّلته لصيغة
// Netlify Functions). يحتاج مفتاح API من Anthropic محفوظ كمتغير بيئة اسمه
// ANTHROPIC_API_KEY في إعدادات الاستضافة — لا تكتب المفتاح داخل الكود مباشرة.

import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: { bodyParser: false },
};

async function readImageAsBase64(req: VercelRequest): Promise<{ base64: string; mediaType: string }> {
  // Minimal multipart/form-data reader for a single "image" field.
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);

  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.*)$/);
  if (!boundaryMatch) throw new Error("missing multipart boundary");
  const boundary = "--" + boundaryMatch[1];

  const parts = body.toString("binary").split(boundary);
  const filePart = parts.find((p) => p.includes('name="image"'));
  if (!filePart) throw new Error("no image field found");

  const mediaTypeMatch = filePart.match(/Content-Type:\s*(.*)/i);
  const mediaType = mediaTypeMatch ? mediaTypeMatch[1].trim() : "image/jpeg";

  const dataStart = filePart.indexOf("\r\n\r\n") + 4;
  const dataEnd = filePart.lastIndexOf("\r\n");
  const binaryData = filePart.slice(dataStart, dataEnd);

  const base64 = Buffer.from(binaryData, "binary").toString("base64");
  return { base64, mediaType };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).send("لم يتم ضبط ANTHROPIC_API_KEY على الخادم");
    return;
  }

  try {
    const { base64, mediaType } = await readImageAsBase64(req);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text:
                  "اقرأ رقم لوحة السيارة الظاهرة في الصورة فقط. أعد رقم اللوحة كما هو مكتوب " +
                  "(أرقام وأحرف عربية) بدون أي شرح إضافي. إن لم تجد لوحة واضحة أعد النص: غير واضح",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).send(errText);
      return;
    }

    const data = await response.json();
    const text: string =
      data.content?.find((c: { type: string }) => c.type === "text")?.text?.trim() ?? "";

    res.status(200).json({ plate: text, raw: text });
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : "خطأ غير متوقع");
  }
}

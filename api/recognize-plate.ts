// هذا الملف "خادم صغير" (serverless function) — لا يعمل بأمر npm run dev العادي
// لوحده، لكنه يعمل تلقائيًا لو رفعت المشروع على Vercel (أو حوّلته لصيغة
// Netlify Functions). يحتاج مفتاح API من Anthropic محفوظ كمتغير بيئة اسمه
// ANTHROPIC_API_KEY في إعدادات الاستضافة — لا تكتب المفتاح داخل الكود مباشرة.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail, failInternal, failUpstream } from "../lib/api/errors.js";
import { readAnthropicKey } from "../lib/api/env.js";

export const config = {
  api: { bodyParser: false },
};

/** سقف حجم الصورة. بدونه يقدر أي أحد يرسل طلبًا ضخمًا ويستنزف ذاكرة الدالة. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** خطأ في مدخلات المستخدم — رسالته آمنة للعرض لأننا نحن من كتبها. */
class BadImageRequest extends Error {}

async function readImageAsBase64(req: VercelRequest): Promise<{ base64: string; mediaType: string }> {
  // Minimal multipart/form-data reader for a single "image" field.
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_IMAGE_BYTES) {
      throw new BadImageRequest("حجم الصورة كبير جدًا. أرسل صورة أصغر من 8 ميجابايت.");
    }
    chunks.push(buf);
  }
  const body = Buffer.concat(chunks);

  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.*)$/);
  if (!boundaryMatch) throw new BadImageRequest("صيغة الطلب غير صحيحة.");
  const boundary = "--" + boundaryMatch[1];

  const parts = body.toString("binary").split(boundary);
  const filePart = parts.find((p) => p.includes('name="image"'));
  if (!filePart) throw new BadImageRequest("لم تُرفق أي صورة.");

  const mediaTypeMatch = filePart.match(/Content-Type:\s*(.*)/i);
  const mediaType = mediaTypeMatch ? mediaTypeMatch[1].trim() : "image/jpeg";
  if (!ALLOWED_MEDIA_TYPES.includes(mediaType.toLowerCase())) {
    throw new BadImageRequest("نوع الملف غير مدعوم. استخدم صورة JPG أو PNG.");
  }

  const dataStart = filePart.indexOf("\r\n\r\n") + 4;
  const dataEnd = filePart.lastIndexOf("\r\n");
  const binaryData = filePart.slice(dataStart, dataEnd);

  const base64 = Buffer.from(binaryData, "binary").toString("base64");
  return { base64, mediaType };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return fail(res, 405, "method_not_allowed", "الطريقة غير مسموحة.");
  }

  const apiKey = readAnthropicKey();
  if (!apiKey) {
    // نذكر اسم المتغيّر فقط — لا نلمّح لقيمته ولا نؤكد وجود مفاتيح أخرى.
    return fail(
      res,
      503,
      "missing_anthropic_key",
      "قراءة اللوحات بالذكاء غير مفعّلة. اضبط ANTHROPIC_API_KEY في إعدادات الاستضافة."
    );
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
      // رد المزوّد يروح للسجل فقط: قد يكشف نوع الاشتراك وحدوده وتفاصيل الحساب.
      const detail = await response.text().catch(() => "(تعذّرت قراءة رد المزوّد)");
      return failUpstream(
        res,
        `recognize-plate: anthropic ${response.status}`,
        detail,
        "تعذّر التعرف على اللوحة حاليًا. حاول مرة أخرى بعد قليل."
      );
    }

    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";

    res.status(200).json({ plate: text, raw: text });
  } catch (err) {
    if (err instanceof BadImageRequest) {
      return fail(res, 400, "invalid_image", err.message);
    }
    return failInternal(res, "recognize-plate", err);
  }
}

/**
 * رمز تفعيل شخصي ثابت لكل مستخدم (من معرّف حسابه).
 * الشكل: TFZ-U-XXXXXX
 */

export function personalActivationCode(userId: string): string {
  const raw = String(userId ?? "");
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = String(Math.abs(h) % 1_000_000).padStart(6, "0");
  return `TFZ-U-${n}`;
}

export function normalizePersonalCodeInput(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_\-–—]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "");
}

export function isPersonalCodeFormat(raw: string): boolean {
  return /^TFZ-U-\d{6}$/.test(normalizePersonalCodeInput(raw));
}

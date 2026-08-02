/**
 * قوة كلمة المرور: ضعيف / متوسط / قوي
 * التطبيق يقبل المتوسط فأعلى عند التسجيل أو تغيير كلمة المرور.
 */

export type PasswordStrength = "weak" | "medium" | "strong";

export function assessPasswordStrength(password: string): PasswordStrength {
  const p = String(password ?? "");
  if (p.length < 8) return "weak";

  const hasLetter = /[A-Za-z\u0600-\u06FF]/.test(p);
  const hasLower = /[a-z]/.test(p);
  const hasUpper = /[A-Z]/.test(p);
  const hasDigit = /\d/.test(p);
  const hasSpecial = /[^A-Za-z0-9\u0600-\u06FF]/.test(p);

  let classes = 0;
  if (hasLetter) classes += 1;
  if (hasDigit) classes += 1;
  if (hasSpecial) classes += 1;
  if (hasLower && hasUpper) classes += 1;

  if (classes >= 3 && p.length >= 10) return "strong";
  if (classes >= 2) return "medium";
  return "weak";
}

export function isPasswordAcceptable(password: string): boolean {
  const s = assessPasswordStrength(password);
  return s === "medium" || s === "strong";
}

export const PASSWORD_RULE_HINT =
  "كلمة المرور يجب أن تكون متوسطة على الأقل: 8 أحرف أو أكثر وتشمل حرفًا ورقمًا (ويُفضّل رمزًا)";

export function passwordStrengthLabel(s: PasswordStrength): string {
  if (s === "strong") return "قوية";
  if (s === "medium") return "متوسطة";
  return "ضعيفة";
}

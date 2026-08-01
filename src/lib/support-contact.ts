import { loadLocal, saveLocal } from "./storage";

const KEY = "support_phones";

export interface SupportPhone {
  label: string;
  /** بصيغة دولية بدون + وبدون أصفار بادئة، مثل 966575051487 */
  phone: string;
}

// أرقام التواصل الافتراضية مع إدارة التطبيق (يقدر المالك يعدّلها من إدارة
// التحكم ▸ الإعدادات في أي وقت).
const DEFAULT_PHONES: SupportPhone[] = [
  { label: "التواصل الأول", phone: "966575051487" },
  { label: "التواصل الثاني", phone: "96655438661" },
];

export function getSupportPhones(): SupportPhone[] {
  return loadLocal<SupportPhone[]>(KEY, DEFAULT_PHONES);
}

export function setSupportPhones(phones: SupportPhone[]) {
  saveLocal(KEY, phones);
}

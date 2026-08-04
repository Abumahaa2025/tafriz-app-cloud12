import * as React from "react";
import { ShieldCheck, Database, Lock, UserCog, FileWarning, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageBackHeader } from "@/components/PageBackHeader";

const SECTIONS: { icon: React.ElementType; title: string; body: string }[] = [
  {
    icon: Database,
    title: "البيانات التي نجمعها",
    body:
      "بيانات الحساب (البريد الإلكتروني أو رقم الجوال وكلمة المرور)، وملفات الفرز " +
      "التي ترفعها (بيانات اللوحات والشوارع)، وأي ملاحظات ترسلها لإدارة التطبيق.",
  },
  {
    icon: UserCog,
    title: "كيف نستخدم بياناتك",
    body:
      "تُستخدم بياناتك فقط لتشغيل ميزات التطبيق: مطابقة اللوحات، حفظ نتائج الفرز " +
      "على جهازك، والتواصل بينك وبين إدارة التطبيق بخصوص صلاحية الاستخدام والباقات.",
  },
  {
    icon: Lock,
    title: "أين تُخزَّن بياناتك",
    body:
      "في هذه النسخة، بياناتك (الحساب ونتائج الفرز) تُخزَّن محليًا على جهازك فقط " +
      "ولا تُرسل لأي خادم خارجي، باستثناء صورة تُرسلها أنت عمدًا لميزة «التعرف " +
      "الذكي على اللوحة» — تلك الصورة تُرسل لمزوّد الذكاء الاصطناعي لغرض القراءة " +
      "فقط ولا تُخزَّن بعد الرد.",
  },
  {
    icon: ShieldCheck,
    title: "التحكم بالصلاحيات",
    body:
      "إدارة التطبيق هي الجهة الوحيدة القادرة على الموافقة على طلبات الدخول أو إيقافها، " +
      "ويمكنها إيقاف صلاحية أي مستخدم في أي وقت دون إشعار مسبق.",
  },
  {
    icon: FileWarning,
    title: "مسؤوليتك",
    body:
      "أنت مسؤول عن دقة الملفات التي ترفعها وعن الحفاظ على سرية كلمة مرورك. " +
      "لا تشارك بيانات لوحات تخص أشخاصًا آخرين إلا ضمن نطاق عملك المصرّح به.",
  },
  {
    icon: Mail,
    title: "تواصل بخصوص الخصوصية",
    body: "لأي استفسار حول بياناتك، تواصل مع إدارة التطبيق من صفحة الحساب مباشرة.",
  },
];

export default function PrivacyPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <PageBackHeader title="الخصوصية" onBack={onBack} />

      {SECTIONS.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.title}>
            <CardContent className="flex gap-3 pt-4">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="flex flex-col gap-1 text-right">
                <span className="text-sm font-bold">{s.title}</span>
                <span className="text-xs leading-6 text-muted-foreground">{s.body}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

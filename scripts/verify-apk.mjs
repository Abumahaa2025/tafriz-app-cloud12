#!/usr/bin/env node
/**
 * فحص ملف APK قبل رفعه للمستخدمين.
 *
 * النسخة اللي كانت منشورة كانت تعطي "لم يتم تثبيت التطبيق" على كل جوال
 * أندرويد 11 فأحدث لأن ثلاثة شروط ما كانت متحققة فيها. هذا الملف يتأكد منها
 * كلها ويفشل قبل النشر بدل ما يكتشفها المستخدم على جواله:
 *
 *  1. أسماء الملفات داخل الـ APK لازم تستخدم "/" لا "\" — وإلا أندرويد ما
 *     يلقى ملفات res/ (الأيقونة والواجهات) ويرفض الحزمة.
 *  2. resources.arsc لازم يكون مخزّنًا بدون ضغط ومحاذى على 4 بايت — إلزامي
 *     لأي تطبيق targetSdk 30 فأعلى.
 *  3. لازم يكون موقّعًا بـ APK Signature Scheme v2 على الأقل — إلزامي لأي
 *     تطبيق targetSdk 30 فأعلى.
 *
 * التشغيل: npm run verify:apk
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const apkPath = process.argv[2] ?? "public/downloads/Tafriz.apk";
const APK_SIG_BLOCK_MAGIC = "APK Sig Block 42";

/** يقرأ فهرس الـ zip المركزي بدون أي حزمة خارجية. */
function readCentralDirectory(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ليس ملف zip/APK صالحًا: لم يُعثر على نهاية الفهرس");

  const centralDirOffset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  let p = centralDirOffset;
  while (p < buf.length && buf.readUInt32LE(p) === 0x02014b50) {
    const compressionMethod = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    entries.push({
      name: buf.toString("utf8", p + 46, p + 46 + nameLength),
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return { entries, centralDirOffset };
}

/** إزاحة بداية بيانات الملف الفعلية بعد ترويسته المحلية. */
function dataOffset(buf, entry) {
  const nameLength = buf.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buf.readUInt16LE(entry.localHeaderOffset + 28);
  return entry.localHeaderOffset + 30 + nameLength + extraLength;
}

function readEntry(buf, entry) {
  const start = dataOffset(buf, entry);
  const raw = buf.subarray(start, start + entry.compressedSize);
  return entry.compressionMethod === 0 ? raw : inflateRawSync(raw);
}

/**
 * يستخرج android:versionCode من AndroidManifest.xml المُصرَّف (AXML).
 * نقرأ مجمع النصوص ثم أول عنصر <manifest> ونأخذ قيمة السمة الصحيحة.
 */
function readVersionCode(axml) {
  const stringCount = axml.readUInt32LE(16);
  const flags = axml.readUInt32LE(24);
  const stringsStart = axml.readUInt32LE(28);
  const isUtf8 = (flags & (1 << 8)) !== 0;
  const strings = [];
  for (let i = 0; i < stringCount; i++) {
    let p = 8 + stringsStart + axml.readUInt32LE(36 + i * 4);
    if (isUtf8) {
      let charLen = axml[p++];
      if (charLen & 0x80) charLen = ((charLen & 0x7f) << 8) | axml[p++];
      let byteLen = axml[p++];
      if (byteLen & 0x80) byteLen = ((byteLen & 0x7f) << 8) | axml[p++];
      strings.push(axml.toString("utf8", p, p + byteLen));
    } else {
      let len = axml.readUInt16LE(p);
      p += 2;
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | axml.readUInt16LE(p);
        p += 2;
      }
      strings.push(axml.toString("utf16le", p, p + len * 2));
    }
  }

  let pos = 8 + axml.readUInt32LE(12);
  while (pos < axml.length - 8) {
    const chunkType = axml.readUInt16LE(pos);
    const chunkSize = axml.readUInt32LE(pos + 4);
    if (chunkSize === 0) break;
    if (chunkType === 0x0102 && strings[axml.readInt32LE(pos + 20)] === "manifest") {
      const attrStart = axml.readUInt16LE(pos + 24);
      const attrSize = axml.readUInt16LE(pos + 26);
      const attrCount = axml.readUInt16LE(pos + 28);
      for (let i = 0; i < attrCount; i++) {
        const a = pos + 16 + attrStart + i * attrSize;
        if (strings[axml.readInt32LE(a + 4)] === "versionCode") return axml.readUInt32LE(a + 16);
      }
    }
    pos += chunkSize;
  }
  return null;
}

const buf = readFileSync(apkPath);
const { entries, centralDirOffset } = readCentralDirectory(buf);
const failures = [];
const notes = [];

const backslashed = entries.filter((e) => e.name.includes("\\"));
if (backslashed.length > 0) {
  failures.push(
    `${backslashed.length} ملفًا داخل الحزمة يستخدم "\\" بدل "/" ` +
      `(مثال: ${backslashed[0].name}) — أندرويد لن يجد ملفات res/ ويرفض التثبيت`
  );
}

const arsc = entries.find((e) => e.name === "resources.arsc");
if (!arsc) {
  failures.push("resources.arsc مفقود من الحزمة");
} else {
  if (arsc.compressionMethod !== 0) {
    failures.push("resources.arsc مضغوط — targetSdk 30+ يرفض تثبيت حزمة كذا");
  }
  const offset = dataOffset(buf, arsc);
  if (offset % 4 !== 0) {
    failures.push(`resources.arsc غير محاذى على 4 بايت (إزاحته ${offset}) — شغّل zipalign`);
  }
}

const magic = buf.toString("latin1", centralDirOffset - 16, centralDirOffset);
if (magic !== APK_SIG_BLOCK_MAGIC) {
  failures.push(
    "الحزمة موقّعة بتوقيع v1 فقط (JAR) — targetSdk 30+ يتطلب APK Signature Scheme v2 فأعلى، " +
      "وهذا هو سبب رسالة «لم يتم تثبيت التطبيق»"
  );
}

const manifestEntry = entries.find((e) => e.name === "AndroidManifest.xml");
if (!manifestEntry) {
  failures.push("AndroidManifest.xml مفقود من الحزمة");
} else {
  const versionCode = readVersionCode(readEntry(buf, manifestEntry));
  if (versionCode === null) {
    notes.push("تعذّر قراءة versionCode من AndroidManifest.xml");
  } else {
    notes.push(`versionCode = ${versionCode}`);
  }
}

notes.push(`عدد الملفات = ${entries.length}`, `الحجم = ${(buf.length / 1024).toFixed(0)} KB`);

console.log(`فحص ${apkPath}`);
for (const note of notes) console.log(`  - ${note}`);

if (failures.length > 0) {
  console.error("\nفشل الفحص:");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error("\nراجع docs/APK-RELEASE.md قبل رفع الحزمة.");
  process.exit(1);
}

console.log("\n✓ الحزمة سليمة وقابلة للتثبيت على أندرويد 11 فأحدث.");

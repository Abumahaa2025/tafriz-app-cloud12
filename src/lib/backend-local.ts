import { loadLocal, saveLocal } from "./storage";
import {
  ActivationCode,
  AppUser,
  Backend,
  BackendError,
  BroadcastItem,
  ErrorReportItem,
  FeedbackItem,
  UploadedSheetEntry,
  UploadSearchHit,
  SortHistoryEntry,
  SortHistorySearchHit,
} from "./backend-types";
import { OWNER_IDENTIFIER } from "./owner-config";
import {
  createSignedActivationCode,
  normalizeActivationCodeInput,
  verifySignedActivationCode,
} from "./activation-code";

// ملاحظة أمان: كلمة المرور هنا تُخزَّن كنص عادي محليًا على جهازك فقط، لأن
// هذا الوضع "محلي للتجربة" وليس متصلًا بالإنترنت. بمجرد ما تضيف مفاتيح
// Supabase (راجع README) يتحول التطبيق تلقائيًا لتخزين حقيقي على خادم مشترك.
interface LocalUserRecord extends AppUser {
  password: string;
}

const USERS_KEY = "users";
const SESSION_KEY = "session_user_id";
const FEEDBACK_KEY = "feedback";
const BROADCASTS_KEY = "broadcasts";
const ERRORS_KEY = "error_reports";
const ACTIVATION_CODES_KEY = "activation_codes";
const REDEEMED_CODES_KEY = "redeemed_activation_codes";
const UPLOADS_KEY = "uploaded_sheets";
const SORT_HISTORY_KEY = "sort_history";
const MAX_UPLOAD_ENTRIES = 15;
const MAX_ROWS_PER_UPLOAD = 3000; // حد أمان لتجنّب تجاوز سعة localStorage مع ملفات ضخمة
const MAX_HISTORY_ENTRIES = 30;

function readUsers(): LocalUserRecord[] {
  return loadLocal<LocalUserRecord[]>(USERS_KEY, []);
}
function writeUsers(users: LocalUserRecord[]) {
  saveLocal(USERS_KEY, users);
}
function strip(u: LocalUserRecord): AppUser {
  const { password: _password, ...rest } = u;
  return rest;
}

export const localBackend: Backend = {
  name: "local",

  async signUp(identifierType, identifier, password, profile) {
    const users = readUsers();
    if (users.some((u) => u.identifierType === identifierType && u.identifier === identifier)) {
      throw new BackendError("unknown", "هذا الحساب موجود بالفعل، جرّب تسجيل الدخول");
    }
    // لو حدّد المطوّر OWNER_IDENTIFIER بملف owner-config.ts، المالك الوحيد
    // الممكن هو صاحب هذا البريد/الرقم بالضبط — أي أحد غيره يدخل "قيد
    // المراجعة" دائمًا مهما كان ترتيب تسجيله. لو الحقل فاضي (وضع التجربة
    // المحلية)، أول شخص يسجّل يصير المالك كما كان سابقًا.
    const isDesignatedOwner = OWNER_IDENTIFIER
      ? identifier === OWNER_IDENTIFIER
      : users.length === 0;
    const user: LocalUserRecord = {
      id: crypto.randomUUID(),
      identifierType,
      identifier,
      password,
      status: isDesignatedOwner ? "approved" : "pending",
      isOwner: isDesignatedOwner,
      createdAt: new Date().toISOString(),
      packageName: isDesignatedOwner ? "مالك التطبيق" : null,
      packageExpiresAt: null,
      lastSeenAt: new Date().toISOString(),
      fullName: profile?.fullName?.trim() || null,
      city: profile?.city?.trim() || null,
    };
    writeUsers([...users, user]);
    saveLocal(SESSION_KEY, user.id);
    return strip(user);
  },


  async signIn(identifierType, identifier, password) {
    const users = readUsers();
    const user = users.find((u) => u.identifierType === identifierType && u.identifier === identifier);
    if (!user) throw new BackendError("not_found", "لا يوجد حساب بهذه البيانات");
    if (user.password !== password) throw new BackendError("bad_password", "كلمة المرور غير صحيحة");
    saveLocal(SESSION_KEY, user.id);
    writeUsers(users.map((u) => (u.id === user.id ? { ...u, lastSeenAt: new Date().toISOString() } : u)));
    return strip({ ...user, lastSeenAt: new Date().toISOString() });
  },

  async signOut() {
    saveLocal(SESSION_KEY, null);
  },

  async getCurrentUser() {
    const id = loadLocal<string | null>(SESSION_KEY, null);
    if (!id) return null;
    const user = readUsers().find((u) => u.id === id);
    return user ? strip(user) : null;
  },

  async changePassword(newPassword) {
    const id = loadLocal<string | null>(SESSION_KEY, null);
    if (!id) throw new BackendError("not_allowed", "سجّل الدخول أولًا");
    const users = readUsers();
    writeUsers(users.map((u) => (u.id === id ? { ...u, password: newPassword } : u)));
  },

  async listUsers() {
    return readUsers().map(strip);
  },

  async approveUser(id, packageName, days) {
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    const users = readUsers();
    writeUsers(
      users.map((u) =>
        u.id === id
          ? { ...u, status: "approved", packageName, packageExpiresAt: expires.toISOString() }
          : u
      )
    );
  },

  async revokeUser(id) {
    const users = readUsers();
    writeUsers(users.map((u) => (u.id === id ? { ...u, status: "revoked" } : u)));
  },

  async submitFeedback(identifier, message) {
    const items = loadLocal<FeedbackItem[]>(FEEDBACK_KEY, []);
    items.push({
      id: crypto.randomUUID(),
      identifier,
      message,
      createdAt: new Date().toISOString(),
      read: false,
    });
    saveLocal(FEEDBACK_KEY, items);
  },

  async listFeedback() {
    return loadLocal<FeedbackItem[]>(FEEDBACK_KEY, []).reverse();
  },

  async markFeedbackRead(id) {
    const items = loadLocal<FeedbackItem[]>(FEEDBACK_KEY, []);
    saveLocal(
      FEEDBACK_KEY,
      items.map((i) => (i.id === id ? { ...i, read: true } : i))
    );
  },

  async sendBroadcast(message) {
    const items = loadLocal<BroadcastItem[]>(BROADCASTS_KEY, []);
    items.push({ id: crypto.randomUUID(), message, createdAt: new Date().toISOString() });
    saveLocal(BROADCASTS_KEY, items);
  },

  async listBroadcasts() {
    return loadLocal<BroadcastItem[]>(BROADCASTS_KEY, []).reverse();
  },

  async logError(message, context) {
    const items = loadLocal<ErrorReportItem[]>(ERRORS_KEY, []);
    items.push({
      id: crypto.randomUUID(),
      message,
      context: context ?? null,
      createdAt: new Date().toISOString(),
      resolved: false,
    });
    saveLocal(ERRORS_KEY, items);
  },

  async listErrors() {
    return loadLocal<ErrorReportItem[]>(ERRORS_KEY, []).reverse();
  },

  async resolveError(id) {
    const items = loadLocal<ErrorReportItem[]>(ERRORS_KEY, []);
    saveLocal(
      ERRORS_KEY,
      items.map((i) => (i.id === id ? { ...i, resolved: true } : i))
    );
  },

  async touchLastSeen() {
    const id = loadLocal<string | null>(SESSION_KEY, null);
    if (!id) return;
    const users = readUsers();
    writeUsers(
      users.map((u) => (u.id === id ? { ...u, lastSeenAt: new Date().toISOString() } : u))
    );
  },

  async generateActivationCode() {
    // رمز موقّع يتحقق منه جهاز المستخدم بدون مشاركة localStorage بين الجهازين
    const codes = loadLocal<ActivationCode[]>(ACTIVATION_CODES_KEY, []);
    const code = createSignedActivationCode();
    codes.push({ code, createdAt: new Date().toISOString(), usedBy: null });
    saveLocal(ACTIVATION_CODES_KEY, codes);
    return code;
  },

  async listActivationCodes() {
    return loadLocal<ActivationCode[]>(ACTIVATION_CODES_KEY, []).reverse();
  },

  async redeemActivationCode(code) {
    const cleanCode = normalizeActivationCodeInput(code);
    const sessionId = loadLocal<string | null>(SESSION_KEY, null);
    if (!sessionId) return false;

    const redeemed = loadLocal<string[]>(REDEEMED_CODES_KEY, []);
    if (redeemed.includes(cleanCode)) return false;

    // 1) الرموز الموقّعة الجديدة تعمل عبر الأجهزة
    // 2) الرموز القديمة المخزّنة على نفس الجهاز تبقى مدعومة للتوافق
    const localCodes = loadLocal<ActivationCode[]>(ACTIVATION_CODES_KEY, []);
    const localMatch = localCodes.find((c) => c.code === cleanCode && !c.usedBy);
    const signedOk = verifySignedActivationCode(cleanCode);
    if (!localMatch && !signedOk) return false;

    const users = readUsers();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    writeUsers(
      users.map((u) =>
        u.id === sessionId
          ? { ...u, status: "approved", packageName: "مفعّل برمز تفعيل", packageExpiresAt: expires.toISOString() }
          : u
      )
    );

    if (localMatch) {
      saveLocal(
        ACTIVATION_CODES_KEY,
        localCodes.map((c) => (c.code === cleanCode ? { ...c, usedBy: sessionId } : c))
      );
    }
    saveLocal(REDEEMED_CODES_KEY, [...redeemed, cleanCode]);
    return true;
  },

  async saveUpload(fileName, headers, rows) {
    const list = loadLocal<UploadedSheetEntry[]>(UPLOADS_KEY, []);
    const entry: UploadedSheetEntry = {
      id: crypto.randomUUID(),
      fileName,
      uploadedAt: new Date().toISOString(),
      headers,
      rows: rows.slice(0, MAX_ROWS_PER_UPLOAD),
      truncated: rows.length > MAX_ROWS_PER_UPLOAD,
      totalRowsInFile: rows.length,
    };
    saveLocal(UPLOADS_KEY, [entry, ...list].slice(0, MAX_UPLOAD_ENTRIES));
  },

  async listUploads() {
    return loadLocal<UploadedSheetEntry[]>(UPLOADS_KEY, []);
  },

  async searchUploads(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: UploadSearchHit[] = [];
    for (const entry of loadLocal<UploadedSheetEntry[]>(UPLOADS_KEY, [])) {
      for (const row of entry.rows) {
        if (Object.values(row).some((v) => String(v).toLowerCase().includes(q))) {
          hits.push({ entry, row });
        }
      }
    }
    return hits;
  },

  async saveSortHistoryEntry(entry) {
    const history = loadLocal<SortHistoryEntry[]>(SORT_HISTORY_KEY, []);
    const full: SortHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    saveLocal(SORT_HISTORY_KEY, [full, ...history].slice(0, MAX_HISTORY_ENTRIES));
  },

  async listSortHistory() {
    return loadLocal<SortHistoryEntry[]>(SORT_HISTORY_KEY, []);
  },

  async searchSortHistory(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: SortHistorySearchHit[] = [];
    for (const entry of loadLocal<SortHistoryEntry[]>(SORT_HISTORY_KEY, [])) {
      for (const row of entry.matchedRows) {
        if (row.plate.toLowerCase().includes(q) || row.street.toLowerCase().includes(q)) {
          hits.push({ entry, row });
        }
      }
    }
    return hits;
  },
};


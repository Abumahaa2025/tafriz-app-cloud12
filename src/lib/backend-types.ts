export type IdentifierType = "email" | "phone";
export type UserStatus = "pending" | "approved" | "revoked";

export interface AppUser {
  id: string;
  identifierType: IdentifierType;
  identifier: string;
  status: UserStatus;
  isOwner: boolean;
  createdAt: string;
  packageName: string | null;
  packageExpiresAt: string | null;
  lastSeenAt: string | null;
  fullName: string | null;
  city: string | null;
}

export interface ActivationCode {
  code: string;
  createdAt: string;
  usedBy: string | null; // معرّف المستخدم اللي فعّل بالكود، أو null لو لسه ما استُخدم
}

export interface UploadedSheetEntry {
  id: string;
  fileName: string;
  uploadedAt: string;
  headers: string[];
  rows: Record<string, string | number>[];
  truncated: boolean;
  totalRowsInFile: number;
}

export interface UploadSearchHit {
  entry: UploadedSheetEntry;
  row: Record<string, string | number>;
}

export interface SortResultRow {
  street: string;
  plate: string;
}

export interface SortHistoryEntry {
  id: string;
  createdAt: string;
  dataFileName: string;
  referralFileName: string;
  unsortedCount: number;
  distinctMatchedPlates: number;
  matchedRows: SortResultRow[];
}

export interface SortHistorySearchHit {
  entry: SortHistoryEntry;
  row: SortResultRow;
}

export interface FeedbackItem {
  id: string;
  identifier: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface BroadcastItem {
  id: string;
  message: string;
  createdAt: string;
}

export interface ErrorReportItem {
  id: string;
  message: string;
  context: string | null;
  createdAt: string;
  resolved: boolean;
}

export class BackendError extends Error {
  code: "not_found" | "bad_password" | "not_allowed" | "unknown";
  constructor(code: BackendError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export interface Backend {
  /** اسم مصدر البيانات الحالي — يُعرض للمستخدم في صفحة الحساب للشفافية */
  name: "local" | "supabase";
  signUp(
    type: IdentifierType,
    identifier: string,
    password: string,
    profile?: { fullName?: string; city?: string }
  ): Promise<AppUser>;
  signIn(type: IdentifierType, identifier: string, password: string): Promise<AppUser>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<AppUser | null>;
  changePassword(newPassword: string): Promise<void>;
  listUsers(): Promise<AppUser[]>;
  approveUser(id: string, packageName: string, days: number): Promise<void>;
  revokeUser(id: string): Promise<void>;
  submitFeedback(identifier: string, message: string): Promise<void>;
  listFeedback(): Promise<FeedbackItem[]>;
  markFeedbackRead(id: string): Promise<void>;
  sendBroadcast(message: string): Promise<void>;
  listBroadcasts(): Promise<BroadcastItem[]>;
  logError(message: string, context?: string): Promise<void>;
  listErrors(): Promise<ErrorReportItem[]>;
  resolveError(id: string): Promise<void>;
  /** يستدعيها العميل دوريًا أثناء استخدام التطبيق ليعرف المالك من نشِط الآن. */
  touchLastSeen(): Promise<void>;
  /** يولّد المالك رمز تفعيل يقدر يعطيه لمستخدم مباشرة (بدون انتظار طلب واتساب) */
  generateActivationCode(): Promise<string>;
  listActivationCodes(): Promise<ActivationCode[]>;
  /** المستخدم يدخل الرمز فيُفعَّل حسابه فورًا لو الرمز صحيح وما استُخدم قبل */
  redeemActivationCode(code: string): Promise<boolean>;

  /** يحفظ كل صفوف الملف فور رفعه — هذه هي "قاعدة البيانات" الفعلية */
  saveUpload(fileName: string, headers: string[], rows: Record<string, string | number>[]): Promise<void>;
  listUploads(): Promise<UploadedSheetEntry[]>;
  searchUploads(query: string): Promise<UploadSearchHit[]>;

  saveSortHistoryEntry(entry: Omit<SortHistoryEntry, "id" | "createdAt">): Promise<void>;
  listSortHistory(): Promise<SortHistoryEntry[]>;
  searchSortHistory(query: string): Promise<SortHistorySearchHit[]>;
}

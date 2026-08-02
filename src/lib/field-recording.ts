import { loadLocal, saveLocal } from "./storage";

/** إعدادات شاشة التسجيل الميداني كما في التطبيق الأصلي */
export interface FieldRecordingProfile {
  registrarName: string;
  neighborhood: string;
  street: string;
  gpsMode: "auto" | "manual";
  intervalSec: 5 | 10 | 15 | 30;
}

export interface GpsPoint {
  lat: number;
  lng: number;
  at: string;
}

const PROFILE_KEY = "field_recording_profile";

export const DEFAULT_FIELD_PROFILE: FieldRecordingProfile = {
  registrarName: "",
  neighborhood: "",
  street: "",
  gpsMode: "auto",
  intervalSec: 5,
};

export function loadFieldProfile(): FieldRecordingProfile {
  return { ...DEFAULT_FIELD_PROFILE, ...loadLocal<Partial<FieldRecordingProfile>>(PROFILE_KEY, {}) };
}

export function saveFieldProfile(profile: FieldRecordingProfile) {
  saveLocal(PROFILE_KEY, profile);
}

export function profileReady(p: FieldRecordingProfile): boolean {
  return Boolean(p.registrarName.trim() && p.neighborhood.trim() && p.street.trim());
}

/** الحد الأقصى لتسجيل واحد كما في التطبيق الأصلي */
export const MAX_RECORD_MS = 5 * 60 * 1000;

export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

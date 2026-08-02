import { idbGet, idbSet } from "./idb";
import type { GpsPoint } from "./field-recording";

export interface FieldDumpRow {
  id: string;
  plate: string;
  notes: string;
  carType: string;
  registrarName: string;
  street: string;
  neighborhood: string;
  gps: string;
  recordedAt: string;
}

const DUMP_KEY = "field_dump_table_v1";

export async function loadDumpRows(): Promise<FieldDumpRow[]> {
  const rows = await idbGet<FieldDumpRow[]>(DUMP_KEY);
  return Array.isArray(rows) ? rows : [];
}

export async function saveDumpRows(rows: FieldDumpRow[]): Promise<void> {
  await idbSet(DUMP_KEY, rows);
}

/** تفريغ جلسة تسجيل: نقطة GPS واحدة = صف في جدول البيانات */
export function dumpSessionToRows(input: {
  registrarName: string;
  neighborhood: string;
  street: string;
  points: GpsPoint[];
  recordedAt?: string;
}): FieldDumpRow[] {
  const at = input.recordedAt ?? new Date().toISOString();
  const points = input.points.length
    ? input.points
    : [{ lat: 0, lng: 0, at }];

  return points.map((p, i) => ({
    id: crypto.randomUUID(),
    plate: "",
    notes: points.length > 1 ? `نقطة ${i + 1}` : "",
    carType: "",
    registrarName: input.registrarName,
    street: input.street,
    neighborhood: input.neighborhood,
    gps:
      p.lat === 0 && p.lng === 0
        ? "-"
        : `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`,
    recordedAt: at.slice(0, 10),
  }));
}

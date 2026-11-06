import { AttendanceRecord } from '../types/attendance';

const STORAGE_KEY = 'flutter_attendance_sqlite_cache_v1';
const SETTINGS_KEY = 'flutter_attendance_settings_v1';
const PROFILE_KEY = 'flutter_attendance_teacher_v1';

export const SQLITE_SCHEMA_DDL = `-- SQLite Database Schema for Flutter Android (sqflite)
CREATE TABLE IF NOT EXISTS attendance_cache (
    id TEXT PRIMARY KEY,
    jshr TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('Keldi', 'Ketdi')),
    timestamp TEXT NOT NULL,
    distance_meters REAL NOT NULL,
    within_geofence INTEGER NOT NULL DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    synced_at TEXT,
    error_message TEXT,
    device_info TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_status ON attendance_cache(sync_status);
CREATE INDEX IF NOT EXISTS idx_jshr ON attendance_cache(jshr);
`;

export class LocalSqliteStore {
  private static loadRecords(): AttendanceRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        // Seed default realistic records for demonstrative testing
        const initial: AttendanceRecord[] = [
          {
            id: 'sqlite-rec-1',
            jshr: '32001951234567',
            latitude: 38.971250,
            longitude: 66.707510,
            action_type: 'Keldi',
            timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
            distance_meters: 6.8,
            within_geofence: true,
            sync_status: 'synced',
            synced_at: new Date(Date.now() - 3600000 * 3).toISOString(),
            device_info: 'Flutter Android (Samsung Galaxy A54)'
          },
          {
            id: 'sqlite-rec-2',
            jshr: '32001951234567',
            latitude: 38.971310,
            longitude: 66.707420,
            action_type: 'Ketdi',
            timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
            distance_meters: 13.2,
            within_geofence: true,
            sync_status: 'synced',
            synced_at: new Date(Date.now() - 3600000 * 1).toISOString(),
            device_info: 'Flutter Android (Samsung Galaxy A54)'
          }
        ];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load SQLite cache from localStorage:', e);
      return [];
    }
  }

  private static saveRecords(records: AttendanceRecord[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      window.dispatchEvent(new Event('sqlite_cache_updated'));
    } catch (e) {
      console.error('Failed to persist SQLite records:', e);
    }
  }

  static getAll(): AttendanceRecord[] {
    return this.loadRecords();
  }

  static getPending(): AttendanceRecord[] {
    return this.loadRecords().filter((r) => r.sync_status === 'pending');
  }

  static insert(record: AttendanceRecord): void {
    const list = this.loadRecords();
    // Prepend new record
    list.unshift(record);
    this.saveRecords(list);
  }

  static markSynced(id: string, syncedAt: string = new Date().toISOString()): void {
    const list = this.loadRecords();
    const target = list.find((r) => r.id === id);
    if (target) {
      target.sync_status = 'synced';
      target.synced_at = syncedAt;
      target.error_message = undefined;
      this.saveRecords(list);
    }
  }

  static markFailed(id: string, errorMessage: string): void {
    const list = this.loadRecords();
    const target = list.find((r) => r.id === id);
    if (target) {
      target.sync_status = 'failed';
      target.error_message = errorMessage;
      this.saveRecords(list);
    }
  }

  static delete(id: string): void {
    const list = this.loadRecords().filter((r) => r.id !== id);
    this.saveRecords(list);
  }

  static clear(): void {
    this.saveRecords([]);
  }

  static resetToDefaults(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.loadRecords();
  }
}

// User settings & profile persistence
export function getStoredTeacher(): { jshr: string; fullName: string } {
  try {
    const val = localStorage.getItem(PROFILE_KEY);
    if (val) return JSON.parse(val);
  } catch {}
  return { jshr: '32001951234567', fullName: "Sobirov Jamshid Rustamovich" };
}

export function saveStoredTeacher(profile: { jshr: string; fullName: string }) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getStoredServerUrl(): string {
  try {
    const val = localStorage.getItem(SETTINGS_KEY);
    if (val) return val;
  } catch {}
  // Default to the built-in endpoint or standard Render template
  return '/check-attendance';
}

export function saveStoredServerUrl(url: string) {
  localStorage.setItem(SETTINGS_KEY, url);
}

export const COLLEGE_CONFIG = {
  name: "Qarshi Davlat Texnikum / Kollej",
  latitude: 38.971199,
  longitude: 66.707470,
  radiusMeters: 500,
  city: "Qarshi, Qashqadaryo",
};

export type ActionType = 'Keldi' | 'Ketdi';

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface AttendanceRecord {
  id: string;
  jshr: string;
  latitude: number;
  longitude: number;
  action_type: ActionType;
  timestamp: string;
  distance_meters: number;
  within_geofence: boolean;
  sync_status: SyncStatus;
  synced_at?: string;
  error_message?: string;
  device_info: string;
}

export interface GeofenceState {
  currentLat: number;
  currentLng: number;
  distanceMeters: number;
  isWithin: boolean;
  accuracyMeters: number;
  isUsingMock: boolean;
  lastUpdated: string;
}

export interface TeacherProfile {
  jshr: string;
  fullName: string;
  subject: string;
  department: string;
  phone?: string;
}

export interface ServerConfig {
  backendType: 'local' | 'render' | 'custom';
  renderUrl: string; // e.g., https://my-backend.onrender.com/check-attendance
  useProxy: boolean;
  timeoutMs: number;
}

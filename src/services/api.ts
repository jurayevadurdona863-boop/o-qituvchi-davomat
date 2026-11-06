import { AttendanceRecord, ActionType } from '../types/attendance';
import { LocalSqliteStore } from './storage';

export interface SendAttendanceResult {
  success: boolean;
  status: 'synced_online' | 'cached_offline' | 'error';
  message: string;
  record: AttendanceRecord;
  serverResponse?: any;
}

/**
 * Sends attendance record to Render backend API endpoint /check-attendance.
 * If network is unavailable or request fails, seamlessly saves to local SQLite cache.
 */
export async function submitAttendance({
  jshr,
  latitude,
  longitude,
  action_type,
  distance_meters,
  within_geofence,
  serverUrl,
  isOfflineMode,
  deviceInfo = 'Flutter Android (Device SDK 34)'
}: {
  jshr: string;
  latitude: number;
  longitude: number;
  action_type: ActionType;
  distance_meters: number;
  within_geofence: boolean;
  serverUrl: string;
  isOfflineMode: boolean;
  deviceInfo?: string;
}): Promise<SendAttendanceResult> {
  const timestamp = new Date().toISOString();
  const recordId = 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  const newRecord: AttendanceRecord = {
    id: recordId,
    jshr: jshr.trim(),
    latitude,
    longitude,
    action_type,
    timestamp,
    distance_meters,
    within_geofence,
    sync_status: 'pending',
    device_info: deviceInfo
  };

  // 1. If currently in offline mode (either simulated or no browser connectivity)
  if (isOfflineMode || !navigator.onLine) {
    newRecord.sync_status = 'pending';
    newRecord.error_message = 'Internet aloqasi yo\'q. Lokal SQLite keshida saqlandi.';
    LocalSqliteStore.insert(newRecord);

    return {
      success: true,
      status: 'cached_offline',
      message: 'Internet yo\'q! Davomat SQLite lokal keshiga saqlandi va internet paydo bo\'lganda avtomatik yuboriladi.',
      record: newRecord
    };
  }

  // 2. Online: Attempt sending to the server
  try {
    const payload = {
      jshr: newRecord.jshr,
      latitude: newRecord.latitude,
      longitude: newRecord.longitude,
      action_type: newRecord.action_type,
      timestamp: newRecord.timestamp,
      distance_meters: newRecord.distance_meters,
      device_info: newRecord.device_info,
      synced_from_offline: false
    };

    let targetUrl = serverUrl;
    let fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    };

    // If external Render domain (cross-origin), use proxy to avoid CORS block during testing
    if (targetUrl.startsWith('http') && !targetUrl.includes(window.location.host)) {
      targetUrl = '/api/proxy-render-check';
      fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          render_url: serverUrl,
          payload
        })
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    fetchOptions.signal = controller.signal;

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Server xatosi (${response.status}): ${response.statusText}`);
    }

    const json = await response.json();

    // Mark as synced and store into local SQLite cache as history
    newRecord.sync_status = 'synced';
    newRecord.synced_at = new Date().toISOString();
    LocalSqliteStore.insert(newRecord);

    return {
      success: true,
      status: 'synced_online',
      message: json.message || `${action_type} davomati Render serveriga muvaffaqiyatli yuborildi.`,
      record: newRecord,
      serverResponse: json
    };
  } catch (err: any) {
    console.warn('Attendance send failed, falling back to SQLite cache:', err);
    // Offline caching fallback
    newRecord.sync_status = 'pending';
    newRecord.error_message = err.message || 'Tarmoq xatosi';
    LocalSqliteStore.insert(newRecord);

    return {
      success: true,
      status: 'cached_offline',
      message: `Serverga ulanib bo'lmadi (${err.message}). Davomat SQLite keshiga saqlandi.`,
      record: newRecord
    };
  }
}

/**
 * Sync all pending SQLite records with the backend
 */
export async function syncPendingRecords(serverUrl: string): Promise<{
  total: number;
  synced: number;
  failed: number;
}> {
  const pending = LocalSqliteStore.getPending();
  if (pending.length === 0) {
    return { total: 0, synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const record of pending) {
    try {
      const payload = {
        jshr: record.jshr,
        latitude: record.latitude,
        longitude: record.longitude,
        action_type: record.action_type,
        timestamp: record.timestamp,
        distance_meters: record.distance_meters,
        device_info: record.device_info,
        synced_from_offline: true
      };

      let targetUrl = serverUrl;
      let fetchOptions: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      };

      if (targetUrl.startsWith('http') && !targetUrl.includes(window.location.host)) {
        targetUrl = '/api/proxy-render-check';
        fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            render_url: serverUrl,
            payload
          })
        };
      }

      const res = await fetch(targetUrl, fetchOptions);
      if (res.ok) {
        LocalSqliteStore.markSynced(record.id);
        synced++;
      } else {
        LocalSqliteStore.markFailed(record.id, `Server kodi: ${res.status}`);
        failed++;
      }
    } catch (e: any) {
      LocalSqliteStore.markFailed(record.id, e.message || 'Ulanish xatosi');
      failed++;
    }
  }

  return {
    total: pending.length,
    synced,
    failed
  };
}

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// College coordinates: Qarshi, Uzbekistan
const COLLEGE_LAT = 38.971199;
const COLLEGE_LNG = 66.707470;
const GEOFENCE_RADIUS_METERS = 500;

// Haversine formula to calculate distance in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

interface AttendanceRecord {
  id: string;
  jshr: string;
  latitude: number;
  longitude: number;
  action_type: 'Keldi' | 'Ketdi';
  timestamp: string;
  server_timestamp: string;
  distance_meters: number;
  within_geofence: boolean;
  device_info?: string;
  ip?: string;
  synced_from_offline?: boolean;
}

// In-memory attendance store on server
const attendanceLogs: AttendanceRecord[] = [
  {
    id: 'att-sample-1',
    jshr: '32001951234567',
    latitude: 38.971250,
    longitude: 66.707510,
    action_type: 'Keldi',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    server_timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    distance_meters: 6.8,
    within_geofence: true,
    device_info: 'Flutter Android (Samsung Galaxy A54)',
    ip: '127.0.0.1',
    synced_from_offline: false
  }
];

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Primary API endpoint requested by user: /check-attendance
  app.post('/check-attendance', (req: Request, res: Response) => {
    const { jshr, latitude, longitude, action_type, timestamp, device_info, synced_from_offline } = req.body;

    if (!jshr || latitude === undefined || longitude === undefined || !action_type) {
      return res.status(400).json({
        success: false,
        error: 'Kerakli parametrlar yetishmayapti: jshr, latitude, longitude, action_type talab qilinadi.'
      });
    }

    if (action_type !== 'Keldi' && action_type !== 'Ketdi') {
      return res.status(400).json({
        success: false,
        error: "action_type faqat 'Keldi' yoki 'Ketdi' bo'lishi kerak."
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const distance = calculateDistanceMeters(COLLEGE_LAT, COLLEGE_LNG, lat, lng);
    const withinGeofence = distance <= GEOFENCE_RADIUS_METERS;

    const record: AttendanceRecord = {
      id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      jshr: String(jshr).trim(),
      latitude: lat,
      longitude: lng,
      action_type,
      timestamp: timestamp || new Date().toISOString(),
      server_timestamp: new Date().toISOString(),
      distance_meters: distance,
      within_geofence: withinGeofence,
      device_info: device_info || req.headers['user-agent'] || 'Flutter Android Device',
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
      synced_from_offline: !!synced_from_offline
    };

    attendanceLogs.unshift(record);

    // Keep max 200 logs
    if (attendanceLogs.length > 200) {
      attendanceLogs.pop();
    }

    return res.status(200).json({
      success: true,
      status: 'success',
      message: withinGeofence 
        ? `${record.action_type === 'Keldi' ? 'Kelish' : 'Ketish'} muvaffaqiyatli qayd etildi (Kollej hududida, masofa: ${distance}m)`
        : `Diqqat: Davomat qayd etildi, ammo o'qituvchi kollej hududidan tashqarida (masofa: ${distance}m, ruxsat etilgan: ${GEOFENCE_RADIUS_METERS}m)`,
      data: record,
      geofence: {
        college_lat: COLLEGE_LAT,
        college_lng: COLLEGE_LNG,
        allowed_radius_meters: GEOFENCE_RADIUS_METERS,
        calculated_distance_meters: distance,
        is_inside: withinGeofence
      }
    });
  });

  // Proxy endpoint to test remote Render backend URLs safely
  app.post('/api/proxy-render-check', async (req: Request, res: Response) => {
    const { render_url, payload } = req.body;
    if (!render_url) {
      return res.status(400).json({ success: false, error: 'render_url kiritilmagan.' });
    }

    try {
      const response = await fetch(render_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Flutter-Android-Attendance/1.0.0'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let responseJson;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = { raw_response: responseText };
      }

      res.status(response.status).json({
        success: response.ok,
        remote_status: response.status,
        remote_data: responseJson
      });
    } catch (err: any) {
      res.status(502).json({
        success: false,
        error: `Render serverga ulanishda xatolik: ${err.message}`
      });
    }
  });

  // Query server attendance records
  app.get('/api/attendance-history', (req: Request, res: Response) => {
    const jshr = req.query.jshr as string;
    let list = attendanceLogs;
    if (jshr) {
      list = list.filter(item => item.jshr === jshr);
    }
    res.json({
      success: true,
      college: {
        latitude: COLLEGE_LAT,
        longitude: COLLEGE_LNG,
        radius: GEOFENCE_RADIUS_METERS
      },
      count: list.length,
      records: list
    });
  });

  // Clear server history (for testing)
  app.post('/api/attendance-clear', (_req: Request, res: Response) => {
    attendanceLogs.length = 0;
    res.json({ success: true, message: 'Server jurnali tozalandi.' });
  });

  // Server health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'online',
      service: 'O\'qituvchi Davomat API Server',
      college_location: {
        latitude: COLLEGE_LAT,
        longitude: COLLEGE_LNG,
        radius: GEOFENCE_RADIUS_METERS
      },
      timestamp: new Date().toISOString()
    });
  });

  // Setup Vite dev server or static serve
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

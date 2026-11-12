import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// College/Texnikum coordinates: Yakkabog', Qashqadaryo, Uzbekistan
const COLLEGE_LAT = 38.971199;
const COLLEGE_LNG = 66.707470;
const GEOFENCE_RADIUS_METERS = 500;

// Yakkabog' tuman 2-son texnikumi xodimlarining rasmiy bazasi (teachers.xlsx dan olindi)
interface Teacher {
  id: number;
  fio: string;
  lavozim: string;
  telefon: string;
  jshr: string;
}

const TEACHERS_DATABASE: Teacher[] = [
  { id: 1, fio: 'Xujaniyozov Bekzod Sunnatovich', lavozim: 'Direktor', telefon: '98 475-12-12', jshr: '30306812710045' },
  { id: 2, fio: 'Sultonov Abror Tursunpo\'lat o\'g\'li', lavozim: 'O\'IBDO\'', telefon: '95 074-12-12', jshr: '30812917530017' },
  { id: 3, fio: 'Husanov Zohid Pardayevich', lavozim: 'Yo\'IBDO\'', telefon: '99 029-43-34', jshr: '32406822/10049' },
  { id: 4, fio: 'Qulmamatov Azamat Xolmamatovich', lavozim: 'ICHIBDO\'', telefon: '97-588-27-72', jshr: '31712725730022' },
  { id: 5, fio: 'Ismatov Xudoyqul Dilshod o\'g\'li', lavozim: 'Ta\'lim sifatini nazorat qilish bosh mutaxassisi', telefon: '77 731-13 19', jshr: '40102985730037' },
  { id: 6, fio: 'Azimov Tohir Eshpo\'latovich', lavozim: 'Bosh hisobchi', telefon: '97 385-63 73', jshr: '31009732710023' },
  { id: 7, fio: 'Xo\'janov Chori Karimovich', lavozim: 'Xo\'jalik mudiri', telefon: '97-388 36-89', jshr: '31304605730039' },
  { id: 8, fio: 'Ismatova Umida Dilshod qizi', lavozim: 'Kadrlar bo\'limi', telefon: '97 633-03-21', jshr: '42308952710050' },
  { id: 9, fio: 'Moyliyev Muxtor Xushnurodovich', lavozim: 'Usta', telefon: '91-642-05-71', jshr: '32501/15730026' },
  { id: 10, fio: 'Boysunov Chimnigul Xayrullayevna', lavozim: 'Bo\'lim boshlig\'i', telefon: '90-667 26-12', jshr: '41401815730020' },
  { id: 11, fio: 'Ravshanov Otabek Abdurashidovich', lavozim: 'CHYOT rahbari', telefon: '97 412-76-22', jshr: '33112915590010' },
  { id: 12, fio: 'Jonqobilova Dilnoza Hamidovna', lavozim: 'Tarmoq administratori', telefon: '90 615-24-64', jshr: '41902852710117' },
  { id: 13, fio: 'Norchayeva Ro\'zigul G\'ayratovna', lavozim: 'Yordamchi hisobchi', telefon: '97-336-05-13', jshr: '41305862710117' },
  { id: 14, fio: 'Arziyeva Dilorom Raxmonovna', lavozim: 'Inspektor', telefon: '90-671-44-71', jshr: '40805/12710012' },
  { id: 15, fio: 'Maxmatqulova Gulhayo To\'ra qizi', lavozim: 'Kotiba', telefon: '97 587-91-09', jshr: '40910922530023' },
  { id: 16, fio: 'Dilova Marhamat Ravshanovna', lavozim: 'Yotoqxona navbatchisi', telefon: '90-911-82-40', jshr: '40903732560045' },
  { id: 17, fio: 'Muhammadiyeva Muqaddas Maxmadaliyevna', lavozim: 'Yotoqxona navbatchisi', telefon: '90-678-30-01', jshr: '41203745730024' },
  { id: 18, fio: 'Primova Yulduz Mixliyevna', lavozim: 'Yotoqxona navbatchisi', telefon: '90 334 46-58', jshr: '40506812530022' },
  { id: 19, fio: 'Ismoilov Sarvarjon Quchqarovich', lavozim: 'Bosh usta', telefon: '91-637-09-79', jshr: '31405725730014' }
];

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
  fio?: string;
  lavozim?: string;
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

const attendanceLogs: AttendanceRecord[] = [];

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

  // Get teachers list endpoint
  app.get('/api/teachers', (_req: Request, res: Response) => {
    res.json({
      success: true,
      count: TEACHERS_DATABASE.length,
      teachers: TEACHERS_DATABASE
    });
  });

  // Primary API endpoint for attendance: /check-attendance
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

    const cleanJshr = String(jshr).trim();
    const teacher = TEACHERS_DATABASE.find(t => t.jshr === cleanJshr);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: `Bunday JSHR (${cleanJshr}) egasi texnikum xodimlar ro'yxatida topilmadi!`
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const distance = calculateDistanceMeters(COLLEGE_LAT, COLLEGE_LNG, lat, lng);
    const withinGeofence = distance <= GEOFENCE_RADIUS_METERS;

    const record: AttendanceRecord = {
      id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      jshr: cleanJshr,
      fio: teacher.fio,
      lavozim: teacher.lavozim,
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

    if (attendanceLogs.length > 200) {
      attendanceLogs.pop();
    }

    return res.status(200).json({
      success: true,
      status: 'success',
      message: withinGeofence 
        ? `${teacher.fio} (${teacher.lavozim}): ${record.action_type === 'Keldi' ? 'Kelish' : 'Ketish'} muvaffaqiyatli qayd etildi (Masofa: ${distance}m)`
        : `Diqqat: ${teacher.fio} davomat qildi, ammo kollej hududidan tashqarida (masofa: ${distance}m)`,
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

  // Query attendance history
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

  // Export endpoint
  app.get('/api/export', (_req: Request, res: Response) => {
    if (attendanceLogs.length === 0) {
      return res.status(404).json({ success: false, error: 'Yuklab olish uchun ma\'lumotlar mavjud emas!' });
    }

    let csv = '\uFEFFID,JSHR,FIO,Lavozim,Harakat,Sana/Vaqt,Masofa (m),Hududda,IP\n';
    attendanceLogs.forEach(item => {
      csv += `"${item.id}","${item.jshr}","${item.fio || ''}","${item.lavozim || ''}","${item.action_type}","${item.timestamp}","${item.distance_meters}","${item.within_geofence ? 'Ha' : 'Yo\'q'}","${item.ip || ''}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=texnikum_davomat_hisobot.csv');
    return res.status(200).send(csv);
  });

  // Server health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'online',
      service: 'Yakkabog\' 2-son Texnikum Davomat API Server',
      teachers_loaded: TEACHERS_DATABASE.length,
      college_location: {
        latitude: COLLEGE_LAT,
        longitude: COLLEGE_LNG,
        radius: GEOFENCE_RADIUS_METERS
      },
      timestamp: new Date().toISOString()
    });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: type => true },
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

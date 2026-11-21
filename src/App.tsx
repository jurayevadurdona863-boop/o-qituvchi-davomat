import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera';
import { LocalNotifications } from '@capacitor/local-notifications';

// Fonda (ekran o'chiq, ilova yopiq) ishlaydigan GPS plagini
const BackgroundGeolocation = registerPlugin<any>('BackgroundGeolocation');

// ====== SOZLAMALAR (maxfiy qiymatlar Codemagic/Render environment variables orqali) ======
const env = ((import.meta as any).env || {}) as Record<string, string>;
const BOT_TOKEN = env.VITE_TELEGRAM_BOT_TOKEN || '';
const CHAT_IDS: string[] = (env.VITE_TELEGRAM_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ADMIN_PASSWORD = env.VITE_ADMIN_PASSWORD || '';
const API = (env.VITE_API_URL || '').replace(/\/$/, ''); // Render server manzili

const CONFIG = {
  latitude: 38.971199,
  longitude: 66.70747,
  checkInRadiusMeters: 100,
  alertBoundaryMeters: 600,
};

type ActionType = 'keldi' | 'ketdi' | 'chiqdi';

interface UserProfile {
  pinfl: string;
  fullName: string;
  lavozimi: string;
  photoUrl: string;
}

interface AttendanceLog {
  pinfl: string;
  name: string;
  lavozimi: string;
  type: ActionType;
  late: boolean;
  dateKey: string;
  timeOnly: string;
  distanceMeters: number;
  lat: number;
  lng: number;
}

interface QueueItem {
  text: string;
  photo?: string;
}

// ====== YORDAMCHI FUNKSIYALAR ======
const pad = (n: number) => String(n).padStart(2, '0');
const localDateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hhmmss = (d = new Date()) => `${hhmm(d)}:${pad(d.getSeconds())}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const maskJshr = (j: string) => (j.length > 4 ? '*'.repeat(j.length - 4) + j.slice(-4) : j);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Saqlashda xato:', key, e);
  }
}

function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ====== TELEGRAM ======
async function tgSend(chatId: string, text: string, photo?: string) {
  const base = `https://api.telegram.org/bot${BOT_TOKEN}/`;
  let res: Response;
  if (photo && photo.startsWith('data:image')) {
    const fd = new FormData();
    fd.append('chat_id', chatId);
    fd.append('photo', dataUrlToBlob(photo), 'xodim.jpg');
    fd.append('caption', text);
    fd.append('parse_mode', 'HTML');
    res = await fetch(base + 'sendPhoto', { method: 'POST', body: fd });
  } else {
    res = await fetch(base + 'sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  }
  const j = await res.json();
  if (!j.ok) throw new Error(j.description || 'Telegram xatosi');
}

async function tgSendDocument(chatId: string, filename: string, content: string, caption: string) {
  const fd = new FormData();
  fd.append('chat_id', chatId);
  fd.append('document', new Blob(['\uFEFF' + content], { type: 'text/csv' }), filename);
  fd.append('caption', caption);
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description || 'Telegram xatosi');
}

async function sendToAdmins(text: string, photo?: string) {
  const failed: string[] = [];
  let sent = 0;
  if (!BOT_TOKEN || CHAT_IDS.length === 0) {
    return { sent: 0, failed: ['Bot tokeni yoki chat ID sozlanmagan'] };
  }
  for (const id of CHAT_IDS) {
    try {
      await tgSend(id, text, photo);
      sent++;
    } catch (e: any) {
      failed.push(`${id}: ${e?.message || e}`);
    }
  }
  return { sent, failed };
}

function enqueue(item: QueueItem) {
  const q = readJSON<QueueItem[]>('tg_queue', []);
  q.push(item);
  try {
    localStorage.setItem('tg_queue', JSON.stringify(q));
  } catch {
    q[q.length - 1] = { text: item.text };
    writeJSON('tg_queue', q);
  }
}
let flushing = false;
async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const q = readJSON<QueueItem[]>('tg_queue', []);
    const rest: QueueItem[] = [];
    for (const item of q) {
      const r = await sendToAdmins(item.text, item.photo);
      if (r.sent === 0) rest.push(item);
    }
    writeJSON('tg_queue', rest);
  } finally {
    flushing = false;
  }
}

// ====== SERVER BILAN ALOQA (nazorat uchun signal va davomat nusxasi) ======
const SERVER_QUEUE_KEY = 'server_attendance_queue';

// CapacitorHttp: ilova fonda bo'lganda ham ishlaydi (WebView fetch'i 5 daqiqadan keyin cheklanadi)
async function serverPost(path: string, body: unknown): Promise<{ ok: boolean; status: number }> {
  const r = await CapacitorHttp.post({
    url: `${API}${path}`,
    headers: { 'Content-Type': 'application/json' },
    data: body,
  });
  return { ok: r.status >= 200 && r.status < 300, status: r.status };
}

async function flushServerQueue() {
  if (!API) return;
  const q = readJSON<any[]>(SERVER_QUEUE_KEY, []);
  if (!q.length) return;
  const rest: any[] = [];
  for (const item of q) {
    try {
      const r = await serverPost('/check-attendance', { ...item, synced_from_offline: true });
      if (!r.ok && r.status >= 500) rest.push(item);
    } catch {
      rest.push(item);
    }
  }
  writeJSON(SERVER_QUEUE_KEY, rest);
}

let lastKnown: { jshr: string; lat: number; lng: number; acc?: number; ts: number } | null = null;
let pingTimer: any = null;
let lastPingAt = 0;

function sendPing() {
  if (!API || !lastKnown) return;
  // GPS faqat harakatlanganda yangilanadi, shuning uchun joyida turgan xodim koordinatasi 10 daqiqagacha amal qiladi
  if (Date.now() - lastKnown.ts > 10 * 60000) return;
  lastPingAt = Date.now();
  serverPost('/api/ping', {
    jshr: lastKnown.jshr,
    latitude: lastKnown.lat,
    longitude: lastKnown.lng,
    accuracy: lastKnown.acc,
  })
    .then(() => flushServerQueue())
    .catch(() => {});
}

/** GPS yangilanganda chaqiriladi; server har daqiqada signal oladi. */
function pingServer(jshr: string | undefined, lat: number, lng: number, acc?: number) {
  if (!API || !jshr) return;
  lastKnown = { jshr, lat, lng, acc, ts: Date.now() };
  if (!pingTimer) {
    pingTimer = setInterval(sendPing, 60000);
    sendPing();
  } else if (Date.now() - lastPingAt >= 55000) {
    sendPing();
  }
}

/** Keldim/Ketdim bosilganda serverga yozadi (Telegram xabarini ilovaning o'zi yuboradi). */
async function reportAttendance(jshr: string, kind: 'keldi' | 'ketdi', lat: number, lng: number) {
  if (!API) return;
  const payload = {
    jshr,
    latitude: lat,
    longitude: lng,
    action_type: kind === 'keldi' ? 'Keldi' : 'Ketdi',
    timestamp: new Date().toISOString(),
    device_info: 'Capacitor Android',
    silent: true,
  };
  try {
    const r = await serverPost('/check-attendance', payload);
    if (!r.ok && r.status >= 500) throw new Error('server');
  } catch {
    const q = readJSON<any[]>(SERVER_QUEUE_KEY, []);
    q.push(payload);
    writeJSON(SERVER_QUEUE_KEY, q);
  }
}

// ====== DAVOMAT MA'LUMOTLARI ======
const LOGS_KEY = 'attendance_logs_v2';
const USERS_KEY = 'registered_users_v2';
const loadLogs = () => readJSON<AttendanceLog[]>(LOGS_KEY, []);

interface DayRow {
  pinfl: string;
  name: string;
  lavozimi: string;
  photoUrl?: string;
  dateKey: string;
  keldi?: string;
  ketdi?: string;
  late: boolean;
  chiqdi?: string;
  absent: boolean;
}

/** dateKey berilsa: shu kunga barcha ro'yxatdan o'tganlar (kelmaganlar ham). null bo'lsa: hamma kunlar. */
function buildRows(logs: AttendanceLog[], users: UserProfile[], dateKey: string | null): DayRow[] {
  const photo = new Map(users.map((u) => [u.pinfl, u.photoUrl]));
  const src = dateKey ? logs.filter((l) => l.dateKey === dateKey) : logs;
  const map = new Map<string, DayRow>();

  for (const l of src) {
    const key = `${l.pinfl}|${l.dateKey}`;
    const row =
      map.get(key) ||
      ({
        pinfl: l.pinfl,
        name: l.name,
        lavozimi: l.lavozimi,
        photoUrl: photo.get(l.pinfl),
        dateKey: l.dateKey,
        late: false,
        absent: false,
      } as DayRow);
    if (l.type === 'keldi') {
      row.keldi = l.timeOnly;
      row.late = l.late;
    } else if (l.type === 'ketdi') row.ketdi = l.timeOnly;
    else if (l.type === 'chiqdi') row.chiqdi = l.timeOnly;
    map.set(key, row);
  }

  if (dateKey) {
    for (const u of users) {
      const key = `${u.pinfl}|${dateKey}`;
      if (!map.has(key)) {
        map.set(key, {
          pinfl: u.pinfl,
          name: u.fullName,
          lavozimi: u.lavozimi,
          photoUrl: u.photoUrl,
          dateKey,
          late: false,
          absent: true,
        });
      }
    }
  } else {
    const seen = new Set(src.map((l) => l.pinfl));
    for (const u of users) {
      if (!seen.has(u.pinfl)) {
        map.set(`${u.pinfl}|-`, {
          pinfl: u.pinfl,
          name: u.fullName,
          lavozimi: u.lavozimi,
          photoUrl: u.photoUrl,
          dateKey: '-',
          late: false,
          absent: true,
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
    if (a.absent !== b.absent) return a.absent ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

const statusOf = (r: DayRow) =>
  r.absent ? (r.dateKey === '-' ? "Yozuv yo'q" : 'Kelmagan') : r.late ? 'Kechikdi' : "O'z vaqtida";

function rowsToCsv(rows: DayRow[]) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ['F.I.O,Lavozimi,JSHR,Sana,Keldi,Ketdi,Holat,Hududdan chiqqan vaqt'];
  for (const r of rows) {
    lines.push(
      [
        q(r.name),
        q(r.lavozimi),
        q(maskJshr(r.pinfl)),
        r.dateKey,
        r.keldi || '',
        r.ketdi || '',
        statusOf(r),
        r.chiqdi || '',
      ].join(',')
    );
  }
  return lines.join('\n');
}

// ====== TELEFON SOZLAMALARI QO'LLANMASI ======
type Brand = 'samsung' | 'xiaomi' | 'honor' | 'oppo' | 'vivo' | 'other';

function detectBrand(): Brand {
  const ua = navigator.userAgent || '';
  if (/xiaomi|redmi|poco|\bmi \d|\bm\d{4}[a-z]\d/i.test(ua)) return 'xiaomi';
  if (/samsung|\bsm-[a-z]\d/i.test(ua)) return 'samsung';
  if (/honor|huawei|\b(hry|lly|rny|nth|ang|bkl)-/i.test(ua)) return 'honor';
  if (/oppo|realme|\bcph\d|\brmx\d/i.test(ua)) return 'oppo';
  if (/vivo|\bv\d{4}/i.test(ua)) return 'vivo';
  return 'other';
}

const BRAND_NAMES: Record<Brand, string> = {
  samsung: 'Samsung',
  xiaomi: 'Xiaomi / Redmi / Poco',
  honor: 'Honor / Huawei',
  oppo: 'Oppo / Realme',
  vivo: 'Vivo',
  other: 'Boshqa telefonlar',
};

const BRAND_STEPS: Record<Brand, string[]> = {
  samsung: [
    'Sozlamalar → Batareya → «Fon rejimidagi foydalanish cheklovlari».',
    '«Hech qachon uxlamaydigan ilovalar» ro‘yxatiga «Davomat» ilovasini qo‘shing.',
    'Sozlamalar → Ilovalar → Davomat → Batareya → «Cheklanmagan» ni tanlang.',
  ],
  xiaomi: [
    'Sozlamalar → Ilovalar → Ilovalarni boshqarish → Davomat → «Avtomatik ishga tushirish» ni yoqing.',
    'Shu sahifada Batareya tejash (Battery saver) → «Cheklovlarsiz» (No restrictions) ni tanlang.',
    'Oxirgi ilovalar oynasida Davomat kartasini bosib ushlang va «Qulflash» (Lock) ni bosing.',
  ],
  honor: [
    'Sozlamalar → Batareya → «Ilovalarni ishga tushirish» (App launch).',
    'Davomat ilovasi uchun «Qo‘lda boshqarish» ni tanlab, uchala tugmani yoqing: avtomatik ishga tushirish, qo‘shimcha ishga tushirish, fonda ishlash.',
  ],
  oppo: [
    'Sozlamalar → Batareya → Davomat → «Fonda ishlashga ruxsat» ni yoqing.',
    'Ilova ma‘lumotlarida «Avtomatik ishga tushirish» ni yoqing.',
    'Batareya optimallashtirish ro‘yxatidan Davomat ilovasini chiqaring.',
  ],
  vivo: [
    'Sozlamalar → Batareya → «Fonda yuqori quvvat sarfi» → Davomat ni ruxsat qiling.',
    'Ilovalar → Davomat → «Avtomatik ishga tushirish» ni yoqing.',
  ],
  other: [
    'Sozlamalar → Ilovalar → Davomat → Batareya → «Cheklanmagan» yoki «Optimallashtirmaslik» ni tanlang.',
    'Joylashuv ruxsati: «Ilova ishlatilayotganda» yoki «Doim».',
  ],
};

function DeviceGuide() {
  const mine = detectBrand();
  const [open, setOpen] = useState<Brand | null>(mine);
  const order = (Object.keys(BRAND_STEPS) as Brand[]).sort((a, b) => (a === mine ? -1 : b === mine ? 1 : 0));
  const openSettings = () => {
    if (Capacitor.isNativePlatform()) BackgroundGeolocation.openSettings();
    else alert('Bu tugma faqat telefondagi ilovada ishlaydi.');
  };
  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-4 space-y-3 text-left">
      <div className="text-sm font-extrabold">⚙️ Telefonni sozlash (bir marta)</div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Ekran o‘chiq bo‘lganda ham ish vaqtida joylashuv yuborilishi uchun batareya cheklovini o‘chiring. Aks holda telefon ilovani
        uxlatib qo‘yadi va admin «Aloqa uzildi» xabarini oladi. Menyu nomlari telefon modeli va versiyasiga qarab biroz farq qilishi mumkin.
      </p>
      <button
        onClick={openSettings}
        className="w-full py-2.5 rounded-2xl bg-teal-500/15 text-teal-300 ring-1 ring-teal-400/30 text-xs font-bold active:scale-95 transition"
      >
        Ilova sozlamalarini ochish
      </button>
      <div className="space-y-2">
        {order.map((b) => (
          <div key={b} className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
            <button
              onClick={() => setOpen(open === b ? null : b)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold"
            >
              <span>
                {BRAND_NAMES[b]}
                {b === mine && b !== 'other' ? ' · sizning telefon' : ''}
              </span>
              <span className="text-slate-500">{open === b ? '−' : '+'}</span>
            </button>
            {open === b && (
              <ol className="px-4 pb-3 space-y-1.5 list-decimal list-inside text-[11px] text-slate-300 leading-relaxed">
                {BRAND_STEPS[b].map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-amber-300/90 leading-relaxed">
        Ilovani oxirgi ilovalar ro‘yxatidan surib yopmang. Ba’zi telefonlar (Xiaomi, Honor) buni «ilovani to‘xtatish» deb hisoblaydi.
      </p>
    </div>
  );
}

// ====== KICHIK KOMPONENTLAR ======
function Avatar({ src, name, size = 44 }: { src?: string; name: string; size?: number }) {
  const style = { width: size, height: size };
  if (src) {
    return <img src={src} alt="" style={style} className="rounded-2xl object-cover flex-shrink-0 bg-slate-800" />;
  }
  return (
    <div
      style={style}
      className="rounded-2xl flex-shrink-0 flex items-center justify-center font-bold text-sm text-white bg-gradient-to-br from-teal-500 to-indigo-500"
    >
      {initials(name) || '?'}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'ok' | 'late' | 'absent' | 'info'; children: React.ReactNode }) {
  const tones = {
    ok: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
    late: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
    absent: 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
    info: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ring-1 ${tones[tone]}`}>{children}</span>
  );
}

// ====== ILOVA ======
export default function App() {
  const [tab, setTab] = useState<'asosiy' | 'profil' | 'admin'>('asosiy');
  const [profile, setProfile] = useState<UserProfile | null>(() => readJSON<UserProfile | null>('user_profile', null));
  const [logs, setLogs] = useState<AttendanceLog[]>(loadLogs());
  const [users, setUsers] = useState<UserProfile[]>(readJSON<UserProfile[]>(USERS_KEY, []));

  const [pinflInput, setPinflInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [lavozimInput, setLavozimInput] = useState("O'qituvchi");
  const [photoInput, setPhotoInput] = useState<string | null>(null);

  const [distance, setDistance] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(new Date());

  const [adminOk, setAdminOk] = useState(false);
  const [pass, setPass] = useState('');
  const [filterDate, setFilterDate] = useState<string>(localDateKey());
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const refresh = useCallback(() => {
    setLogs(loadLogs());
    setUsers(readJSON<UserProfile[]>(USERS_KEY, []));
  }, []);

  // joriy profil ro'yxatda bo'lmasa, qo'shib qo'yamiz
  useEffect(() => {
    if (!profile) return;
    const list = readJSON<UserProfile[]>(USERS_KEY, []);
    if (!list.some((u) => u.pinfl === profile.pinfl)) {
      list.push(profile);
      writeJSON(USERS_KEY, list);
      setUsers(list);
    }
  }, [profile]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => {
      setIsOnline(true);
      flushQueue();
      flushServerQueue();
    };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    flushQueue();
    flushServerQueue();
    const t = setInterval(() => {
      flushQueue();
      flushServerQueue();
    }, 30000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      clearInterval(t);
    };
  }, []);

  // ====== GPS (telefonda: fonda ishlaydigan; veb-versiyada: oddiy) ======
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    let askedSettings = false;

    const onPosition = (lat: number, lng: number, acc?: number) => {
      setGpsError('');
      setCoords({ lat, lng });
      const dist = getDistanceInMeters(lat, lng, CONFIG.latitude, CONFIG.longitude);
      setDistance(dist);

      // Server nazorati yoqilgan bo'lsa, signal serverga yuboriladi
      pingServer(profileRef.current?.pinfl, lat, lng, acc);

      // Server ulangan bo'lsa, hududdan chiqishni server nazorat qiladi (takroriy xabar bo'lmasligi uchun)
      if (API) return;

      const p = profileRef.current;
      if (!p) return;
      const now = new Date();
      const dateKey = localDateKey(now);
      const today = loadLogs().filter((l) => l.pinfl === p.pinfl && l.dateKey === dateKey);
      const hasIn = today.some((l) => l.type === 'keldi');
      const hasOut = today.some((l) => l.type === 'ketdi');
      const flagKey = `boundary_alert_${p.pinfl}_${dateKey}`;

      if (hasIn && !hasOut && dist > CONFIG.alertBoundaryMeters && localStorage.getItem(flagKey) !== 'true') {
        localStorage.setItem(flagKey, 'true');
        saveLog(p, 'chiqdi', false, lat, lng, dist);
        const msg =
          `<b>🚨 DIQQAT! HUDUDDAN CHIQIB KETDI (${CONFIG.alertBoundaryMeters}m+)</b>\n\n` +
          `👤 <b>F.I.O:</b> ${esc(p.fullName)}\n💼 <b>Lavozimi:</b> ${esc(p.lavozimi)}\n` +
          `⏰ <b>Vaqt:</b> ${hhmmss(now)}\n📍 <b>Masofa:</b> ${dist}m`;
        deliver(msg, p.photoUrl);
      }
    };

    (async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // Android 13+: fondagi xizmat bildirishnomasi uchun ruxsat
          await LocalNotifications.requestPermissions();
        } catch {
          /* ruxsat berilmasa ham GPS ishlayveradi */
        }
        try {
          const id: string = await BackgroundGeolocation.addWatcher(
            {
              backgroundTitle: 'Davomat nazorati',
              backgroundMessage: 'Ish vaqtida joylashuv kuzatilmoqda',
              requestPermissions: true,
              stale: false,
              distanceFilter: 15,
            },
            (loc: any, err: any) => {
              if (err) {
                if (err.code === 'NOT_AUTHORIZED') {
                  setGpsError('Joylashuv ruxsati berilmagan. Ilova sozlamalaridan «Joylashuv» ni yoqing.');
                  if (!askedSettings) {
                    askedSettings = true;
                    if (window.confirm('Davomat uchun joylashuv ruxsati kerak. Ilova sozlamalarini ochaymi?')) {
                      BackgroundGeolocation.openSettings();
                    }
                  }
                } else {
                  setGpsError('GPS xatosi: ' + (err.message || err.code || 'joylashuv olinmadi'));
                }
                return;
              }
              if (loc) onPosition(loc.latitude, loc.longitude, loc.accuracy);
            }
          );
          if (cancelled) BackgroundGeolocation.removeWatcher({ id });
          else stop = () => BackgroundGeolocation.removeWatcher({ id });
        } catch (e: any) {
          setGpsError("GPS ishga tushmadi: " + (e?.message || e));
        }
      } else {
        try {
          const perm = await Geolocation.requestPermissions();
          if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
            setGpsError('Joylashuv ruxsati berilmagan.');
            return;
          }
          const id = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
            (pos, err) => {
              if (err || !pos) {
                setGpsError('GPS xatosi: ' + (err?.message || 'joylashuv olinmadi'));
                return;
              }
              onPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
            }
          );
          if (cancelled) Geolocation.clearWatch({ id });
          else stop = () => Geolocation.clearWatch({ id });
        } catch (e: any) {
          setGpsError("GPS yoqilmagan yoki ruxsat yo'q: " + (e?.message || e));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (stop) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  function saveLog(user: UserProfile, type: ActionType, late: boolean, lat: number, lng: number, dist: number) {
    const now = new Date();
    const rec: AttendanceLog = {
      pinfl: user.pinfl,
      name: user.fullName,
      lavozimi: user.lavozimi,
      type,
      late,
      dateKey: localDateKey(now),
      timeOnly: hhmm(now),
      distanceMeters: dist,
      lat,
      lng,
    };
    const all = loadLogs();
    all.push(rec);
    writeJSON(LOGS_KEY, all);
    setLogs(all);
  }

  async function deliver(text: string, photo?: string): Promise<string> {
    const r = await sendToAdmins(text, photo);
    if (r.sent === 0) {
      enqueue({ text, photo });
      return `⚠️ Botga yuborilmadi (internet yoki sozlama xatosi). Keyinroq avtomatik qayta yuboriladi.\n${r.failed.join('\n')}`;
    }
    if (r.failed.length) return `⚠️ Ba'zi adminlarga bormadi:\n${r.failed.join('\n')}`;
    return '✅ Admin botiga yuborildi.';
  }

  async function takeLivePhoto(): Promise<string> {
    const photo = await Camera.getPhoto({
      quality: 60,
      width: 720,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      direction: CameraDirection.Front,
      saveToGallery: false,
    });
    if (!photo.dataUrl) throw new Error('Rasm olinmadi');
    return photo.dataUrl;
  }

  // ====== KELDIM / KETDIM ======
  async function handleAttendance(kind: 'keldi' | 'ketdi') {
    if (busy) return;
    if (!profile) return alert("Avval profil ma'lumotlaringizni kiriting!");
    if (distance === null || !coords) return alert(gpsError || 'GPS joylashuvingiz aniqlanmoqda, kuting...');

    const now = new Date();
    const dateKey = localDateKey(now);
    const today = loadLogs().filter((l) => l.pinfl === profile.pinfl && l.dateKey === dateKey);

    if (distance > CONFIG.checkInRadiusMeters) {
      return alert(
        `❌ Texnikum hududidan tashqaridasiz (${distance}m).\n${CONFIG.checkInRadiusMeters} metr ichida bo'lishingiz kerak!`
      );
    }

    if (kind === 'keldi') {
      if (today.some((l) => l.type === 'keldi')) return alert("⛔ Bugun «Keldim» belgisini allaqachon qo'ygansiz!");
    } else {
      if (!today.some((l) => l.type === 'keldi')) return alert("⛔ Avval «Keldim» belgisini qo'ying!");
      if (today.some((l) => l.type === 'ketdi')) return alert("⛔ Bugun «Ketdim» belgisini allaqachon qo'ygansiz!");
      const isSat = now.getDay() === 6;
      const endMin = isSat ? 13 * 60 : 16 * 60;
      if (now.getHours() * 60 + now.getMinutes() < endMin) {
        return alert(`⛔ Hali ish vaqti tugamadi!\nKetishga faqat soat ${isSat ? '13:00' : '16:00'} dan keyin ruxsat beriladi.`);
      }
    }

    setBusy(true);
    try {
      let photo: string;
      try {
        photo = await takeLivePhoto();
      } catch (e: any) {
        alert('Kamera ochilmadi yoki bekor qilindi. Kamera ruxsatini tekshiring.\n' + (e?.message || ''));
        return;
      }

      const t = new Date();
      let late = false;
      let text: string;
      if (kind === 'keldi') {
        late = t.getHours() * 60 + t.getMinutes() > 8 * 60 + 30;
        text =
          `🟢 <b>KIRISH (Kelish) - ${localDateKey(t)}</b>\n\n👤 <b>F.I.O:</b> ${esc(profile.fullName)}\n` +
          `💼 <b>Lavozimi:</b> ${esc(profile.lavozimi)}\n⏰ <b>Vaqt:</b> ${hhmmss(t)}\n` +
          `⚠️ <b>Holat:</b> ${late ? 'Kechikib keldi ⚠️' : "O'z vaqtida keldi ✅"}\n📍 <b>Masofa:</b> ${distance}m`;
      } else {
        text =
          `🔴 <b>CHIQISH (Ketish) - ${localDateKey(t)}</b>\n\n👤 <b>F.I.O:</b> ${esc(profile.fullName)}\n` +
          `💼 <b>Lavozimi:</b> ${esc(profile.lavozimi)}\n⏰ <b>Vaqt:</b> ${hhmmss(t)}\n📍 <b>Masofa:</b> ${distance}m`;
      }

      saveLog(profile, kind, late, coords.lat, coords.lng, distance);
      reportAttendance(profile.pinfl, kind, coords.lat, coords.lng);
      const result = await deliver(text, photo);
      alert(
        (kind === 'keldi' ? (late ? '⚠️ Kechikdingiz!' : "✅ O'z vaqtida keldingiz!") : '✅ Ketish belgilandi!') +
          '\n' +
          result
      );
    } finally {
      setBusy(false);
    }
  }

  // ====== PROFIL ======
  async function pickProfilePhoto() {
    try {
      setPhotoInput(await takeLivePhoto());
    } catch {
      alert('Rasm olinmadi. Kamera ruxsatini tekshiring.');
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (pinflInput.length !== 14) return alert("JSHR 14 xonali bo'lishi kerak!");
    if (!nameInput.trim() || !photoInput) return alert("Barcha maydonlarni to'ldiring va rasm oling!");

    const p: UserProfile = { pinfl: pinflInput, fullName: nameInput.trim(), lavozimi: lavozimInput, photoUrl: photoInput };
    writeJSON('user_profile', p);
    setProfile(p);

    const list = readJSON<UserProfile[]>(USERS_KEY, []);
    const i = list.findIndex((u) => u.pinfl === p.pinfl);
    if (i >= 0) list[i] = p;
    else list.push(p);
    writeJSON(USERS_KEY, list);
    setUsers(list);

    const msg =
      `<b>👤 YANGI XODIM TIZIMGA ULANDI</b>\n\n📌 <b>F.I.O:</b> ${esc(p.fullName)}\n` +
      `💼 <b>Lavozimi:</b> ${esc(p.lavozimi)}\n🆔 <b>JSHR:</b> <code>${maskJshr(p.pinfl)}</code>\n⏰ <b>Vaqt:</b> ${hhmmss()}`;
    const r = await deliver(msg, p.photoUrl);
    alert('Profil saqlandi.\n' + r);
  }

  // ====== ADMIN ======
  const allRows = buildRows(logs, users, showAll ? null : filterDate);
  const rows = allRows.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));
  const stat = {
    total: allRows.length,
    came: allRows.filter((r) => !r.absent).length,
    late: allRows.filter((r) => !r.absent && r.late).length,
    absent: allRows.filter((r) => r.absent).length,
  };

  function downloadCsv() {
    const csv = rowsToCsv(rows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `davomat_${showAll ? 'hammasi' : filterDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function sendCsvToTelegram() {
    if (rows.length === 0) return alert("Yuboradigan yozuv yo'q.");
    const csv = rowsToCsv(rows);
    const name = `davomat_${showAll ? 'hammasi' : filterDate}.csv`;
    let ok = 0;
    const failed: string[] = [];
    for (const id of CHAT_IDS) {
      try {
        await tgSendDocument(id, name, csv, `📊 Davomat hisoboti (${showAll ? 'hammasi' : filterDate})`);
        ok++;
      } catch (e: any) {
        failed.push(`${id}: ${e?.message || e}`);
      }
    }
    alert(ok ? `✅ Hisobot ${ok} ta adminga yuborildi (Excel'da ochiladi).` : '❌ Yuborilmadi:\n' + failed.join('\n'));
  }

  function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (ADMIN_PASSWORD && pass === ADMIN_PASSWORD) {
      setAdminOk(true);
      setPass('');
      refresh();
    } else alert("Parol noto'g'ri!");
  }

  function handleClear() {
    if (window.confirm("Bu telefondagi barcha davomat tarixini o'chirmoqchimisiz?")) {
      localStorage.removeItem(LOGS_KEY);
      refresh();
    }
  }

  // ====== KO'RINISH ======
  const inZone = distance !== null && distance <= CONFIG.checkInRadiusMeters;
  const isSat = clock.getDay() === 6;
  const todayLogs = profile ? logs.filter((l) => l.pinfl === profile.pinfl && l.dateKey === localDateKey(clock)) : [];
  const myIn = todayLogs.find((l) => l.type === 'keldi');
  const myOut = todayLogs.find((l) => l.type === 'ketdi');
  const dateLabel = clock.toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const proximity = distance === null ? 0 : Math.max(4, Math.min(100, 100 - (distance / CONFIG.alertBoundaryMeters) * 100));

  const glass = 'bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.35)]';
  const field =
    'w-full bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-400/70';

  return (

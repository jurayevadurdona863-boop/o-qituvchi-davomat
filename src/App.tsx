import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera';

// ====== SOZLAMALAR (maxfiy qiymatlar Codemagic/Render environment variables orqali) ======
const env = ((import.meta as any).env || {}) as Record<string, string>;
const BOT_TOKEN = env.VITE_TELEGRAM_BOT_TOKEN || '';
const CHAT_IDS: string[] = (env.VITE_TELEGRAM_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ADMIN_PASSWORD = env.VITE_ADMIN_PASSWORD || '';

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
        q(r.pinfl),
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
    };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    flushQueue();
    const t = setInterval(flushQueue, 30000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      clearInterval(t);
    };
  }, []);

  // ====== GPS ======
  useEffect(() => {
    if (!profile) return;
    let watchId: string | undefined;
    let cancelled = false;

    const onPosition = (lat: number, lng: number) => {
      setGpsError('');
      setCoords({ lat, lng });
      const dist = getDistanceInMeters(lat, lng, CONFIG.latitude, CONFIG.longitude);
      setDistance(dist);

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
      try {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          setGpsError('Joylashuv ruxsati berilmagan. Sozlamalar → Ilovalar → Ruxsatlar → Joylashuv.');
          return;
        }
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
          (pos, err) => {
            if (err || !pos) {
              setGpsError('GPS xatosi: ' + (err?.message || 'joylashuv olinmadi'));
              return;
            }
            onPosition(pos.coords.latitude, pos.coords.longitude);
          }
        );
        if (cancelled) Geolocation.clearWatch({ id });
        else watchId = id;
      } catch (e: any) {
        setGpsError("GPS yoqilmagan yoki ruxsat yo'q: " + (e?.message || e));
      }
    })();

    return () => {
      cancelled = true;
      if (watchId) Geolocation.clearWatch({ id: watchId });
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
      `💼 <b>Lavozimi:</b> ${esc(p.lavozimi)}\n🆔 <b>JSHR:</b> <code>${p.pinfl}</code>\n⏰ <b>Vaqt:</b> ${hhmmss()}`;
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
    <div
      className="min-h-screen text-slate-100 font-sans pb-32"
      style={{
        background:
          'radial-gradient(900px 500px at 0% -5%, rgba(20,184,166,0.22), transparent 60%), radial-gradient(800px 500px at 100% 0%, rgba(99,102,241,0.22), transparent 60%), #050816',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">
        {/* Yuqori qism */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold">Davomat</div>
            <div className="text-5xl font-black tracking-tight font-mono bg-gradient-to-r from-white to-teal-200 bg-clip-text text-transparent">
              {hhmm(clock)}
            </div>
            <div className="text-xs text-slate-400 capitalize mt-1">{dateLabel}</div>
          </div>
          <div className="text-right space-y-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold ring-1 ${
                isOnline ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30' : 'bg-rose-500/15 text-rose-300 ring-rose-400/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              {isOnline ? 'ONLINE' : 'OFLAYN'}
            </span>
            <div className="text-[11px] text-slate-400">
              Ish vaqti
              <div className="text-sm font-bold text-teal-300 font-mono">{isSat ? '08:30 – 13:00' : '08:30 – 16:00'}</div>
            </div>
          </div>
        </div>

        {/* ASOSIY */}
        {tab === 'asosiy' && (
          <>
            {!profile ? (
              <form onSubmit={handleSaveProfile} className={`${glass} p-5 space-y-3`}>
                <div className="text-center">
                  <div className="text-2xl">👋</div>
                  <h3 className="text-base font-bold">Xush kelibsiz!</h3>
                  <p className="text-xs text-slate-400">Boshlash uchun profilingizni to'ldiring</p>
                </div>
                <input
                  className={`${field} font-mono`}
                  maxLength={14}
                  inputMode="numeric"
                  value={pinflInput}
                  onChange={(e) => setPinflInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="14 xonali JSHR"
                />
                <input className={field} value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Ism Familiya (F.I.O)" />
                <select className={field} value={lavozimInput} onChange={(e) => setLavozimInput(e.target.value)}>
                  <option className="text-black">O'qituvchi</option>
                  <option className="text-black">ICHTU</option>
                  <option className="text-black">Ma'muriyat</option>
                  <option className="text-black">Xodim</option>
                </select>
                <button
                  type="button"
                  onClick={pickProfilePhoto}
                  className="w-full py-3 rounded-2xl border border-dashed border-teal-400/50 text-teal-300 text-sm font-semibold active:scale-95 transition"
                >
                  {photoInput ? '✅ Rasm olindi — qayta olish' : '📸 Profil rasmini olish'}
                </button>
                {photoInput && <img src={photoInput} alt="" className="w-24 h-24 rounded-3xl object-cover mx-auto ring-2 ring-teal-400/60" />}
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-extrabold text-sm shadow-[0_8px_24px_rgba(20,184,166,0.35)] active:scale-95 transition"
                >
                  Saqlash va boshlash
                </button>
              </form>
            ) : (
              <>
                {/* Profil kartasi */}
                <div className={`${glass} p-4 flex items-center gap-3`}>
                  <div className="p-0.5 rounded-[1.1rem] bg-gradient-to-br from-teal-400 to-indigo-500">
                    <Avatar src={profile.photoUrl} name={profile.fullName} size={56} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-base truncate">{profile.fullName}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge tone="info">{profile.lavozimi}</Badge>
                      <span className="text-[10px] text-slate-500 font-mono truncate">{profile.pinfl}</span>
                    </div>
                  </div>
                </div>

                {/* Hudud kartasi */}
                <div className={`${glass} p-4 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${inZone ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                      <span className={`text-sm font-bold ${inZone ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {distance === null ? 'GPS aniqlanmoqda...' : inZone ? 'Davomat hududidasiz' : 'Hududdan tashqaridasiz'}
                      </span>
                    </div>
                    <span className="text-lg font-black font-mono text-white">
                      {distance !== null ? (distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`) : '—'}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${inZone ? 'bg-gradient-to-r from-emerald-400 to-teal-400' : 'bg-gradient-to-r from-rose-500 to-orange-400'}`}
                      style={{ width: `${proximity}%` }}
                    />
                  </div>
                  {gpsError ? (
                    <div className="text-[11px] text-amber-300">{gpsError}</div>
                  ) : (
                    !inZone &&
                    distance !== null && (
                      <div className="text-[11px] text-slate-400">Davomat uchun texnikum hududidagi {CONFIG.checkInRadiusMeters} m ichiga kiring.</div>
                    )
                  )}
                </div>

                {/* Tugmalar */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={busy}
                    onClick={() => handleAttendance('keldi')}
                    className="relative overflow-hidden py-6 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 disabled:opacity-50 active:scale-95 transition shadow-[0_10px_30px_rgba(16,185,129,0.35)]"
                  >
                    <div className="text-3xl">📸</div>
                    <div className="text-base font-extrabold mt-1">Keldim</div>
                    <div className="text-[10px] text-emerald-100/80">Jonli rasm bilan</div>
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleAttendance('ketdi')}
                    className="relative overflow-hidden py-6 rounded-3xl bg-gradient-to-br from-rose-500 to-orange-500 disabled:opacity-50 active:scale-95 transition shadow-[0_10px_30px_rgba(244,63,94,0.35)]"
                  >
                    <div className="text-3xl">📸</div>
                    <div className="text-base font-extrabold mt-1">Ketdim</div>
                    <div className="text-[10px] text-rose-100/80">{isSat ? '13:00 dan keyin' : '16:00 dan keyin'}</div>
                  </button>
                </div>

                {/* Bugungi holat */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`${glass} p-4`}>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold">
                      <span className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center">↘</span>
                      Kirish
                    </div>
                    <div className="text-2xl font-black font-mono mt-2">{myIn ? myIn.timeOnly : '--:--'}</div>
                    {myIn && <div className="mt-1"><Badge tone={myIn.late ? 'late' : 'ok'}>{myIn.late ? 'Kechikdingiz' : "O'z vaqtida"}</Badge></div>}
                  </div>
                  <div className={`${glass} p-4`}>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold">
                      <span className="w-6 h-6 rounded-lg bg-rose-500/15 text-rose-300 flex items-center justify-center">↗</span>
                      Chiqish
                    </div>
                    <div className="text-2xl font-black font-mono mt-2">{myOut ? myOut.timeOnly : '--:--'}</div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* PROFIL */}
        {tab === 'profil' && (
          <div className={`${glass} p-6 text-center space-y-3`}>
            {profile ? (
              <>
                <div className="inline-block p-1 rounded-[1.6rem] bg-gradient-to-br from-teal-400 to-indigo-500">
                  <Avatar src={profile.photoUrl} name={profile.fullName} size={96} />
                </div>
                <div className="font-extrabold text-lg">{profile.fullName}</div>
                <div className="flex justify-center"><Badge tone="info">{profile.lavozimi}</Badge></div>
                <div className="text-xs text-slate-400 font-mono">JSHR: {profile.pinfl}</div>
                <button
                  onClick={() => {
                    if (window.confirm("Profilni o'zgartirasizmi?")) {
                      localStorage.removeItem('user_profile');
                      setProfile(null);
                      setTab('asosiy');
                    }
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30 text-xs font-bold active:scale-95 transition"
                >
                  Profilni yangilash
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-400">Profil kiritilmagan.</p>
            )}
          </div>
        )}

        {/* ADMIN */}
        {tab === 'admin' && (
          <div className="space-y-4">
            {!adminOk ? (
              <form onSubmit={handleAdminLogin} className={`${glass} p-6 space-y-3`}>
                <div className="text-center">
                  <div className="text-3xl">🛡️</div>
                  <h2 className="text-base font-bold mt-1">Admin paneli</h2>
                  <p className="text-xs text-slate-400">Davom etish uchun parolni kiriting</p>
                </div>
                <input type="password" className={`${field} text-center font-mono`} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••" />
                <button className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 text-white font-extrabold text-sm active:scale-95 transition">
                  Kirish
                </button>
              </form>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-extrabold">🛡️ Davomat paneli</h2>
                  <button onClick={() => setAdminOk(false)} className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-semibold">
                    Chiqish
                  </button>
                </div>

                {/* Ko'rsatkichlar */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ['Jami', stat.total, 'from-indigo-500/25 to-indigo-500/5 text-indigo-200'],
                    ['Kelgan', stat.came, 'from-emerald-500/25 to-emerald-500/5 text-emerald-200'],
                    ['Kechikkan', stat.late, 'from-amber-500/25 to-amber-500/5 text-amber-200'],
                    ['Kelmagan', stat.absent, 'from-rose-500/25 to-rose-500/5 text-rose-200'],
                  ].map(([label, val, cls]) => (
                    <div key={label as string} className={`rounded-2xl p-3 text-center bg-gradient-to-b ring-1 ring-white/10 ${cls}`}>
                      <div className="text-xl font-black font-mono">{val as number}</div>
                      <div className="text-[9px] font-semibold opacity-80">{label as string}</div>
                    </div>
                  ))}
                </div>

                {/* Filtr */}
                <div className={`${glass} p-3 space-y-2.5`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className={`${field} !py-2 !w-auto flex-1`}
                      value={filterDate}
                      onChange={(e) => {
                        setFilterDate(e.target.value);
                        setShowAll(false);
                      }}
                    />
                    <button
                      onClick={() => setShowAll(!showAll)}
                      className={`px-4 py-2 rounded-2xl text-xs font-bold ring-1 transition ${showAll ? 'bg-teal-500 text-slate-950 ring-teal-300' : 'bg-white/5 text-slate-300 ring-white/10'}`}
                    >
                      Hammasi
                    </button>
                  </div>
                  <input className={`${field} !py-2.5`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Xodim ismini qidiring..." />
                </div>

                {/* Jadval */}
                <div className={`${glass} overflow-hidden`}>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-white/10">
                    <span>Xodim</span>
                    <span className="w-12 text-center">Keldi</span>
                    <span className="w-12 text-center">Ketdi</span>
                  </div>
                  {rows.length === 0 && <div className="text-center text-xs text-slate-500 py-8">Xodimlar topilmadi</div>}
                  {rows.map((r) => (
                    <div key={r.pinfl + r.dateKey} className="px-4 py-3 border-b border-white/5 last:border-0">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar src={r.photoUrl} name={r.name} size={38} />
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate">{r.name}</div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {r.lavozimi}
                              {showAll && r.dateKey !== '-' ? ` · ${r.dateKey}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="w-12 text-center text-xs font-mono font-bold text-emerald-300">{r.keldi || '--:--'}</div>
                        <div className="w-12 text-center text-xs font-mono font-bold text-rose-300">{r.ketdi || '--:--'}</div>
                      </div>
                      <div className="mt-1.5 ml-[46px] flex items-center gap-2">
                        <Badge tone={r.absent ? 'absent' : r.late ? 'late' : 'ok'}>{statusOf(r)}</Badge>
                        {r.chiqdi && <Badge tone="absent">🚨 Hududdan chiqdi {r.chiqdi}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Amallar */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={downloadCsv} className="py-3 rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 text-xs font-bold active:scale-95 transition">
                    ⬇️ CSV yuklab olish
                  </button>
                  <button onClick={sendCsvToTelegram} className="py-3 rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30 text-xs font-bold active:scale-95 transition">
                    📨 Telegramga CSV
                  </button>
                  <button onClick={refresh} className="py-3 rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30 text-xs font-bold active:scale-95 transition">
                    🔄 Yangilash
                  </button>
                  <button onClick={handleClear} className="py-3 rounded-2xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30 text-xs font-bold active:scale-95 transition">
                    🗑️ Tarixni tozalash
                  </button>
                </div>

                <p className="text-[10px] text-slate-500 text-center px-4">
                  Ro'yxatdagi xodimlar: {users.length} (shu telefonda ro'yxatdan o'tganlar). Barcha xodimlarning kelish-ketish xabarlari Telegram botga tushadi.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Pastki menyu */}
      <nav
        className="fixed left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-50 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-[1.75rem] p-1.5 flex shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        {([
          ['asosiy', '🏠', 'Asosiy'],
          ['profil', '👤', 'Profil'],
          ['admin', '🛡️', 'Admin'],
        ] as const).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              if (id !== 'admin') setAdminOk(false);
              else refresh();
            }}
            className={`flex-1 flex flex-col items-center py-2 rounded-[1.4rem] transition ${
              tab === id ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-lg' : 'text-slate-400'
            }`}
          >
            <span className="text-lg leading-none">{icon}</span>
            <span className="text-[10px] font-bold mt-0.5">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

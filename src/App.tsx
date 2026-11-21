import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera';

// ====== SOZLAMALAR (maxfiy qiymatlar Codemagic environment variables orqali beriladi) ======
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
  dateKey: string;
  keldi?: string;
  ketdi?: string;
  late: boolean;
  chiqdi?: string;
}

function buildRows(logs: AttendanceLog[]): DayRow[] {
  const map = new Map<string, DayRow>();
  for (const l of logs) {
    const key = `${l.pinfl}|${l.dateKey}`;
    const row =
      map.get(key) ||
      ({ pinfl: l.pinfl, name: l.name, lavozimi: l.lavozimi, dateKey: l.dateKey, late: false } as DayRow);
    if (l.type === 'keldi') {
      row.keldi = l.timeOnly;
      row.late = l.late;
    } else if (l.type === 'ketdi') row.ketdi = l.timeOnly;
    else if (l.type === 'chiqdi') row.chiqdi = l.timeOnly;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.dateKey === b.dateKey ? a.name.localeCompare(b.name) : b.dateKey.localeCompare(a.dateKey)
  );
}

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
        r.keldi ? (r.late ? 'Kechikdi' : "O'z vaqtida") : '',
        r.chiqdi || '',
      ].join(',')
    );
  }
  return lines.join('\n');
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

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const refresh = useCallback(() => {
    setLogs(loadLogs());
    setUsers(readJSON<UserProfile[]>(USERS_KEY, []));
  }, []);

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
          setGpsError("Joylashuv ruxsati berilmagan. Sozlamalar → Ilovalar → Ruxsatlar → Joylashuv.");
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

  function saveLog(
    user: UserProfile,
    type: ActionType,
    late: boolean,
    lat: number,
    lng: number,
    dist: number
  ) {
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
      alert((kind === 'keldi' ? (late ? '⚠️ Kechikdingiz!' : "✅ O'z vaqtida keldingiz!") : '✅ Ketish belgilandi!') + '\n' + result);
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
  const allRows = buildRows(logs);
  const rows = showAll ? allRows : allRows.filter((r) => r.dateKey === filterDate);

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

  const card = 'bg-slate-900 border border-slate-800 rounded-2xl p-4';
  const input =
    'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-28">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-4xl font-black font-mono">{hhmm(clock)}</div>
          <div className="text-right">
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                isOnline ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              }`}
            >
              {isOnline ? 'ONLINE' : 'OFLAYN'}
            </span>
            <div className="text-[11px] text-slate-400 mt-1">
              Ish vaqti: {isSat ? '08:30 / 13:00' : '08:30 / 16:00'}
            </div>
          </div>
        </div>

        {tab === 'asosiy' && (
          <>
            {!profile ? (
              <form onSubmit={handleSaveProfile} className={`${card} space-y-2.5`}>
                <h3 className="text-xs font-bold text-teal-400 text-center">Xodim profilini kiriting</h3>
                <input
                  className={`${input} font-mono`}
                  maxLength={14}
                  inputMode="numeric"
                  value={pinflInput}
                  onChange={(e) => setPinflInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="14 xonali JSHR..."
                />
                <input className={input} value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Ism Familiyangiz (F.I.O)" />
                <select className={input} value={lavozimInput} onChange={(e) => setLavozimInput(e.target.value)}>
                  <option>O'qituvchi</option>
                  <option>ICHTU</option>
                  <option>Ma'muriyat</option>
                  <option>Xodim</option>
                </select>
                <button type="button" onClick={pickProfilePhoto} className="w-full py-2 bg-slate-800 rounded-xl text-xs font-bold">
                  {photoInput ? '✅ Rasm olindi (qayta olish)' : '📸 Profil rasmini olish'}
                </button>
                {photoInput && <img src={photoInput} alt="" className="w-20 h-20 rounded-2xl object-cover mx-auto" />}
                <button type="submit" className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 rounded-xl text-xs font-bold">
                  Saqlash va Boshlash
                </button>
              </form>
            ) : (
              <>
                <div className={`${card} flex items-center justify-between`}>
                  <div className="overflow-hidden pr-2">
                    <h2 className="font-bold text-sm truncate">{profile.fullName}</h2>
                    <p className="text-[11px] text-teal-400 font-mono">{profile.lavozimi} | {profile.pinfl}</p>
                  </div>
                  <img src={profile.photoUrl} alt="" className="w-14 h-14 rounded-2xl object-cover border-2 border-teal-400" />
                </div>

                <div className={`${card} space-y-1`}>
                  <div className="flex justify-between text-xs">
                    <span className={`font-bold ${inZone ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {inZone ? '● Davomat hududidasiz' : '● Hududdan tashqaridasiz'}
                    </span>
                    <span className="text-slate-400 font-mono">{distance !== null ? `${distance} m` : 'GPS...'}</span>
                  </div>
                  {gpsError && <div className="text-[11px] text-amber-400">{gpsError}</div>}
                  {!gpsError && !inZone && distance !== null && (
                    <div className="text-[11px] text-slate-400">Davomat uchun {CONFIG.checkInRadiusMeters}m ichiga kiring.</div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={busy}
                    onClick={() => handleAttendance('keldi')}
                    className="py-4 bg-gradient-to-r from-emerald-600 to-teal-600 disabled:opacity-50 active:scale-95 rounded-2xl text-sm font-bold"
                  >
                    📸 Keldim
                    <div className="text-[10px] font-normal text-emerald-100">Jonli rasm bilan</div>
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleAttendance('ketdi')}
                    className="py-4 bg-gradient-to-r from-rose-600 to-orange-600 disabled:opacity-50 active:scale-95 rounded-2xl text-sm font-bold"
                  >
                    📸 Ketdim
                    <div className="text-[10px] font-normal text-rose-100">{isSat ? '13:00 dan keyin' : '16:00 dan keyin'}</div>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className={card}>
                    <div className="text-[10px] text-slate-400">Kirish</div>
                    <div className="text-sm font-bold font-mono">{myIn ? myIn.timeOnly : '--:--'}</div>
                    {myIn && (
                      <div className={`text-[10px] font-bold ${myIn.late ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {myIn.late ? 'Kechikdingiz' : "O'z vaqtida"}
                      </div>
                    )}
                  </div>
                  <div className={card}>
                    <div className="text-[10px] text-slate-400">Chiqish</div>
                    <div className="text-sm font-bold font-mono">{myOut ? myOut.timeOnly : '--:--'}</div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {tab === 'profil' && (
          <div className={`${card} text-center space-y-3`}>
            <h2 className="text-sm font-bold">Xodim profili</h2>
            {profile ? (
              <>
                <img src={profile.photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover mx-auto border-2 border-teal-400" />
                <div className="font-bold text-sm">{profile.fullName}</div>
                <div className="text-xs text-slate-400 font-mono">{profile.lavozimi} | {profile.pinfl}</div>
                <button
                  onClick={() => {
                    if (window.confirm("Profilni o'zgartirasizmi?")) {
                      localStorage.removeItem('user_profile');
                      setProfile(null);
                      setTab('asosiy');
                    }
                  }}
                  className="px-4 py-2 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold"
                >
                  Profilni yangilash
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-400">Profil kiritilmagan.</p>
            )}
          </div>
        )}

        {tab === 'admin' && (
          <div className={`${card} space-y-4`}>
            {!adminOk ? (
              <form onSubmit={handleAdminLogin} className="space-y-3 max-w-xs mx-auto py-4">
                <h2 className="text-sm font-bold text-center">Admin paneliga kirish</h2>
                <input type="password" className={`${input} text-center font-mono`} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Parol..." />
                <button className="w-full py-2.5 bg-rose-600 rounded-xl text-xs font-bold">Kirish</button>
              </form>
            ) : (
              <>
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <h2 className="text-sm font-bold">🛡️ Davomat jadvali</h2>
                  <button onClick={() => setAdminOk(false)} className="px-3 py-1.5 bg-slate-800 text-xs rounded-xl">Chiqish</button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" className={`${input} !w-auto`} value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setShowAll(false); }} />
                  <label className="text-xs text-slate-300 flex items-center gap-1">
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Hammasi
                  </label>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button onClick={refresh} className="px-3 py-1.5 bg-indigo-600 text-xs rounded-xl">Yangilash</button>
                  <button onClick={downloadCsv} className="px-3 py-1.5 bg-emerald-600 text-xs rounded-xl">⬇️ CSV yuklab olish</button>
                  <button onClick={sendCsvToTelegram} className="px-3 py-1.5 bg-sky-600 text-xs rounded-xl">📨 Telegramga CSV</button>
                  <button onClick={handleClear} className="px-3 py-1.5 bg-rose-600 text-xs rounded-xl">Tozalash</button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-slate-400 text-left border-b border-slate-800">
                        <th className="py-1 pr-2">F.I.O</th>
                        {showAll && <th className="pr-2">Sana</th>}
                        <th className="pr-2">Keldi</th>
                        <th className="pr-2">Ketdi</th>
                        <th>Holat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={5} className="text-center text-slate-500 py-4">Yozuvlar yo'q</td></tr>
                      )}
                      {rows.map((r) => (
                        <tr key={r.pinfl + r.dateKey} className="border-b border-slate-800/60">
                          <td className="py-1.5 pr-2">
                            <div className="font-bold">{r.name}</div>
                            <div className="text-slate-500">{r.lavozimi}</div>
                          </td>
                          {showAll && <td className="pr-2 font-mono">{r.dateKey}</td>}
                          <td className="pr-2 font-mono">{r.keldi || '--:--'}</td>
                          <td className="pr-2 font-mono">{r.ketdi || '--:--'}</td>
                          <td className={r.late || r.chiqdi ? 'text-rose-400' : 'text-emerald-400'}>
                            {r.keldi ? (r.late ? 'Kechikdi' : "O'z vaqtida") : '-'}
                            {r.chiqdi ? ` 🚨 ${r.chiqdi}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-[10px] text-slate-500">
                  Ro'yxatdan o'tgan xodimlar (shu telefonda): {users.length}. Barcha xodimlarning keldi/ketdi xabarlari
                  Telegram admin botiga tushadi.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <nav className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[92%] max-w-md bg-slate-900/95 border border-slate-800 px-3 py-2 rounded-3xl shadow-2xl z-50 flex justify-around">
        {([
          ['asosiy', '🏠', 'Asosiy'],
          ['profil', '👤', 'Profil'],
          ['admin', '🛡️', 'Admin'],
        ] as const).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => { setTab(id); if (id !== 'admin') setAdminOk(false); else refresh(); }}
            className={`flex flex-col items-center px-5 py-1.5 rounded-2xl ${tab === id ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white' : 'text-slate-400'}`}
          >
            <span className="text-sm">{icon}</span>
            <span className="text-[9px] font-bold">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
  }

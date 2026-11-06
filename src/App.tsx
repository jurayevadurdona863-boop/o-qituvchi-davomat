import React, { useState, useEffect } from 'react';

const COLLEGE_CONFIG = {
  latitude: 38.971199,
  longitude: 66.707470,
  radiusMeters: 500,
};

const ADMIN_PASSWORD = "2294";

const TELEGRAM_BOT_TOKEN = "9241880191:AAEGdwBHjqdBmqLv4hOrL8bIvJl2bRAV8QE";
const TELEGRAM_CHAT_IDS = [
  "1179846016",
  "727029645",
  "1838498079",
  "1611805500"
];

interface UserProfile {
  pinfl: string;
  fullName: string;
  photoUrl: string;
}

interface AttendanceLog {
  pinfl: string;
  name: string;
  status: string;
  lat: number;
  lng: number;
  timestamp: string;
  dateKey: string;
}

interface PendingTelegramMessage {
  id: string;
  text: string;
}

function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Telegram xabarlarini o'tkazish (Internet bor bo'lsa darhol, yo'q bo'lsa navbatga saqlash)
async function dispatchTelegramAlert(text: string) {
  const isOnline = navigator.onLine;

  if (isOnline) {
    let success = false;
    for (const chatId of TELEGRAM_CHAT_IDS) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
          }),
        });
        if (res.ok) success = true;
      } catch (err) {
        console.error(`Telegram xatolik (${chatId}):`, err);
      }
    }
    if (!success) {
      savePendingMessage(text);
    }
  } else {
    savePendingMessage(text);
  }
}

// Oflayn xabarlarni saqlash
function savePendingMessage(text: string) {
  const pending: PendingTelegramMessage[] = JSON.parse(localStorage.getItem('pending_telegram_msgs') || '[]');
  pending.push({ id: Date.now().toString(), text });
  localStorage.setItem('pending_telegram_msgs', JSON.stringify(pending));
}

// Internet yonganda to'planib qolgan xabarlarni Telegramga yuborish
async function flushPendingMessages() {
  if (!navigator.onLine) return;
  const pending: PendingTelegramMessage[] = JSON.parse(localStorage.getItem('pending_telegram_msgs') || '[]');
  if (pending.length === 0) return;

  const remaining: PendingTelegramMessage[] = [];

  for (const item of pending) {
    let sent = false;
    for (const chatId of TELEGRAM_CHAT_IDS) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `${item.text}\n\n<i>📡 (Oflayn rejimda qayd etilgan, internet yongach yuborildi)</i>`,
            parse_mode: 'HTML',
          }),
        });
        if (res.ok) sent = true;
      } catch (err) {
        console.error("Qayta yuborishda xato:", err);
      }
    }
    if (!sent) {
      remaining.push(item);
    }
  }

  localStorage.setItem('pending_telegram_msgs', JSON.stringify(remaining));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'app' | 'geofence' | 'sqlite' | 'api' | 'admin'>('app');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [isAuthenticatedAdmin, setIsAuthenticatedAdmin] = useState<boolean>(false);
  
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);

  const [pinflInput, setPinflInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [photoInput, setPhotoInput] = useState<string | null>(null);

  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [insideZone, setInsideZone] = useState<boolean>(false);
  const [attendanceStatus, setAttendanceStatus] = useState<string>('Kutilmoqda...');
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const savedProfile = localStorage.getItem('user_profile');
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile));
    }
    loadLogs();

    const handleOnline = () => {
      setIsOnline(true);
      flushPendingMessages();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    flushPendingMessages();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadLogs = () => {
    const logs = JSON.parse(localStorage.getItem('persistent_attendance_logs') || '[]');
    setAttendanceLogs(logs.reverse());
  };

  useEffect(() => {
    if (!profile || activeTab === 'admin') return;

    if (!navigator.geolocation) {
      alert("GPS qo'llab-quvvatlanmaydi!");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const dist = getDistanceInMeters(
          latitude,
          longitude,
          COLLEGE_CONFIG.latitude,
          COLLEGE_CONFIG.longitude
        );
        setCurrentDistance(dist);

        const isInside = dist <= COLLEGE_CONFIG.radiusMeters;
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        const dateKey = now.toISOString().split('T')[0];

        const existingLogs: AttendanceLog[] = JSON.parse(localStorage.getItem('persistent_attendance_logs') || '[]');
        const todayUserLogs = existingLogs.filter(l => l.pinfl === profile.pinfl && l.dateKey === dateKey);
        const hasCheckedInToday = todayUserLogs.some(l => l.status.includes('Keldi') || l.status.includes('Kechikdi'));

        if (isInside && !insideZone) {
          setInsideZone(true);
          
          const hours = now.getHours();
          const minutes = now.getMinutes();
          const totalMinutes = hours * 60 + minutes;
          const limitMinutes = 8 * 60 + 30; // 08:30

          let statusText = '🟢 O\'z vaqtida keldi';
          let telegramMsg = `<b>🟢 DAVOMAT: KELDI</b>\n\n👤 <b>Xodim:</b> ${profile.fullName}\n🆔 <b>JSHR:</b> <code>${profile.pinfl}</code>\n⏰ <b>Vaqt:</b> ${timeString}\n📍 <b>Holat:</b> O'z vaqtida keldi`;

          if (totalMinutes > limitMinutes) {
            statusText = '⚠️ Kechikib keldi (08:30 dan keyin)';
            telegramMsg = `<b>⚠️ OGOHLANTIRISH: KECHIKDI!</b>\n\n👤 <b>Xodim:</b> ${profile.fullName}\n🆔 <b>JSHR:</b> <code>${profile.pinfl}</code>\n⏰ <b>Vaqt:</b> ${timeString}\n❗ <b>Izoh:</b> 08:30 dan keyin keldi`;
          }

          if (!hasCheckedInToday) {
            setAttendanceStatus(statusText);
            setLastCheckTime(timeString);
            saveAttendanceRecord(profile, statusText, latitude, longitude, dateKey);
            dispatchTelegramAlert(telegramMsg);
          }
        } else if (!isInside && insideZone) {
          setInsideZone(false);

          const hours = now.getHours();
          const minutes = now.getMinutes();
          const totalMinutes = hours * 60 + minutes;
          const endWorkMinutes = 16 * 60; // 16:00

          let statusText = '🔴 Vaqtida chiqib ketdi (Ish tugadi)';
          let telegramMsg = `<b>🔴 DAVOMAT: KETDI</b>\n\n👤 <b>Xodim:</b> ${profile.fullName}\n🆔 <b>JSHR:</b> <code>${profile.pinfl}</code>\n⏰ <b>Vaqt:</b> ${timeString}`;

          if (totalMinutes < endWorkMinutes) {
            statusText = '🚨 Ruxsatsiz chiqib ketdi (16:00 gacha)';
            telegramMsg = `<b>🚨 SHOSHILINCH ALERT! RUXSATSIZ CHIQIB KETDI!</b>\n\n👤 <b>Xodim:</b> ${profile.fullName}\n🆔 <b>JSHR:</b> <code>${profile.pinfl}</code>\n⏰ <b>Vaqt:</b> ${timeString}\n⚠️ <b>Izoh:</b> Ish vaqti tugamasdan (16:00 gacha) hududdan chiqdi!`;
          }

          setAttendanceStatus(statusText);
          setLastCheckTime(timeString);
          saveAttendanceRecord(profile, statusText, latitude, longitude, dateKey);
          dispatchTelegramAlert(telegramMsg);
        }
      },
      (error) => console.error('GPS Xato:', error),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [profile, insideZone, activeTab]);

  const saveAttendanceRecord = (user: UserProfile, status: string, lat: number, lng: number, dateKey: string) => {
    const record: AttendanceLog = {
      pinfl: user.pinfl,
      name: user.fullName,
      status,
      lat,
      lng,
      timestamp: new Date().toLocaleString(),
      dateKey,
    };
    const history = JSON.parse(localStorage.getItem('persistent_attendance_logs') || '[]');
    history.push(record);
    localStorage.setItem('persistent_attendance_logs', JSON.stringify(history));
    loadLogs();
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoInput(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinflInput.length !== 14) {
      alert("JSHR 14 xonali bo'lishi kerak!");
      return;
    }
    if (!nameInput.trim() || !photoInput) {
      alert("Barcha maydonlarni to'ldiring va rasm yuklang!");
      return;
    }

    const newProfile: UserProfile = {
      pinfl: pinflInput,
      fullName: nameInput,
      photoUrl: photoInput,
    };

    localStorage.setItem('user_profile', JSON.stringify(newProfile));
    setProfile(newProfile);
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticatedAdmin(true);
      setPasswordInput('');
    } else {
      alert("Parol noto'g'ri!");
    }
  };

  const handleClearLogs = () => {
    if (window.confirm("Barcha davomat tarixini o'chirmoqchimisiz?")) {
      localStorage.removeItem('persistent_attendance_logs');
      loadLogs();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col font-sans">
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex flex-wrap justify-between items-center gap-2 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center shadow-md text-slate-950 font-black text-sm">
            🏢
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-extrabold text-white tracking-wide">Texnikum Davomati</h1>
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${isOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                {isOnline ? 'ONLINE' : 'OFLAYN NAZORAT'}
              </span>
            </div>
            <p className="text-[10px] text-teal-400 font-medium">GPS Geofence & Telegram Tizimi</p>
          </div>
        </div>

        <nav className="flex items-center space-x-1 overflow-x-auto py-1">
          <button
            onClick={() => setActiveTab('app')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'app' ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}
          >
            Ilova
          </button>
          <button
            onClick={() => setActiveTab('geofence')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'geofence' ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}
          >
            Geozona
          </button>
          <button
            onClick={() => setActiveTab('sqlite')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'sqlite' ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}
          >
            Jurnal ({attendanceLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'api' ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}
          >
            Render API
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1 ${activeTab === 'admin' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30' : 'bg-slate-800/80 text-rose-300 hover:bg-slate-700'}`}
          >
            <span>🛡️ Admin</span>
          </button>
        </nav>
      </header>

      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        {activeTab === 'app' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

              <h2 className="text-base font-bold text-teal-400 mb-1">O'qituvchi Davomati Simulyatori</h2>
              <p className="text-xs text-slate-400 mb-5">14 xonali JSHR kiriting, rasmingizni yuklang va geozona orqali avtomatik nazoratdan o'ting.</p>

              {!profile ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                    <div>
                      <label className="text-xs text-slate-300 block mb-1 font-medium">JSHR / PINFL (14 raqam):</label>
                      <input
                        type="text"
                        maxLength={14}
                        value={pinflInput}
                        onChange={(e) => setPinflInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="3200195..."
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-teal-500 shadow-inner"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1 font-medium">Ism va Familiyangiz:</label>
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="Aliyev Vali"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500 shadow-inner"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1 font-medium">Rasmingiz:</label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        onChange={handlePhotoUpload}
                        className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-600 file:text-white file:shadow-md cursor-pointer"
                        required
                      />
                    </div>
                    {photoInput && (
                      <div className="flex justify-center mt-3">
                        <img src={photoInput} alt="Preview" className="w-16 h-16 object-cover rounded-full border-2 border-teal-400 shadow-lg" />
                      </div>
                    )}
                  </div>
                  <button type="submit" className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-teal-600/30 transition-all text-sm">
                    Saqlash va Boshlash
                  </button>
                </form>
              ) : (
                <div className="space-y-5 text-center">
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between shadow-inner">
                    <div className="text-left overflow-hidden pr-2">
                      <span className="text-[10px] uppercase tracking-wider text-teal-400 font-semibold block mb-0.5">Xodim Profili</span>
                      <h3 className="font-bold text-white text-sm truncate">{profile.fullName}</h3>
                      <p className="text-[11px] text-slate-400 font-mono">JSHR: {profile.pinfl}</p>
                      <button
                        onClick={() => {
                          if (window.confirm("Profilni o'zgartirasizmi?")) {
                            localStorage.removeItem('user_profile');
                            setProfile(null);
                          }
                        }}
                        className="text-[10px] text-rose-400 hover:underline mt-1 block font-medium"
                      >
                        Profilni o'zgartirish
                      </button>
                    </div>
                    <div className="relative flex-shrink-0">
                      <img src={profile.photoUrl} alt={profile.fullName} className="w-16 h-16 rounded-2xl object-cover border-2 border-teal-400 shadow-xl" />
                      <span className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-slate-950 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800/80 space-y-1 shadow-inner">
                    <div className="text-xs text-slate-400 font-medium">Texnikum markazigacha masofa:</div>
                    <div className="text-3xl font-extrabold text-teal-400 font-mono tracking-tight">
                      {currentDistance !== null ? `${currentDistance} m` : 'GPS aniqlanmoqda...'}
                    </div>
                    <div className="text-[10px] text-slate-500">(Geozona chegarasi: {COLLEGE_CONFIG.radiusMeters}m)</div>
                  </div>

                  <div className={`p-4 rounded-2xl border shadow-md transition-all ${insideZone ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : 'bg-rose-950/40 border-rose-500/50 text-rose-300'}`}>
                    <div className="text-sm font-bold">{attendanceStatus}</div>
                    {lastCheckTime && <div className="text-xs opacity-80 mt-1 font-mono">Vaqt: {lastCheckTime}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'geofence' && (
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-teal-400">Geozona Parametrlari</h2>
            <p className="text-xs text-slate-400">Texnikumning belgilangan GPS koordinatalari va geofence radiusi.</p>
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-2 text-xs font-mono text-slate-300">
              <div>Kenglik (Latitude): {COLLEGE_CONFIG.latitude}</div>
              <div>Uzunlik (Longitude): {COLLEGE_CONFIG.longitude}</div>
              <div>Ruxsat etilgan radius: {COLLEGE_CONFIG.radiusMeters} metr</div>
            </div>
          </div>
        )}

        {activeTab === 'sqlite' && (
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-white">Doimiy Davomat Jurnali</h2>
              <button onClick={handleClearLogs} className="text-xs text-rose-400 hover:underline font-medium">Tarixni tozalash</button>
            </div>
            <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
              {attendanceLogs.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">Hozircha davomat yozuvlari mavjud emas.</p>
              ) : (
                attendanceLogs.map((log, index) => (
                  <div key={index} className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80 text-xs space-y-1 shadow-sm">
                    <div className="flex justify-between font-bold text-white">
                      <span>{log.name}</span>
                      <span className={log.status.includes('O\'z vaqtida') ? 'text-emerald-400' : 'text-rose-400'}>{log.status}</span>
                    </div>
                    <div className="text-slate-400 font-mono text-[10px]">JSHR: {log.pinfl}</div>
                    <div className="text-slate-500 text-[10px] flex justify-between">
                      <span>Vaqt: {log.timestamp}</span>
                      <span>GPS: {log.lat.toFixed(4)}, {log.lng.toFixed(4)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-teal-400">Render API Holati</h2>
            <p className="text-xs text-slate-400">Tizim vaqt va geofence ma'lumotlarini Render serveri orqali sinxronizatsiya qiladi.</p>
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 text-xs font-mono text-emerald-400 shadow-inner">
              🟢 API Ulanishi faol va barqaror ishlamoqda.
            </div>
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-4">
            {!isAuthenticatedAdmin ? (
              <form onSubmit={handleAdminLogin} className="space-y-4 max-w-sm mx-auto py-6">
                <div className="bg-slate-950/70 p-5 rounded-2xl border border-slate-800/80 space-y-3 text-center shadow-inner">
                  <h2 className="text-sm font-bold text-white">Admin Paneliga Kirish</h2>
                  <p className="text-[11px] text-slate-400">Maxfiy parolni kiriting</p>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Parol..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500 font-mono text-center shadow-inner"
                    required
                  />
                </div>
                <button type="submit" className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold rounded-xl shadow-lg shadow-rose-600/30 transition-all text-sm">
                  Tasdiqlash va Kirish
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-base font-bold text-white">🛡️ Admin Boshqaruv Paneli</h2>
                    <p className="text-xs text-slate-400">Barcha xodimlarning kechikish va ruxsatsiz chiqish tarixi</p>
                  </div>
                  <button onClick={() => setIsAuthenticatedAdmin(false)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-xl font-medium">
                    Chiqish
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
                  {attendanceLogs.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">Hozircha yozuvlar mavjud emas.</p>
                  ) : (
                    attendanceLogs.map((log, index) => (
                      <div key={index} className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80 text-xs space-y-1 shadow-sm">
                        <div className="flex justify-between font-bold text-white">
                          <span>{log.name}</span>
                          <span className={log.status.includes('O\'z vaqtida') ? 'text-emerald-400' : 'text-rose-400'}>{log.status}</span>
                        </div>
                        <div className="text-slate-400 font-mono text-[10px]">JSHR: {log.pinfl}</div>
                        <div className="text-slate-500 text-[10px] flex justify-between">
                          <span>Vaqt: {log.timestamp}</span>
                          <span>GPS: {log.lat.toFixed(4)}, {log.lng.toFixed(4)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

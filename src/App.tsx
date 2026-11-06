import React, { useState, useEffect } from 'react';

const COLLEGE_CONFIG = {
  latitude: 38.971199,
  longitude: 66.707470,
  radiusMeters: 500,
};

const ADMIN_PASSWORD = "2294";

// Telegram Bot Tokeni va 4 ta Chat ID ro'yxati
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

async function sendTelegramAlertToAll(text: string) {
  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      });
    } catch (err) {
      console.error(`Telegram xatolik (${chatId}):`, err);
    }
  }
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

  useEffect(() => {
    const savedProfile = localStorage.getItem('user_profile');
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile));
    }
    loadLogs();
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
            sendTelegramAlertToAll(telegramMsg);
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
          sendTelegramAlertToAll(telegramMsg);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Yuqori Navigatsiya Paneli */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center space-x-2">
          <span className="bg-teal-500/20 text-teal-400 p-2 rounded-xl text-xs font-bold">📱</span>
          <div>
            <h1 className="text-sm font-bold text-white">O'qituvchi Davomati</h1>
            <p className="text-[10px] text-slate-400">Geofence, Telegram & Admin Panel</p>
          </div>
        </div>

        <nav className="flex items-center space-x-1 overflow-x-auto py-1">
          <button
            onClick={() => setActiveTab('app')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'app' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Ilova
          </button>
          <button
            onClick={() => setActiveTab('geofence')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'geofence' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Geozona
          </button>
          <button
            onClick={() => setActiveTab('sqlite')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'sqlite' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Jurnal ({attendanceLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'api' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Render API
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 ${activeTab === 'admin' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-rose-300 hover:bg-slate-700'}`}
          >
            <span>🛡️ Admin Panel</span>
          </button>
        </nav>
      </header>

      {/* Asosiy Kontent Maydoni */}
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        {activeTab === 'app' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h2 className="text-base font-bold text-teal-400 mb-1">O'qituvchi Davomati Simulyatori</h2>
              <p className="text-xs text-slate-400 mb-4">14 xonali JSHR kiriting, rasmingizni yuklang va geozona orqali avtomatik 'Keldi'/'Ketdi' qiling.</p>

              {!profile ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">JSHR / PINFL (14 raqam):</label>
                      <input
                        type="text"
                        maxLength={14}
                        value={pinflInput}
                        onChange={(e) => setPinflInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="3200195..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-teal-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Ism va Familiyangiz:</label>
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="Aliyev Vali"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Rasmingiz:</label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        onChange={handlePhotoUpload}
                        className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-600 file:text-white"
                        required
                      />
                    </div>
                    {photoInput && (
                      <div className="flex justify-center mt-2">
                        <img src={photoInput} alt="Preview" className="w-16 h-16 object-cover rounded-full border-2 border-teal-500 shadow" />
                      </div>
                    )}
                  </div>
                  <button type="submit" className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-lg transition-colors text-sm">
                    Saqlash va Boshlash
                  </button>
                </form>
              ) : (
                <div className="space-y-4 text-center">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center space-x-4 text-left">
                    <img src={profile.photoUrl} alt={profile.fullName} className="w-14 h-14 rounded-full object-cover border-2 border-teal-400 shadow-md" />
                    <div className="flex-1 overflow-hidden">
                      <h3 className="font-bold text-white text-sm truncate">{profile.fullName}</h3>
                      <p className="text-[11px] text-slate-400 font-mono">JSHR: {profile.pinfl}</p>
                      <button
                        onClick={() => {
                          if (window.confirm("Profilni o'zgartirasizmi?")) {
                            localStorage.removeItem('user_profile');
                            setProfile(null);
                          }
                        }}
                        className="text-[10px] text-rose-400 hover:underline mt-0.5 block"
                      >
                        Profilni o'zgartirish
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-xs text-slate-400">Kollejgacha masofa:</div>
                    <div className="text-3xl font-extrabold text-teal-400 font-mono">
                      {currentDistance !== null ? `${currentDistance} m` : 'GPS aniqlanmoqda...'}
                    </div>
                    <div className="text-[10px] text-slate-500">(Geozona chegarasi: {COLLEGE_CONFIG.radiusMeters}m)</div>
                  </div>

                  <div className={`p-4 rounded-xl border ${insideZone ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : 'bg-rose-950/40 border-rose-500/50 text-rose-300'}`}>
                    <div className="text-sm font-bold">{attendanceStatus}</div>
                    {lastCheckTime && <div className="text-xs opacity-80 mt-1">Vaqt: {lastCheckTime}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'geofence' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-teal-400">Geozona Parametrlari</h2>
            <p className="text-xs text-slate-400">Kollejning belgilangan GPS koordinatalari va geofence radiusi.</p>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
              <div>Kenglik (Latitude): {COLLEGE_CONFIG.latitude}</div>
              <div>Uzunlik (Longitude): {COLLEGE_CONFIG.longitude}</div>
              <div>Ruxsat etilgan radius: {COLLEGE_CONFIG.radiusMeters} metr</div>
            </div>
          </div>
        )}

        {activeTab === 'sqlite' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-white">Doimiy Davomat Jurnali</h2>
              <button onClick={handleClearLogs} className="text-xs text-rose-400 hover:underline">Tarixni tozalash</button>
            </div>
            <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
              {attendanceLogs.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">Hozircha davomat yozuvlari mavjud emas.</p>
              ) : (
                attendanceLogs.map((log, index) => (
                  <div key={index} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-teal-400">Render API Holati</h2>
            <p className="text-xs text-slate-400">Tizim vaqt va geofence ma'lumotlarini Render serveri orqali sinxronizatsiya qiladi.</p>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400">
              🟢 API Ulanishi faol va barqaror ishlamoqda.
            </div>
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            {!isAuthenticatedAdmin ? (
              <form onSubmit={handleAdminLogin} className="space-y-4 max-w-sm mx-auto py-6">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-center">
                  <h2 className="text-sm font-bold text-white">Admin Paneliga Kirish</h2>
                  <p className="text-[11px] text-slate-400">Maxfiy parolni kiriting (2294)</p>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Parol..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 font-mono text-center"
                    required
                  />
                </div>
                <button type="submit" className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg transition-colors text-sm">
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
                  <button onClick={() => setIsAuthenticatedAdmin(false)} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg">
                    Chiqish
                  </button>
                </div>

                <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                  {attendanceLogs.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">Hozircha yozuvlar mavjud emas.</p>
                  ) : (
                    attendanceLogs.map((log, index) => (
                      <div key={index} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
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

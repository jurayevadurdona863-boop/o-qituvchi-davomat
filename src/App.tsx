import React, { useState, useEffect } from 'react';

const COLLEGE_CONFIG = {
  latitude: 38.971199,
  longitude: 66.707470,
  radiusMeters: 999999,
};

const ADMIN_PASSWORD = "2294";

const TELEGRAM_BOT_TOKEN = "9241880191:AAHfYqQSQC9KOpeAfFdomyft9nhIBm-h6sk";
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
  photoUrl?: string;
  timeOnly: string;
  distanceMeters?: number;
}

interface PendingTelegramMessage {
  id: string;
  text: string;
  photoUrl?: string;
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

async function sendTelegramPhotoAlert(text: string, photoBase64?: string) {
  const isOnline = navigator.onLine;

  if (isOnline) {
    let success = false;
    for (const chatId of TELEGRAM_CHAT_IDS) {
      try {
        if (photoBase64 && photoBase64.startsWith('data:image')) {
          const res = await fetch(photoBase64);
          const blob = await res.blob();
          const formData = new FormData();
          formData.append('chat_id', chatId);
          formData.append('photo', blob, 'xodim.jpg');
          formData.append('caption', text);
          formData.append('parse_mode', 'HTML');

          const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: formData,
          });
          if (tgRes.ok) success = true;
        } else {
          const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
          });
          if (tgRes.ok) success = true;
        }
      } catch (err) {
        console.error(`Telegram xatolik (${chatId}):`, err);
      }
    }
    if (!success) {
      savePendingMessage(text, photoBase64);
    }
  } else {
    savePendingMessage(text, photoBase64);
  }
}

function savePendingMessage(text: string, photoUrl?: string) {
  try {
    const pending: PendingTelegramMessage[] = JSON.parse(localStorage.getItem('pending_telegram_msgs') || '[]');
    pending.push({ id: Date.now().toString(), text, photoUrl });
    localStorage.setItem('pending_telegram_msgs', JSON.stringify(pending));
  } catch (e) {
    console.error("Xabarni saqlashda xatolik:", e);
  }
}

async function flushPendingMessages() {
  if (!navigator.onLine) return;
  const pending: PendingTelegramMessage[] = JSON.parse(localStorage.getItem('pending_telegram_msgs') || '[]');
  if (pending.length === 0) return;

  const remaining: PendingTelegramMessage[] = [];

  for (const item of pending) {
    let sent = false;
    for (const chatId of TELEGRAM_CHAT_IDS) {
      try {
        const fullText = `${item.text}\n\n<i>📡 (Internet tiklangach yuborildi)</i>`;
        if (item.photoUrl && item.photoUrl.startsWith('data:image')) {
          const res = await fetch(item.photoUrl);
          const blob = await res.blob();
          const formData = new FormData();
          formData.append('chat_id', chatId);
          formData.append('photo', blob, 'xodim.jpg');
          formData.append('caption', fullText);
          formData.append('parse_mode', 'HTML');

          const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: formData,
          });
          if (tgRes.ok) sent = true;
        } else {
          const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: fullText, parse_mode: 'HTML' }),
          });
          if (tgRes.ok) sent = true;
        }
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
  const [activeTab, setActiveTab] = useState<'asosiy' | 'davomat' | 'ai' | 'fanlar' | 'profil' | 'admin'>('asosiy');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [isAuthenticatedAdmin, setIsAuthenticatedAdmin] = useState<boolean>(false);
  
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);

  const [pinflInput, setPinflInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [photoInput, setPhotoInput] = useState<string | null>(null);

  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<string>('Tayyor...');
  const [checkInTimeDisplay, setCheckInTimeDisplay] = useState<string>('--:--');
  const [checkOutTimeDisplay, setCheckOutTimeDisplay] = useState<string>('--:--');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
      setCurrentDateStr(now.toLocaleDateString('uz-UZ', options));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedProfile = localStorage.getItem('user_profile');
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        setProfile(parsed);
        const now = new Date();
        const dateKey = now.toISOString().split('T')[0];
        const existingLogs: AttendanceLog[] = JSON.parse(localStorage.getItem('persistent_attendance_logs') || '[]');
        const todayUserLogs = existingLogs.filter(l => l.pinfl === parsed.pinfl && l.dateKey === dateKey);
        
        const checkIn = todayUserLogs.find(l => l.status.includes('Keldi') || l.status.includes('Belgilandi'));
        const checkOut = todayUserLogs.find(l => l.status.includes('Ketdi'));

        if (checkIn) setCheckInTimeDisplay(checkIn.timeOnly);
        if (checkOut) setCheckOutTimeDisplay(checkOut.timeOnly);
      } catch (e) {
        console.error("Profilni o'qishda xatolik:", e);
      }
    }
    loadData();

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

  const loadData = () => {
    try {
      const logs = JSON.parse(localStorage.getItem('persistent_attendance_logs') || '[]');
      setAttendanceLogs([...logs].reverse());

      const users = JSON.parse(localStorage.getItem('registered_users_list') || '[]');
      setRegisteredUsers(users);
    } catch (e) {
      console.error("Ma'lumotlarni yuklashda xatolik:", e);
    }
  };

  useEffect(() => {
    if (!profile) return;

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

        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const timeOnly = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateKey = now.toISOString().split('T')[0];

        const existingLogs: AttendanceLog[] = JSON.parse(localStorage.getItem('persistent_attendance_logs') || '[]');
        const todayUserLogs = existingLogs.filter(l => l.pinfl === profile.pinfl && l.dateKey === dateKey);
        
        const hasCheckedInToday = todayUserLogs.some(l => l.status.includes('Keldi') || l.status.includes('Belgilandi'));

        setAttendanceStatus(`Siz texnikum hududidan tashqaridasiz (${dist} m)`);

        if (!hasCheckedInToday) {
          const statusText = `${timeOnly} – Keldi (${dist}m uzoqlikda)`;
          const telegramMsg = `<b>🟢 XODIM KELDI</b>\n\n👤 <b>F.I.Sh:</b> ${profile.fullName}\n🆔 <b>JSHR:</b> <code>${profile.pinfl}</code>\n⏰ <b>Vaqt:</b> ${timeString}\n📍 <b>Masofa:</b> ${dist} metr`;

          setCheckInTimeDisplay(timeOnly);
          saveAttendanceRecord(profile, statusText, latitude, longitude, dateKey, timeOnly, dist);
          sendTelegramPhotoAlert(telegramMsg, profile.photoUrl);
        }
      },
      (error) => console.error('GPS Xato:', error),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [profile]);

  const saveAttendanceRecord = (user: UserProfile, status: string, lat: number, lng: number, dateKey: string, timeOnly: string, distanceMeters: number) => {
    const record: AttendanceLog = {
      pinfl: user.pinfl,
      name: user.fullName,
      status,
      lat,
      lng,
      timestamp: new Date().toLocaleString(),
      dateKey,
      photoUrl: user.photoUrl,
      timeOnly,
      distanceMeters,
    };
    const history = JSON.parse(localStorage.getItem('persistent_attendance_logs') || '[]');
    history.push(record);
    localStorage.setItem('persistent_attendance_logs', JSON.stringify(history));
    loadData();
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

    try {
      const users: UserProfile[] = JSON.parse(localStorage.getItem('registered_users_list') || '[]');
      if (!users.some(u => u.pinfl === pinflInput)) {
        users.push(newProfile);
        localStorage.setItem('registered_users_list', JSON.stringify(users));

        // Yangi xodim ulanganda Telegram botga xabar yuborish
        const regMsg = `<b>👤 YANGI XODIM TIZIMGA ULANDI</b>\n\n📌 <b>F.I.Sh:</b> ${nameInput}\n🆔 <b>JSHR:</b> <code>${pinflInput}</code>\n⏰ <b>Vaqt:</b> ${new Date().toLocaleTimeString()}`;
        sendTelegramPhotoAlert(regMsg, photoInput);
      }
    } catch (err) {
      console.error(err);
    }

    loadData();
    alert("Profil muvaffaqiyatli saqlandi va botga xabar yuborildi!");
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
      loadData();
    }
  };

  const handleExportCSV = () => {
    if (attendanceLogs.length === 0) {
      alert("Yuklab olish uchun ma'lumotlar mavjud emas!");
      return;
    }
    try {
      const headers = "JSHR,F.I.Sh,Holat,Sana va Vaqt,Masofa(m),GPS\n";
      const rows = attendanceLogs.map(l => `"${l.pinfl}","${l.name}","${l.status}","${l.timestamp}","${l.distanceMeters ?? 'Noma\'lum'}","${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}"`).join("\n");
      const blob = new Blob(["\uFEFF" + headers + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Texnikum_Davomati_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert("Faylni yuklab olishda xatolik yuz berdi.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-28 selection:bg-teal-500 selection:text-slate-950">
      <header className="bg-gradient-to-b from-slate-900 to-slate-950 px-4 pt-4 pb-6 border-b border-slate-800/60 shadow-xl">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex justify-between items-center">
            <button 
              onClick={() => setActiveTab('asosiy')}
              className="text-xs bg-slate-800/80 hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium text-slate-300 transition-all shadow"
            >
              ← Orqaga
            </button>
            <div className="flex items-center space-x-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                {isOnline ? 'ONLINE' : 'OFLAYN'}
              </span>
              <button 
                onClick={() => setActiveTab('admin')} 
                className="text-xs bg-rose-600/20 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl font-bold shadow hover:bg-rose-600 hover:text-white transition-all"
              >
                🛡️ Admin
              </button>
            </div>
          </div>

          {profile ? (
            <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 p-3 rounded-2xl shadow-inner">
              <div className="overflow-hidden pr-2">
                <h2 className="font-bold text-white text-sm truncate">{profile.fullName}</h2>
                <p className="text-[11px] text-teal-400 font-mono">JSHR: {profile.pinfl}</p>
                <button
                  onClick={() => {
                    if (window.confirm("Profilni o'zgartirasizmi?")) {
                      localStorage.removeItem('user_profile');
                      setProfile(null);
                    }
                  }}
                  className="text-[10px] text-rose-400 hover:underline mt-0.5 block font-medium"
                >
                  Profilni o'zgartirish
                </button>
              </div>
              <div className="relative flex-shrink-0">
                <img src={profile.photoUrl} alt={profile.fullName} className="w-14 h-14 rounded-2xl object-cover border-2 border-teal-400 shadow-lg" />
                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-3 shadow-inner">
              <h3 className="text-xs font-bold text-teal-400">Xodim profilini kiriting:</h3>
              <form onSubmit={handleSaveProfile} className="space-y-2.5">
                <input
                  type="text"
                  maxLength={14}
                  value={pinflInput}
                  onChange={(e) => setPinflInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="14 xonali JSHR..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                  required
                />
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ism Familiyangiz"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  required
                />
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handlePhotoUpload}
                  className="w-full text-[11px] text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:font-semibold file:bg-teal-600 file:text-white cursor-pointer"
                  required
                />
                <button type="submit" className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-xs shadow-md transition-all">
                  Saqlash va Boshlash
                </button>
              </form>
            </div>
          )}

          <div className="flex justify-between items-end pt-2">
            <div>
              <div className="text-4xl font-black text-white tracking-tight font-mono">{currentTimeStr || '07:35'}</div>
              <div className="text-xs text-slate-400 capitalize font-medium">{currentDateStr || 'Payshanba, 12-noyabr'}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-2xl text-right shadow-inner">
              <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Ish Vaqti</span>
              <span className="text-sm font-extrabold text-teal-400 font-mono">08:30 / 16:00</span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl shadow-inner space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold flex items-center space-x-1.5 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                <span>Hududdan tashqarida</span>
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                {currentDistance !== null ? `${currentDistance} m` : 'GPS...'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              ⚠️ Siz texnikum hududidan tashqaridasiz
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl shadow-inner flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-sm">
                ➔
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Kirish</span>
                <span className="text-xs font-bold text-white font-mono">{checkInTimeDisplay}</span>
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl shadow-inner flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 font-bold text-sm">
                ←
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Chiqish</span>
                <span className="text-xs font-bold text-white font-mono">{checkOutTimeDisplay}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        {activeTab === 'asosiy' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl text-center shadow-md space-y-1">
                <span className="w-5 h-5 mx-auto bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                <div className="text-xl font-black text-white font-mono">{attendanceLogs.length}</div>
                <div className="text-[10px] text-slate-400 font-medium">Qatnashgan</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl text-center shadow-md space-y-1">
                <span className="w-5 h-5 mx-auto bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center text-[10px] font-bold">!</span>
                <div className="text-xl font-black text-white font-mono">0</div>
                <div className="text-[10px] text-slate-400 font-medium">Qoldirilgan</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl text-center shadow-md space-y-1">
                <span className="w-5 h-5 mx-auto bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-[10px] font-bold">i</span>
                <div className="text-xl font-black text-white font-mono">96</div>
                <div className="text-[10px] text-slate-400 font-medium">Jami soat</div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-white">Ish qoldirish chegarasi</span>
                <span className="font-mono text-teal-400 font-bold">0 / 18 soat</span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                <div className="bg-teal-500 h-full w-0"></div>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Yana 18 soat ish qoldirilsa, profil bloklanadi.</p>
            </div>
          </div>
        )}

        {activeTab === 'davomat' && (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-3 text-center">
            <h2 className="text-sm font-bold text-white">Sizning Holatingiz</h2>
            <p className="text-xs text-slate-400">Davomatingiz avtomatik qayd etildi va faqat rahbar (admin) tomonidan nazorat qilinadi.</p>
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs text-emerald-400 font-mono">
              Kirish vaqti: {checkInTimeDisplay} | Masofa: {currentDistance !== null ? `${currentDistance} m` : 'Aniqlanmoqda...'}
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-3 text-center">
            <h2 className="text-sm font-bold text-teal-400">AI Yordamchi Tizimi</h2>
            <p className="text-xs text-slate-400">Avtomatik bildirishnomalar va xavfsizlik nazorati faol.</p>
          </div>
        )}

        {activeTab === 'fanlar' && (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-3">
            <h2 className="text-sm font-bold text-white">Texnikum Fanlari va Bo'limlari</h2>
            <p className="text-xs text-slate-400">O'qituvchilar va dars jadvallari.</p>
          </div>
        )}

        {activeTab === 'profil' && (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4 text-center">
            <h2 className="text-sm font-bold text-white">Xodim Profili</h2>
            {profile ? (
              <div className="space-y-3">
                <img src={profile.photoUrl} alt={profile.fullName} className="w-20 h-20 rounded-2xl object-cover mx-auto border-2 border-teal-400 shadow-lg" />
                <div>
                  <h3 className="font-bold text-white text-sm">{profile.fullName}</h3>
                  <p className="text-xs text-slate-400 font-mono">JSHR: {profile.pinfl}</p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("Profilni o'zgartirasizmi?")) {
                      localStorage.removeItem('user_profile');
                      setProfile(null);
                    }
                  }}
                  className="px-4 py-2 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold hover:bg-rose-600 hover:text-white transition-all"
                >
                  Profilni yangilash
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Profil ma'lumotlari kiritilmagan.</p>
            )}
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
            {!isAuthenticatedAdmin ? (
              <form onSubmit={handleAdminLogin} className="space-y-3 max-w-xs mx-auto py-4">
                <h2 className="text-sm font-bold text-white text-center">Admin Paneliga Kirish</h2>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Parolni kiriting..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white text-center font-mono focus:outline-none focus:border-teal-500"
                  required
                />
                <button type="submit" className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-md transition-all">
                  Kirish
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <h2 className="text-sm font-bold text-white">🛡️ Admin Boshqaruv Paneli</h2>
                  <div className="flex space-x-2">
                    <button onClick={handleExportCSV} className="px-3 py-1.5 bg-teal-600 text-xs text-white rounded-xl font-medium">Excel</button>
                    <button onClick={handleClearLogs} className="px-3 py-1.5 bg-rose-600 text-xs text-white rounded-xl font-medium">Tozalash</button>
                    <button onClick={() => setIsAuthenticatedAdmin(false)} className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded-xl">Chiqish</button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider">Ilovaga Ulangan Xodimlar ({registeredUsers.length}):</h3>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {registeredUsers.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-3">Hozircha ulangan xodimlar yo'q.</p>
                    ) : (
                      registeredUsers.map((u, i) => (
                        <div key={i} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs flex items-center space-x-2.5">
                          {u.photoUrl && <img src={u.photoUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />}
                          <div className="overflow-hidden">
                            <div className="font-bold text-white truncate">{u.fullName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">JSHR: {u.pinfl}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Davomat Qayd Etganlar:</h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {attendanceLogs.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">Yozuvlar mavjud emas.</p>
                    ) : (
                      attendanceLogs.map((log, index) => (
                        <div key={index} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs flex items-center space-x-3">
                          {log.photoUrl && (
                            <img src={log.photoUrl} alt={log.name} className="w-10 h-10 rounded-xl object-cover border border-rose-500/50 flex-shrink-0" />
                          )}
                          <div className="flex-1 space-y-1 overflow-hidden">
                            <div className="flex justify-between font-bold text-white">
                              <span className="truncate">{log.name}</span>
                              <span className="text-teal-400 font-bold">📍 {log.distanceMeters ?? '?'} m uzoqlikda</span>
                            </div>
                            <div className="text-slate-400 font-mono text-[10px]">JSHR: {log.pinfl}</div>
                            <div className="text-slate-500 text-[10px]">{log.timestamp}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[92%] max-w-md bg-slate-900/95 backdrop-blur-xl border border-slate-800 px-3 py-2 rounded-3xl shadow-2xl z-50 flex justify-between items-center">
        <button
          onClick={() => setActiveTab('asosiy')}
          className={`flex flex-col items-center space-y-0.5 px-3 py-1.5 rounded-2xl transition-all ${activeTab === 'asosiy' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <span className="text-sm">🏠</span>
          <span className="text-[9px] font-bold">Asosiy</span>
        </button>

        <button
          onClick={() => setActiveTab('davomat')}
          className={`flex flex-col items-center space-y-0.5 px-3 py-1.5 rounded-2xl transition-all ${activeTab === 'davomat' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <span className="text-sm">⏱️</span>
          <span className="text-[9px] font-bold">Davomat</span>
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          className={`flex flex-col items-center space-y-0.5 px-3 py-1.5 rounded-2xl transition-all ${activeTab === 'ai' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <span className="text-sm">🤖</span>
          <span className="text-[9px] font-bold">AI</span>
        </button>

        <button
          onClick={() => setActiveTab('fanlar')}
          className={`flex flex-col items-center space-y-0.5 px-3 py-1.5 rounded-2xl transition-all ${activeTab === 'fanlar' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <span className="text-sm">📚</span>
          <span className="text-[9px] font-bold">Fanlar</span>
        </button>

        <button
          onClick={() => setActiveTab('profil') }
          className={`flex flex-col items-center space-y-0.5 px-3 py-1.5 rounded-2xl transition-all ${activeTab === 'profil' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <span className="text-sm">👤</span>
          <span className="text-[9px] font-bold">Profil</span>
        </button>
      </nav>
    </div>
  );
}

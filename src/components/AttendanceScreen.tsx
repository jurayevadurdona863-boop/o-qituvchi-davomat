import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  LogIn,
  LogOut,
  Database,
  Cloud,
  Clock,
  Sparkles,
  User,
  ShieldCheck,
  Activity,
  Layers,
  Info
} from 'lucide-react';
import { COLLEGE_CONFIG, ActionType, AttendanceRecord } from '../types/attendance';
import {
  calculateDistanceMeters,
  PRESET_LOCATIONS,
  PresetLocation,
} from '../services/geofence';
import {
  LocalSqliteStore,
  getStoredTeacher,
  saveStoredTeacher,
  getStoredServerUrl,
} from '../services/storage';
import { submitAttendance } from '../services/api';

interface AttendanceScreenProps {
  isOfflineMode: boolean;
  onNavigateToRadar: () => void;
  onNavigateToSqlite: () => void;
}

export const AttendanceScreen: React.FC<AttendanceScreenProps> = ({
  isOfflineMode,
  onNavigateToRadar,
  onNavigateToSqlite,
}) => {
  // Teacher credentials
  const [jshr, setJshr] = useState<string>('32001951234567');
  const [fullName, setFullName] = useState<string>("Sobirov Jamshid Rustamovich");
  const [selectedPresetId, setSelectedPresetId] = useState<string>('center');

  // GPS coordinates
  const [userLat, setUserLat] = useState<number>(COLLEGE_CONFIG.latitude);
  const [userLng, setUserLng] = useState<number>(COLLEGE_CONFIG.longitude);
  const [distanceMeters, setDistanceMeters] = useState<number>(0);
  const [isInside, setIsInside] = useState<boolean>(true);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Background service state
  const [isBackgroundActive, setIsBackgroundActive] = useState<boolean>(true);
  const [backgroundLastCheck, setBackgroundLastCheck] = useState<string>(new Date().toLocaleTimeString());

  // Submission & UI feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [lastSubmissionMessage, setLastSubmissionMessage] = useState<{
    text: string;
    type: 'success' | 'offline' | 'error';
  } | null>(null);

  // SQLite stats & history
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Recalculate distance whenever coordinates change
  useEffect(() => {
    const dist = calculateDistanceMeters(
      COLLEGE_CONFIG.latitude,
      COLLEGE_CONFIG.longitude,
      userLat,
      userLng
    );
    setDistanceMeters(dist);
    setIsInside(dist <= COLLEGE_CONFIG.radiusMeters);
  }, [userLat, userLng]);

  // Load profile and SQLite data on mount
  useEffect(() => {
    const teacher = getStoredTeacher();
    if (teacher.jshr) {
      setJshr(teacher.jshr);
      setFullName(teacher.fullName);
    }
    refreshRecords();

    // Listen to SQLite store changes
    const handler = () => refreshRecords();
    window.addEventListener('sqlite_cache_updated', handler);
    return () => window.removeEventListener('sqlite_cache_updated', handler);
  }, []);

  const refreshRecords = () => {
    const all = LocalSqliteStore.getAll();
    setRecords(all.slice(0, 10));
    setPendingCount(LocalSqliteStore.getPending().length);
  };

  // Background simulation tick: every 30 seconds checks geofence
  useEffect(() => {
    if (!isBackgroundActive) return;
    const interval = setInterval(() => {
      setBackgroundLastCheck(new Date().toLocaleTimeString());
    }, 30000);
    return () => clearInterval(interval);
  }, [isBackgroundActive]);

  // Preset location selection
  const handleSelectPreset = (preset: PresetLocation) => {
    setSelectedPresetId(preset.id);
    setUserLat(preset.lat);
    setUserLng(preset.lng);
    setGpsError(null);
  };

  // Real browser GPS query
  const handleGetRealGps = () => {
    if (!navigator.geolocation) {
      setGpsError("Brauzeringizda geolokatsiya qo'llab-quvvatlanmaydi.");
      return;
    }
    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLat(position.coords.latitude);
        setUserLng(position.coords.longitude);
        setSelectedPresetId('real_gps');
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        setGpsError(`GPS xatosi: ${error.message}. Test koordinatalaridan foydalaning.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Submit attendance (Keldi or Ketdi)
  const handleAttendanceAction = async (actionType: ActionType) => {
    if (jshr.length !== 14) {
      setLastSubmissionMessage({
        text: "Iltimos, 14 xonali JSHR (PINFL) raqamingizni to'liq kiriting!",
        type: 'error'
      });
      return;
    }

    // Save profile for reuse
    saveStoredTeacher({ jshr, fullName });

    setIsSubmitting(true);
    setLastSubmissionMessage(null);

    const serverUrl = getStoredServerUrl();

    const result = await submitAttendance({
      jshr,
      latitude: userLat,
      longitude: userLng,
      action_type: actionType,
      distance_meters: distanceMeters,
      within_geofence: isInside,
      serverUrl,
      isOfflineMode,
      deviceInfo: 'Flutter Android (Pixel 8 Pro, SDK 34)'
    });

    setIsSubmitting(false);

    if (result.status === 'synced_online') {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#0d9488', '#14b8a6', '#2dd4bf', '#ffffff']
      });
      setLastSubmissionMessage({
        text: `✓ ${actionType} davomati Render serveriga muvaffaqiyatli yuborildi! (Masofa: ${distanceMeters}m)`,
        type: 'success'
      });
    } else if (result.status === 'cached_offline') {
      setLastSubmissionMessage({
        text: `💾 ${actionType} davomati SQLite keshiga saqlandi! Internet ulanganda avtomatik sinxronlanadi.`,
        type: 'offline'
      });
    } else {
      setLastSubmissionMessage({
        text: `Xatolik: ${result.message}`,
        type: 'error'
      });
    }

    refreshRecords();
  };

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4">
      {/* Top App Bar inside Phone */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">O'qituvchi Davomati</h1>
            <p className="text-[11px] text-slate-400 truncate max-w-[190px]">
              {COLLEGE_CONFIG.name}
            </p>
          </div>
        </div>

        {/* Offline Badge if active */}
        {isOfflineMode ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <span>OFLAYN</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <span>ONLAYN</span>
          </div>
        )}
      </div>

      {/* Geofence Status Card */}
      <div
        className={`p-3.5 rounded-2xl border transition-all ${
          isInside
            ? 'bg-emerald-950/30 border-emerald-800/60 shadow-lg shadow-emerald-950/20'
            : 'bg-amber-950/30 border-amber-800/60 shadow-lg shadow-amber-950/20'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isInside ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {isInside ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white">
                  {isInside ? "Kollej Hududi Ichidasiz" : "Kollej Hududidan Tashqaridasiz"}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                    isInside ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {isInside ? 'Ruxsat etilgan' : 'Geozonadan tashqari'}
                </span>
              </div>

              <p className="text-xs text-slate-300 mt-1">
                Kollej markazigacha masofa: <span className="font-bold font-mono text-white">{distanceMeters} metr</span>{' '}
                <span className="text-[11px] text-slate-400">(Chegara: {COLLEGE_CONFIG.radiusMeters}m)</span>
              </p>

              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                <span>Lat: {userLat.toFixed(6)}</span>
                <span>·</span>
                <span>Lng: {userLng.toFixed(6)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleGetRealGps}
            disabled={isLocating}
            title="Haqiqiy GPS joylashuvni yangilash"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-teal-400' : ''}`} />
          </button>
        </div>

        {/* GPS Error message if any */}
        {gpsError && (
          <p className="text-[11px] text-amber-300 mt-2 bg-amber-950/60 p-1.5 rounded border border-amber-800/40">
            {gpsError}
          </p>
        )}

        {/* Quick GPS Location Switcher */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/70">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
            <span>GPS Sinov Nuqtasi:</span>
            <button
              onClick={onNavigateToRadar}
              className="text-teal-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>Xaritani ko'rish</span>
              <span>→</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_LOCATIONS.slice(0, 4).map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`text-left px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all truncate border ${
                  selectedPresetId === preset.id
                    ? 'bg-teal-900/60 border-teal-500 text-teal-200'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Teacher JSHR Input Card */}
      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>O'qituvchi JSHR (PINFL)</span>
          </label>
          <span className="text-[11px] font-mono text-slate-400">
            {jshr.length}/14 raqam
          </span>
        </div>

        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            maxLength={14}
            value={jshr}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setJshr(val);
            }}
            placeholder="32001951234567"
            className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm tracking-wider focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {/* Quick Teacher presets */}
        <div className="flex items-center gap-1.5 pt-1 overflow-x-auto text-[11px]">
          <span className="text-slate-500 shrink-0">Misol:</span>
          <button
            onClick={() => {
              setJshr('32001951234567');
              setFullName('Sobirov Jamshid Rustamovich');
            }}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 whitespace-nowrap"
          >
            Sobirov J.
          </button>
          <button
            onClick={() => {
              setJshr('41508929876543');
              setFullName('Qosimova Nilufar Anvarovna');
            }}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 whitespace-nowrap"
          >
            Qosimova N.
          </button>
        </div>
      </div>

      {/* Main Attendance Buttons (Keldi / Ketdi) */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2.5">
          {/* Keldi Button */}
          <button
            onClick={() => handleAttendanceAction('Keldi')}
            disabled={isSubmitting}
            className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-teal-600 hover:bg-teal-500 active:scale-[0.98] text-white font-semibold transition-all shadow-lg shadow-teal-900/30 disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center mb-1">
              <LogIn className="w-5 h-5 text-white" />
            </div>
            <span className="text-base font-bold">Keldi</span>
            <span className="text-[11px] text-teal-100 font-normal">Check-in</span>
          </button>

          {/* Ketdi Button */}
          <button
            onClick={() => handleAttendanceAction('Ketdi')}
            disabled={isSubmitting}
            className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-semibold transition-all shadow-lg shadow-rose-900/30 disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center mb-1">
              <LogOut className="w-5 h-5 text-white" />
            </div>
            <span className="text-base font-bold">Ketdi</span>
            <span className="text-[11px] text-rose-100 font-normal">Check-out</span>
          </button>
        </div>

        {/* Warning if teacher is outside 500m radius */}
        {!isInside && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-300 text-xs">
            <Info className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Diqqat: Kollejdan {distanceMeters}m uzoqdasiz. Davomat yozuvi koordinatalar bilan birga qayd etiladi.
            </span>
          </div>
        )}
      </div>

      {/* Submission Feedback Message Banner */}
      {lastSubmissionMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-medium border flex items-start gap-2 ${
            lastSubmissionMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-700 text-emerald-200'
              : lastSubmissionMessage.type === 'offline'
              ? 'bg-amber-950/60 border-amber-700 text-amber-200'
              : 'bg-rose-950/60 border-rose-700 text-rose-200'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{lastSubmissionMessage.text}</span>
        </div>
      )}

      {/* Background Service Status Card (WorkManager) */}
      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity
            className={`w-4 h-4 ${isBackgroundActive ? 'text-teal-400 animate-pulse' : 'text-slate-500'}`}
          />
          <div>
            <span className="font-semibold text-slate-200">Orqa Fondagi Xizmat (WorkManager)</span>
            <p className="text-[11px] text-slate-400">
              {isBackgroundActive
                ? `Faol · Oxirgi tekshiruv: ${backgroundLastCheck}`
                : "To'xtatilgan"}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsBackgroundActive(!isBackgroundActive)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
            isBackgroundActive
              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 hover:bg-teal-500/30'
              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
          }`}
        >
          {isBackgroundActive ? 'Faol' : 'Yoqish'}
        </button>
      </div>

      {/* Offline SQLite Queue Bar */}
      <div
        onClick={onNavigateToSqlite}
        className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer flex items-center justify-between"
      >
        <div className="flex items-center gap-2 text-xs">
          <Database className="w-4 h-4 text-teal-400" />
          <div>
            <span className="font-medium text-slate-200">Lokal SQLite Kesh (sqflite)</span>
            <p className="text-[11px] text-slate-400">
              {pendingCount > 0 ? (
                <span className="text-amber-400 font-medium">
                  {pendingCount} ta yozuv serverga yuborilishi kutilmoqda
                </span>
              ) : (
                'Barcha davomatlar Render server bilan to\'liq sinxronlangan'
              )}
            </p>
          </div>
        </div>

        <span className="text-slate-400 text-xs hover:text-white">Batafsil →</span>
      </div>

      {/* Recent Attendance List */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
          <span>So'nggi Qaydlar</span>
          <span>{records.length} ta yozuv</span>
        </div>

        {records.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/60">
            Hali davomat qayd etilmadi. Yuqoridagi "Keldi" yoki "Ketdi" tugmasini bosing.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {records.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/80 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                      item.action_type === 'Keldi'
                        ? 'bg-teal-500/20 text-teal-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {item.action_type === 'Keldi' ? 'K' : 'Q'}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{item.action_type}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({item.distance_meters}m)
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>·</span>
                      <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.sync_status === 'synced' ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/40 font-medium">
                      <Cloud className="w-3 h-3" />
                      <span>Sinxron</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/40 font-medium">
                      <Database className="w-3 h-3" />
                      <span>SQLite Kesh</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

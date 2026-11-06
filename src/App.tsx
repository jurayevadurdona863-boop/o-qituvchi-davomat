import React, { useState, useEffect } from 'react';
import { TopNav, TabType } from './components/TopNav';
import { PhoneFrame } from './components/PhoneFrame';
import { AttendanceScreen } from './components/AttendanceScreen';
import { GeofenceRadar } from './components/GeofenceRadar';
import { SqliteViewer } from './components/SqliteViewer';
import { RenderBackendInspector } from './components/RenderBackendInspector';
import { FlutterCodeViewer } from './components/FlutterCodeViewer';
import { COLLEGE_CONFIG } from './types/attendance';
import { LocalSqliteStore, getStoredServerUrl } from './services/storage';
import { syncPendingRecords } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('app');
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Global coordinates shared between Radar and App
  const [currentLat, setCurrentLat] = useState<number>(COLLEGE_CONFIG.latitude);
  const [currentLng, setCurrentLng] = useState<number>(COLLEGE_CONFIG.longitude);

  const updatePendingCount = () => {
    const pending = LocalSqliteStore.getPending();
    setPendingCount(pending.length);
  };

  useEffect(() => {
    updatePendingCount();
    const handler = () => updatePendingCount();
    window.addEventListener('sqlite_cache_updated', handler);
    return () => window.removeEventListener('sqlite_cache_updated', handler);
  }, []);

  // Browser online event listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOfflineMode(false);
      // Automatically trigger sync when back online
      handleSyncNow();
    };
    const handleOffline = () => {
      setIsOfflineMode(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSyncNow = async () => {
    if (isOfflineMode) return;
    setIsSyncing(true);
    const serverUrl = getStoredServerUrl();
    await syncPendingRecords(serverUrl);
    setIsSyncing(false);
    updatePendingCount();
  };

  const handleUpdateCoordinates = (lat: number, lng: number) => {
    setCurrentLat(lat);
    setCurrentLng(lng);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Navigation */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOfflineMode={isOfflineMode}
        setIsOfflineMode={setIsOfflineMode}
        pendingCount={pendingCount}
        onSyncNow={handleSyncNow}
        isSyncing={isSyncing}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab 1: Android Phone App Simulation */}
        {activeTab === 'app' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
              <div>
                <h2 className="text-base font-bold text-white">
                  O'qituvchi Davomati - Flutter Android Simulyatori
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  14 xonali JSHR kiriting, GPS geozona masofasini tekshiring va 'Keldi'/'Ketdi' orqali davomat qiling.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setActiveTab('radar')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold border border-slate-700 transition-colors"
                >
                  GPS Radarga o'tish →
                </button>
                <button
                  onClick={() => setActiveTab('flutter_code')}
                  className="px-3 py-1.5 rounded-lg bg-teal-600/30 hover:bg-teal-600/50 text-teal-200 font-semibold border border-teal-500/40 transition-colors"
                >
                  Flutter APK Kodi →
                </button>
              </div>
            </div>

            <PhoneFrame isOfflineMode={isOfflineMode}>
              <AttendanceScreen
                isOfflineMode={isOfflineMode}
                onNavigateToRadar={() => setActiveTab('radar')}
                onNavigateToSqlite={() => setActiveTab('sqlite')}
              />
            </PhoneFrame>
          </div>
        )}

        {/* Tab 2: Geofence Radar */}
        {activeTab === 'radar' && (
          <GeofenceRadar
            currentLat={currentLat}
            currentLng={currentLng}
            onUpdateCoordinates={handleUpdateCoordinates}
          />
        )}

        {/* Tab 3: SQLite Cache Inspector */}
        {activeTab === 'sqlite' && (
          <SqliteViewer
            isOfflineMode={isOfflineMode}
            onRecordsChanged={updatePendingCount}
          />
        )}

        {/* Tab 4: Render Backend Inspector */}
        {activeTab === 'backend' && <RenderBackendInspector />}

        {/* Tab 5: Flutter Android Source Code Explorer & ZIP Exporter */}
        {activeTab === 'flutter_code' && <FlutterCodeViewer />}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Kollej koordinatalari: 38.971199, 66.707470 · Radius: 500m · Qarshi, O'zbekiston
          </span>
          <span className="font-mono text-slate-400">
            Render Endpoint: POST /check-attendance · SQLite: sqflite
          </span>
        </div>
      </footer>
    </div>
  );
}

import React from 'react';
import { Smartphone, Radar, Database, Server, Code2, Wifi, WifiOff, RefreshCw } from 'lucide-react';

export type TabType = 'app' | 'radar' | 'sqlite' | 'backend' | 'flutter_code';

interface TopNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isOfflineMode: boolean;
  setIsOfflineMode: (offline: boolean) => void;
  pendingCount: number;
  onSyncNow: () => void;
  isSyncing: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  isOfflineMode,
  setIsOfflineMode,
  pendingCount,
  onSyncNow,
  isSyncing,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 font-bold shadow-inner">
            <Smartphone className="w-5 h-5 text-teal-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold text-white tracking-tight leading-tight">
              O'qituvchi Davomati
            </span>
            <span className="text-[11px] text-teal-400/80 font-medium tracking-wide">
              Flutter Android GPS & SQLite Tizimi
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setActiveTab('app')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'app'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobil Ilova</span>
          </button>

          <button
            onClick={() => setActiveTab('radar')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'radar'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Radar className="w-3.5 h-3.5" />
            <span>GPS Geozona (500m)</span>
          </button>

          <button
            onClick={() => setActiveTab('sqlite')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'sqlite'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>SQLite Kesh</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('backend')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'backend'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Render API</span>
          </button>

          <button
            onClick={() => setActiveTab('flutter_code')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'flutter_code'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Flutter Kodlari</span>
          </button>
        </nav>

        {/* Zone 3: Connection State Action & Sync Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Offline/Online toggle button */}
          <button
            onClick={() => setIsOfflineMode(!isOfflineMode)}
            title={isOfflineMode ? "Internetni yoqish" : "Internetni o'chirish (Oflayn SQLite sinovi)"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isOfflineMode
                ? 'bg-amber-950/50 border-amber-700/60 text-amber-300 hover:bg-amber-900/50'
                : 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/40'
            }`}
          >
            {isOfflineMode ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Oflayn Rejim</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Onlayn</span>
              </>
            )}
          </button>

          {/* Quick Sync Button */}
          {pendingCount > 0 && (
            <button
              onClick={onSyncNow}
              disabled={isSyncing || isOfflineMode}
              title="Kutilayotgan davomatlarni serverga sinxronlash"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sinxronlash ({pendingCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="md:hidden flex items-center justify-around px-2 py-2 border-t border-slate-800/80 bg-slate-950/60 overflow-x-auto">
        <button
          onClick={() => setActiveTab('app')}
          className={`px-3 py-1 rounded text-xs whitespace-nowrap ${
            activeTab === 'app' ? 'text-teal-400 font-bold' : 'text-slate-400'
          }`}
        >
          📱 Ilova
        </button>
        <button
          onClick={() => setActiveTab('radar')}
          className={`px-3 py-1 rounded text-xs whitespace-nowrap ${
            activeTab === 'radar' ? 'text-teal-400 font-bold' : 'text-slate-400'
          }`}
        >
          📡 Geozona
        </button>
        <button
          onClick={() => setActiveTab('sqlite')}
          className={`px-3 py-1 rounded text-xs whitespace-nowrap ${
            activeTab === 'sqlite' ? 'text-teal-400 font-bold' : 'text-slate-400'
          }`}
        >
          💾 SQLite ({pendingCount})
        </button>
        <button
          onClick={() => setActiveTab('backend')}
          className={`px-3 py-1 rounded text-xs whitespace-nowrap ${
            activeTab === 'backend' ? 'text-teal-400 font-bold' : 'text-slate-400'
          }`}
        >
          ☁️ Render API
        </button>
        <button
          onClick={() => setActiveTab('flutter_code')}
          className={`px-3 py-1 rounded text-xs whitespace-nowrap ${
            activeTab === 'flutter_code' ? 'text-teal-400 font-bold' : 'text-slate-400'
          }`}
        >
          📦 Kodlar
        </button>
      </div>
    </header>
  );
};

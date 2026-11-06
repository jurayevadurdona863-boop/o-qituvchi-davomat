import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  Trash2,
  Plus,
  CloudUpload,
  CheckCircle2,
  Clock,
  Terminal,
  AlertCircle
} from 'lucide-react';
import { AttendanceRecord } from '../types/attendance';
import { LocalSqliteStore, SQLITE_SCHEMA_DDL, getStoredServerUrl } from '../services/storage';
import { syncPendingRecords } from '../services/api';

interface SqliteViewerProps {
  isOfflineMode: boolean;
  onRecordsChanged?: () => void;
}

export const SqliteViewer: React.FC<SqliteViewerProps> = ({
  isOfflineMode,
  onRecordsChanged,
}) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'table' | 'schema' | 'sql'>('table');
  const [customSql, setCustomSql] = useState<string>("SELECT * FROM attendance_cache ORDER BY timestamp DESC;");

  const loadData = () => {
    const list = LocalSqliteStore.getAll();
    setRecords(list);
    if (onRecordsChanged) onRecordsChanged();
  };

  useEffect(() => {
    loadData();
    const handler = () => loadData();
    window.addEventListener('sqlite_cache_updated', handler);
    return () => window.removeEventListener('sqlite_cache_updated', handler);
  }, []);

  const pendingRecords = records.filter((r) => r.sync_status === 'pending');
  const syncedRecords = records.filter((r) => r.sync_status === 'synced');

  const handleSyncAll = async () => {
    if (isOfflineMode) {
      setSyncFeedback("Oflayn rejim yoqilgan! Sinxronlash uchun yuqoridagi 'Onlayn' tugmasini bosing.");
      return;
    }
    setIsSyncing(true);
    setSyncFeedback(null);

    const serverUrl = getStoredServerUrl();
    const result = await syncPendingRecords(serverUrl);
    setIsSyncing(false);

    setSyncFeedback(
      `Sinxronlash yakunlandi: ${result.synced} ta yozuv Render serveriga yuborildi, ${result.failed} ta xato.`
    );
    loadData();
  };

  const handleAddMockOffline = () => {
    const mockRecord: AttendanceRecord = {
      id: 'offline_mock_' + Date.now(),
      jshr: '32001951234567',
      latitude: 38.971210,
      longitude: 66.707480,
      action_type: 'Keldi',
      timestamp: new Date().toISOString(),
      distance_meters: 1.2,
      within_geofence: true,
      sync_status: 'pending',
      error_message: 'Internet uzilgan paytda keshlandi',
      device_info: 'Flutter Android (Offline Simulation)'
    };
    LocalSqliteStore.insert(mockRecord);
    loadData();
  };

  const handleDeleteRecord = (id: string) => {
    LocalSqliteStore.delete(id);
    loadData();
  };

  const handleClearAll = () => {
    if (confirm("Haqiqatan ham barcha SQLite yozuvlarini o'chirmoqchimisiz?")) {
      LocalSqliteStore.clear();
      loadData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-teal-400" />
            <span>Lokal SQLite Ma'lumotlar Bazasi (sqflite)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Fayl: <span className="font-mono text-teal-300">/data/data/com.example.app/databases/attendance_local.db</span>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddMockOffline}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Test Oflayn Yozuv</span>
          </button>

          <button
            onClick={handleSyncAll}
            disabled={isSyncing || pendingRecords.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md transition-all"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sinxronlash ({pendingRecords.length})</span>
          </button>

          <button
            onClick={handleClearAll}
            title="Keshni tozalash"
            className="p-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncFeedback && (
        <div className="p-3 rounded-xl bg-teal-950/60 border border-teal-800 text-teal-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Database KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400">Jami Yozuvlar</span>
          <p className="text-xl font-bold font-mono text-white mt-1">{records.length}</p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-amber-400">Kutilmoqda (Oflayn)</span>
          <p className="text-xl font-bold font-mono text-amber-300 mt-1">{pendingRecords.length}</p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-emerald-400">Serverga Yuborilgan</span>
          <p className="text-xl font-bold font-mono text-emerald-300 mt-1">{syncedRecords.length}</p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400">SQLite Jadvali</span>
          <p className="text-sm font-semibold font-mono text-teal-300 mt-1.5">attendance_cache</p>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('table')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'table'
              ? 'bg-teal-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Ma'lumotlar Jadvali
        </button>

        <button
          onClick={() => setActiveTab('schema')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'schema'
              ? 'bg-teal-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          SQLite Schema (DDL)
        </button>

        <button
          onClick={() => setActiveTab('sql')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'sql'
              ? 'bg-teal-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          SQL So'rovlar
        </button>
      </div>

      {/* Tab 1: Data Table */}
      {activeTab === 'table' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Harakat</th>
                  <th className="py-3 px-3">JSHR (PINFL)</th>
                  <th className="py-3 px-3">Masofa</th>
                  <th className="py-3 px-3">Geozona</th>
                  <th className="py-3 px-3">Vaqt</th>
                  <th className="py-3 px-3">Holat</th>
                  <th className="py-3 px-3 text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                      SQLite bazasida hali yozuvlar yo'q. "Test Oflayn Yozuv" tugmasini bosing yoki ilovada davomat qayd qiling.
                    </td>
                  </tr>
                ) : (
                  records.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.action_type === 'Keldi'
                              ? 'bg-teal-500/20 text-teal-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {row.action_type}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-slate-200">{row.jshr}</td>

                      <td className="py-2.5 px-3 text-slate-300">{row.distance_meters}m</td>

                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            row.within_geofence
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {row.within_geofence ? 'Ichida (≤500m)' : 'Tashqarida'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        {new Date(row.timestamp).toLocaleDateString()}
                      </td>

                      <td className="py-2.5 px-3">
                        {row.sync_status === 'synced' ? (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-sans">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Yuborilgan</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-amber-400 font-sans">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Kutilmoqda</span>
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleDeleteRecord(row.id)}
                          className="p-1 hover:text-rose-400 text-slate-500 transition-colors"
                          title="Yozuvni o'chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: DDL Schema */}
      {activeTab === 'schema' && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-slate-300">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
            <span className="text-teal-400 font-bold">attendance_cache.sql</span>
            <span className="text-slate-500">Android sqflite DDL</span>
          </div>
          <pre className="overflow-x-auto text-teal-300 leading-relaxed whitespace-pre-wrap">
            {SQLITE_SCHEMA_DDL}
          </pre>
        </div>
      )}

      {/* Tab 3: SQL Query Simulator */}
      {activeTab === 'sql' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-teal-400" />
                <span>SQL Buyruq</span>
              </label>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCustomSql("SELECT * FROM attendance_cache WHERE sync_status = 'pending';")}
                  className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 hover:text-white"
                >
                  Kutilayotganlar
                </button>
                <button
                  onClick={() => setCustomSql("SELECT * FROM attendance_cache WHERE action_type = 'Keldi';")}
                  className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 hover:text-white"
                >
                  Faqat Keldi
                </button>
              </div>
            </div>

            <textarea
              value={customSql}
              onChange={(e) => setCustomSql(e.target.value)}
              rows={2}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-teal-300 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 font-mono">
            Natija: {records.length} ta qator qaytarildi. (sqflite DB versiyasi: 1.0)
          </div>
        </div>
      )}
    </div>
  );
};

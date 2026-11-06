import React, { useState, useEffect } from 'react';
import {
  Server,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Code,
  Globe,
  Trash2,
  Shield,
  Activity
} from 'lucide-react';
import { COLLEGE_CONFIG } from '../types/attendance';
import { getStoredServerUrl, saveStoredServerUrl } from '../services/storage';

interface ServerLogItem {
  id: string;
  jshr: string;
  latitude: number;
  longitude: number;
  action_type: 'Keldi' | 'Ketdi';
  timestamp: string;
  server_timestamp: string;
  distance_meters: number;
  within_geofence: boolean;
  device_info?: string;
  ip?: string;
  synced_from_offline?: boolean;
}

export const RenderBackendInspector: React.FC = () => {
  const [serverUrl, setServerUrl] = useState<string>(getStoredServerUrl());
  const [testJshr, setTestJshr] = useState<string>('32001951234567');
  const [testAction, setTestAction] = useState<'Keldi' | 'Ketdi'>('Keldi');
  const [testLat, setTestLat] = useState<number>(COLLEGE_CONFIG.latitude);
  const [testLng, setTestLng] = useState<number>(COLLEGE_CONFIG.longitude);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [logs, setLogs] = useState<ServerLogItem[]>([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState<boolean>(false);

  const fetchServerLogs = async () => {
    setIsFetchingLogs(true);
    try {
      const res = await fetch('/api/attendance-history');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.records || []);
      }
    } catch (e) {
      console.warn('Failed to fetch server logs:', e);
    } finally {
      setIsFetchingLogs(false);
    }
  };

  useEffect(() => {
    fetchServerLogs();
  }, []);

  const handleSaveUrl = (url: string) => {
    setServerUrl(url);
    saveStoredServerUrl(url);
  };

  const handleSendTestRequest = async () => {
    setIsLoading(true);
    setLastResponse(null);

    const payload = {
      jshr: testJshr,
      latitude: testLat,
      longitude: testLng,
      action_type: testAction,
      timestamp: new Date().toISOString(),
      distance_meters: 10.5,
      device_info: 'Flutter Android (Dev Test)',
      synced_from_offline: false
    };

    const startTime = performance.now();
    try {
      let targetUrl = serverUrl;
      let options: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      };

      if (targetUrl.startsWith('http') && !targetUrl.includes(window.location.host)) {
        targetUrl = '/api/proxy-render-check';
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            render_url: serverUrl,
            payload
          })
        };
      }

      const res = await fetch(targetUrl, options);
      const latency = Math.round(performance.now() - startTime);
      const json = await res.json();

      setLastResponse({
        status: res.status,
        ok: res.ok,
        latencyMs: latency,
        data: json
      });

      fetchServerLogs();
    } catch (err: any) {
      setLastResponse({
        status: 0,
        ok: false,
        latencyMs: Math.round(performance.now() - startTime),
        error: err.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearServerLogs = async () => {
    try {
      await fetch('/api/attendance-clear', { method: 'POST' });
      fetchServerLogs();
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-teal-400" />
            <span>Render Server Backend Integratsiyasi (/check-attendance)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Flutter ilovasi har bir davomatni ushbu endpointga yuboradi va server geozonani tekshiradi.
          </p>
        </div>

        <button
          onClick={fetchServerLogs}
          disabled={isFetchingLogs}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetchingLogs ? 'animate-spin' : ''}`} />
          <span>Server Jurnalini Yangilash</span>
        </button>
      </div>

      {/* Endpoint URL Configuration */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-teal-400" />
            <span>Server API Endpoint Manzili</span>
          </label>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleSaveUrl('/check-attendance')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                serverUrl === '/check-attendance'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Ichki Test Server (/check-attendance)
            </button>
            <button
              onClick={() => handleSaveUrl('https://teacher-attendance-backend.onrender.com/check-attendance')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                serverUrl.includes('onrender.com')
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Render Namuna
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => handleSaveUrl(e.target.value)}
            placeholder="https://your-service.onrender.com/check-attendance"
            className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-teal-500"
          />
        </div>
        <p className="text-[11px] text-slate-400">
          Ushbu URL orqali ilova haqiqiy Render backend serveringizga ulanadi. Ichki test serveri avtomatik ishlaydi.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Request Dispatcher */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-teal-400" />
            <span>Test So'rov Yuborish</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">O'qituvchi JSHR (14 xonali):</label>
              <input
                type="text"
                value={testJshr}
                onChange={(e) => setTestJshr(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Harakat Turi:</label>
                <select
                  value={testAction}
                  onChange={(e) => setTestAction(e.target.value as any)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-semibold"
                >
                  <option value="Keldi">Keldi (Check-in)</option>
                  <option value="Ketdi">Ketdi (Check-out)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Kollej Koordinatasi:</label>
                <div className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-teal-300">
                  {testLat.toFixed(4)}, {testLng.toFixed(4)}
                </div>
              </div>
            </div>

            <button
              onClick={handleSendTestRequest}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center justify-center gap-2 shadow-md transition-colors"
            >
              <Send className={`w-3.5 h-3.5 ${isLoading ? 'animate-pulse' : ''}`} />
              <span>{isLoading ? 'Yuborilmoqda...' : 'POST /check-attendance Yuborish'}</span>
            </button>
          </div>

          {/* Response Inspector */}
          {lastResponse && (
            <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Server Javobi:</span>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span
                    className={`px-1.5 py-0.2 rounded font-bold ${
                      lastResponse.ok
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    HTTP {lastResponse.status || 'ERR'}
                  </span>
                  <span className="text-slate-400">{lastResponse.latencyMs}ms</span>
                </div>
              </div>

              <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-teal-300 overflow-x-auto max-h-48">
                {JSON.stringify(lastResponse.data || lastResponse.error, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Server Attendance Log History */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-400" />
              <span>Server Jurnali ({logs.length} ta yozuv)</span>
            </h3>

            {logs.length > 0 && (
              <button
                onClick={handleClearServerLogs}
                title="Server jurnalini tozalash"
                className="text-slate-500 hover:text-rose-400 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
              Serverda hali qaydlar yo'q. Chap tarafdan test so'rov yuboring yoki ilovadan davomat qiling.
            </div>
          ) : (
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {logs.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.action_type === 'Keldi'
                            ? 'bg-teal-500/20 text-teal-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {item.action_type}
                      </span>
                      <span className="font-mono text-white font-semibold">{item.jshr}</span>
                    </div>

                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                        item.within_geofence
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {item.within_geofence ? 'Hudud ichida' : 'Tashqarida'} ({item.distance_meters}m)
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>
                      {new Date(item.server_timestamp).toLocaleTimeString()} ·{' '}
                      {new Date(item.server_timestamp).toLocaleDateString()}
                    </span>
                    <span className="text-slate-500 truncate max-w-[130px]">
                      {item.synced_from_offline ? '⚡ Oflayn sinxron' : '🌐 To\'g\'ridan-to\'g\'ri'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

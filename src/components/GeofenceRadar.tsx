import React, { useState, useRef, useEffect } from 'react';
import {
  MapPin,
  Compass,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Navigation,
  Info,
  Maximize,
  LocateFixed
} from 'lucide-react';
import { COLLEGE_CONFIG } from '../types/attendance';
import {
  calculateDistanceMeters,
  PRESET_LOCATIONS,
  PresetLocation,
} from '../services/geofence';

interface GeofenceRadarProps {
  currentLat: number;
  currentLng: number;
  onUpdateCoordinates: (lat: number, lng: number) => void;
}

export const GeofenceRadar: React.FC<GeofenceRadarProps> = ({
  currentLat,
  currentLng,
  onUpdateCoordinates,
}) => {
  const [distance, setDistance] = useState<number>(0);
  const [isInside, setIsInside] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = 1km view, 2 = 2km view, 4 = 5km view
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const dist = calculateDistanceMeters(
      COLLEGE_CONFIG.latitude,
      COLLEGE_CONFIG.longitude,
      currentLat,
      currentLng
    );
    setDistance(dist);
    setIsInside(dist <= COLLEGE_CONFIG.radiusMeters);
  }, [currentLat, currentLng]);

  // Adjust zoom automatically if teacher is very far
  useEffect(() => {
    if (distance > 3000) {
      setZoomLevel(4);
    } else if (distance > 1200) {
      setZoomLevel(2);
    }
  }, [distance]);

  // Canvas Radar rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // View radius in meters based on zoom level
    const maxRadiusMeters = 800 * zoomLevel;
    const scale = (width / 2 - 30) / maxRadiusMeters;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // Background grid & radar rings
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;

    // Draw concentric distance rings (100m, 250m, 500m, 1000m...)
    const rings = [100, 250, 500, 750, 1000, 2000].filter((r) => r <= maxRadiusMeters);
    rings.forEach((r) => {
      const radiusPx = r * scale;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
      ctx.stroke();

      // Ring distance labels
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(`${r}m`, centerX + 4, centerY - radiusPx + 12);
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(centerX, 20);
    ctx.lineTo(centerX, height - 20);
    ctx.moveTo(20, centerY);
    ctx.lineTo(width - 20, centerY);
    ctx.stroke();

    // 500m Geofence Allowed Zone (Green highlight)
    const geofencePx = COLLEGE_CONFIG.radiusMeters * scale;
    ctx.beginPath();
    ctx.arc(centerX, centerY, geofencePx, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
    ctx.stroke();
    ctx.setLineDash([]);

    // Geofence label
    ctx.fillStyle = 'rgba(52, 211, 153, 0.9)';
    ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
    ctx.fillText('Ruxsat etilgan 500m geozona', centerX - 70, centerY - geofencePx - 6);

    // Calculate user position offset relative to college
    // 1 deg latitude ≈ 111,000 meters
    // 1 deg longitude ≈ 111,000 * cos(lat) meters
    const metersPerLat = 111000;
    const metersPerLng = 111000 * Math.cos((COLLEGE_CONFIG.latitude * Math.PI) / 180);

    const dLatMeters = (currentLat - COLLEGE_CONFIG.latitude) * metersPerLat;
    const dLngMeters = (currentLng - COLLEGE_CONFIG.longitude) * metersPerLng;

    const userX = centerX + dLngMeters * scale;
    const userY = centerY - dLatMeters * scale; // Y is inverted in canvas

    // Connecting distance line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(userX, userY);
    ctx.strokeStyle = isInside ? 'rgba(45, 212, 191, 0.6)' : 'rgba(244, 63, 94, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw College Center Pin
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#0d9488';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
    ctx.fillText('Kollej (Markaz)', centerX + 12, centerY - 8);

    // Draw Teacher Pin
    ctx.beginPath();
    ctx.arc(userX, userY, 10, 0, Math.PI * 2);
    ctx.fillStyle = isInside ? '#10b981' : '#f43f5e';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Pulse wave around user pin
    ctx.beginPath();
    ctx.arc(userX, userY, 16, 0, Math.PI * 2);
    ctx.strokeStyle = isInside ? 'rgba(16, 185, 129, 0.5)' : 'rgba(244, 63, 94, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Teacher marker label
    ctx.fillStyle = isInside ? '#34d399' : '#fb7185';
    ctx.font = 'bold 12px Plus Jakarta Sans, sans-serif';
    ctx.fillText(
      `O'qituvchi (${distance}m)`,
      userX + 14,
      userY + 4
    );
  }, [currentLat, currentLng, distance, isInside, zoomLevel]);

  // Handle canvas click to place user pin anywhere
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const maxRadiusMeters = 800 * zoomLevel;
    const scale = (width / 2 - 30) / maxRadiusMeters;

    const dLngMeters = (clickX - centerX) / scale;
    const dLatMeters = -(clickY - centerY) / scale;

    const metersPerLat = 111000;
    const metersPerLng = 111000 * Math.cos((COLLEGE_CONFIG.latitude * Math.PI) / 180);

    const newLat = COLLEGE_CONFIG.latitude + dLatMeters / metersPerLat;
    const newLng = COLLEGE_CONFIG.longitude + dLngMeters / metersPerLng;

    onUpdateCoordinates(
      Math.round(newLat * 1000000) / 1000000,
      Math.round(newLng * 1000000) / 1000000
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-teal-400" />
            <span>GPS Geozona Radari (500m Perimetr)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Kollej koordinatalari: <span className="text-teal-300 font-mono">38.971199, 66.707470</span> · Qarshi shahar
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold ${
              isInside
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
            }`}
          >
            {isInside ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{isInside ? 'HUDUD ICHIDA (500m)' : 'HUDUD TASHQARISIDA'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Canvas Box */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <LocateFixed className="w-3.5 h-3.5 text-teal-400" />
              <span>Interaktiv Radar: Xaritani bosib joylashuvni o'zgartiring</span>
            </span>

            {/* Zoom selector */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setZoomLevel(1)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                  zoomLevel === 1 ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                1x (800m)
              </button>
              <button
                onClick={() => setZoomLevel(2)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                  zoomLevel === 2 ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                2x (1.6km)
              </button>
              <button
                onClick={() => setZoomLevel(4)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                  zoomLevel === 4 ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                4x (3.2km)
              </button>
            </div>
          </div>

          <div className="relative w-full max-w-[500px] aspect-square bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-center overflow-hidden cursor-crosshair">
            <canvas
              ref={canvasRef}
              width={500}
              height={500}
              onClick={handleCanvasClick}
              className="w-full h-full block"
            />
          </div>

          <p className="text-[11px] text-slate-400 mt-3 text-center">
            💡 Maslahat: Yashil shtrix chiziq ruxsat etilgan 500 metr radiusni bildiradi.
          </p>
        </div>

        {/* Telemetry & Preset Panel */}
        <div className="space-y-4">
          {/* Live Telemetry Card */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Navigation className="w-4 h-4 text-teal-400" />
              <span>Joriy GPS Ko'rsatkichlari</span>
            </h3>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Masofa:</span>
                <span
                  className={`text-sm font-mono font-bold ${
                    isInside ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {distance} metr
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Ruxsat etilgan radius:</span>
                <span className="font-mono text-slate-200 font-semibold">500 metr</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">O'qituvchi Lat:</span>
                <span className="font-mono text-slate-200">{currentLat.toFixed(6)}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">O'qituvchi Lng:</span>
                <span className="font-mono text-slate-200">{currentLng.toFixed(6)}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Hisoblash:</span>
                <span className="text-slate-300">Haversine Formula</span>
              </div>
            </div>
          </div>

          {/* Test Presets */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
            <h3 className="text-sm font-bold text-white">
              Tezkor Sinov Nuqtalari:
            </h3>

            <div className="space-y-1.5">
              {PRESET_LOCATIONS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => onUpdateCoordinates(preset.lat, preset.lng)}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-xs transition-colors flex items-center justify-between group"
                >
                  <div>
                    <span className="font-semibold text-slate-200 group-hover:text-teal-300 block">
                      {preset.label}
                    </span>
                    <span className="text-[11px] text-slate-400">{preset.description}</span>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                      preset.isInside
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    ~{preset.expectedDistance}m
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

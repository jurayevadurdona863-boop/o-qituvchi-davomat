import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Signal, Maximize2, Minimize2 } from 'lucide-react';

interface PhoneFrameProps {
  children: React.ReactNode;
  isOfflineMode: boolean;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({ children, isOfflineMode }) => {
  const [time, setTime] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-4 w-full">
      {/* Device frame toggle controls */}
      <div className="w-full max-w-sm flex items-center justify-between mb-3 px-2 text-xs text-slate-400">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-2 h-2 rounded-full bg-teal-400"></span>
          <span>Google Pixel 8 Pro Simulyatori</span>
        </span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 hover:text-white transition-colors px-2 py-1 rounded bg-slate-800/80 border border-slate-700/60"
        >
          {isExpanded ? (
            <>
              <Minimize2 className="w-3 h-3" />
              <span>Telefon O'lchami</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3 h-3" />
              <span>Keng Ko'rinish</span>
            </>
          )}
        </button>
      </div>

      {/* Frame Container */}
      <div
        className={`transition-all duration-300 w-full ${
          isExpanded
            ? 'max-w-2xl rounded-2xl border-2 border-slate-700 bg-slate-900 shadow-2xl overflow-hidden'
            : 'max-w-[390px] rounded-[48px] border-[10px] border-slate-800 bg-slate-900 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] ring-1 ring-slate-700/50 overflow-hidden'
        }`}
      >
        {/* Android Status Bar */}
        <div className="bg-slate-950 px-6 pt-3 pb-2 flex items-center justify-between text-[13px] font-medium text-slate-300 select-none border-b border-slate-800/60">
          <span className="font-semibold text-slate-200">{time || '09:41'}</span>

          {/* Camera Notch on standard phone */}
          {!isExpanded && (
            <div className="w-4 h-4 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>
            </div>
          )}

          <div className="flex items-center gap-2 text-slate-400">
            <Signal className="w-3.5 h-3.5" />
            <Wifi className={`w-3.5 h-3.5 ${isOfflineMode ? 'text-amber-500' : 'text-slate-300'}`} />
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-mono">94%</span>
              <Battery className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
        </div>

        {/* Screen Content */}
        <div className="bg-slate-900 min-h-[640px] max-h-[780px] overflow-y-auto flex flex-col">
          {children}
        </div>

        {/* Android Gesture Bar */}
        <div className="bg-slate-950 py-2.5 flex items-center justify-center border-t border-slate-800/50">
          <div className="w-32 h-1 bg-slate-600 rounded-full"></div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import JSZip from 'jszip';
import {
  Code2,
  Download,
  Copy,
  Check,
  FileCode,
  FolderTree,
  Terminal,
  ExternalLink,
  Smartphone
} from 'lucide-react';
import { FLUTTER_PROJECT_FILES, FlutterFile } from '../data/flutterCode';

export const FlutterCodeViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<FlutterFile>(FLUTTER_PROJECT_FILES[0]);
  const [copied, setCopied] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      // Add each file into zip with its respective path
      FLUTTER_PROJECT_FILES.forEach((file) => {
        zip.file(file.path, file.content);
      });

      // Generate zip blob
      const content = await zip.generateAsync({ type: 'blob' });

      // Trigger browser download
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'oqituvchi_davomat_flutter_project.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to create ZIP:', e);
      alert('ZIP arxivini yaratishda xatolik yuz berdi');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Code2 className="w-5 h-5 text-teal-400" />
            <span>To'liq Flutter Android Loyihasi Kodlari</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Android Studio yoki VS Code uchun tayyor loyiha fayllari. GPS Geofence (500m), SQLite va WorkManager bilan.
          </p>
        </div>

        {/* Download ZIP Button */}
        <button
          onClick={handleDownloadZip}
          disabled={isZipping}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-teal-950/40 transition-all shrink-0"
        >
          <Download className={`w-4 h-4 ${isZipping ? 'animate-bounce' : ''}`} />
          <span>{isZipping ? 'ZIP tayyorlanmoqda...' : 'Loyihani Yuklab Olish (.ZIP)'}</span>
        </button>
      </div>

      {/* Terminal Quick Start Guide */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
          <Terminal className="w-4 h-4" />
          <span>Flutter Android APK Chiqarish Buyruqlari:</span>
        </div>
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
          <p className="text-slate-400"># 1. Bog'liqliklarni o'rnatish</p>
          <p className="text-teal-400 font-bold">flutter pub get</p>
          <p className="text-slate-400 mt-2"># 2. Telefonda tekshirib ishga tushirish</p>
          <p className="text-teal-400 font-bold">flutter run</p>
          <p className="text-slate-400 mt-2"># 3. Android uchun o'rnatiladigan APK chiqarish</p>
          <p className="text-teal-400 font-bold">flutter build apk --release</p>
        </div>
      </div>

      {/* Code Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* File Tree List */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-slate-300">
            <FolderTree className="w-4 h-4 text-teal-400" />
            <span>Loyiha Fayllari</span>
          </div>

          <div className="space-y-1">
            {FLUTTER_PROJECT_FILES.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition-colors flex items-center gap-2 ${
                  selectedFile.path === file.path
                    ? 'bg-teal-600/20 border border-teal-500/50 text-teal-300 font-bold'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Code Content & Details */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          {/* File Header */}
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-teal-300">
                  {selectedFile.path}
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  {selectedFile.language}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {selectedFile.description}
              </p>
            </div>

            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Nusxalandi!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Kodni Nusxalash</span>
                </>
              )}
            </button>
          </div>

          {/* Syntax Highlighted Box */}
          <div className="p-4 bg-slate-950 overflow-x-auto max-h-[560px]">
            <pre className="font-mono text-xs text-slate-200 leading-relaxed">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

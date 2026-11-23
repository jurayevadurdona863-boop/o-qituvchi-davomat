import express, { type Express, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { SEED_EMPLOYEES } from './employees.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite bazasi (doimiy disk ulangan bo'lsa, DB_PATH=/data/attendance.db qiling)
const DB_FILE = process.env.DB_PATH || 'attendance.db';

// ====== TELEGRAMDAN TIKLASH ======
// Bepul Render'da fayllar har restartda o'chadi. Baza fayli bo'lmasa, Telegramda
// "pin" qilingan oxirgi zaxira faylini topib, qayta yuklab olamiz.
let restoreUncertain = false;
async function restoreDbFromTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const chats = (process.env.TELEGRAM_CHAT_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (fs.existsSync(DB_FILE) || !token || chats.length === 0) return;
  const api = `https://api.telegram.org/bot${token}`;
  for (const chatId of chats) {
    try {
      const c: any = await (await fetch(`${api}/getChat?chat_id=${encodeURIComponent(chatId)}`)).json();
      if (!c.ok) {
        console.error(`Zaxira: getChat xato (${chatId}):`, c.description);
        restoreUncertain = true;
        continue;
      }
      const doc = c.result?.pinned_message?.document;
      if (!doc || !String(doc.file_name || '').startsWith('attendance-backup')) continue;
      const f: any = await (await fetch(`${api}/getFile?file_id=${encodeURIComponent(doc.file_id)}`)).json();
      if (!f.ok) {
        restoreUncertain = true;
        continue;
      }
      const r = await fetch(`https://api.telegram.org/file/bot${token}/${f.result.file_path}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.subarray(0, 15).toString('latin1') !== 'SQLite format 3') {
        console.error('Zaxira fayli yaroqsiz, o\'tkazib yuborildi');
        continue;
      }
      fs.mkdirSync(path.dirname(path.resolve(DB_FILE)), { recursive: true });
      fs.writeFileSync(DB_FILE, buf);
      console.log(`✅ Baza Telegramdagi zaxiradan tiklandi (${buf.length} bayt)`);
      restoreUncertain = false;
      return;
    } catch (e) {
      console.error('Zaxirani tiklashda xato:', e);
      restoreUncertain = true;
    }
  }
  console.log('Telegramda zaxira topilmadi, bo\'sh baza bilan boshlanadi');
}
await restoreDbFromTelegram();

const db = new Database(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    jshr TEXT,
    fio TEXT,
    lavozim TEXT,
    latitude REAL,
    longitude REAL,
    action_type TEXT,
    date_str TEXT,
    time_str TEXT,
    time_status TEXT,
    timestamp TEXT,
    server_timestamp TEXT,
    distance_meters REAL,
    within_geofence INTEGER,
    device_info TEXT,
    ip TEXT,
    synced_from_offline INTEGER
  );
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jshr TEXT UNIQUE NOT NULL,
    fio TEXT NOT NULL,
    lavozim TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
`);

// employees.ts dagi ro'yxatni bazaga yozish (o'chirilganlar qayta tiklanmaydi)
{
  const ins = db.prepare('INSERT OR IGNORE INTO employees (jshr, fio, lavozim) VALUES (?, ?, ?)');
  const find = db.prepare('SELECT fio FROM employees WHERE jshr = ?');
  for (const e of SEED_EMPLOYEES) {
    const r = ins.run(e.jshr, e.fio, e.lavozim);
    if (r.changes === 0) {
      const ex = find.get(e.jshr) as { fio: string } | undefined;
      if (ex && ex.fio !== e.fio) {
        console.warn(`DIQQAT: bir xil JSHR ikki xodimda: "${ex.fio}" va "${e.fio}". Ikkinchisi qo'shilmadi.`);
      }
    }
  }
}

interface Teacher {
  id: number;
  fio: string;
  lavozim: string;
  jshr: string;
}
const getTeachers = () =>
  db.prepare('SELECT id, fio, lavozim, jshr FROM employees WHERE active = 1 ORDER BY id').all() as Teacher[];

// Texnikum koordinatalari: Yakkabog'
const COLLEGE_LAT = 38.971199;
const COLLEGE_LNG = 66.70747;
const GEOFENCE_RADIUS_METERS = 500;

// Maxfiy sozlamalar (Render → Environment)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// ====== YORDAMCHILAR ======
const maskJshr = (j: string) => (j.length > 4 ? '*'.repeat(j.length - 4) + j.slice(-4) : j);
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function isAdmin(req: Request) {
  const k = String(req.query.key || req.headers['x-admin-key'] || '');
  return ADMIN_KEY !== '' && k === ADMIN_KEY;
}

function keyForm(action: string) {
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Kirish</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050816;color:#e2e8f0;font-family:system-ui,sans-serif}
form{background:#0f172a;border:1px solid #1e293b;border-radius:20px;padding:24px;width:280px;text-align:center}
input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #334155;background:#020617;color:#fff;margin-top:12px;font-size:15px}
button{background:#0d9488;border:0;font-weight:700}</style></head><body>
<form method="get" action="${action}"><div style="font-size:30px">🛡️</div><b>Admin kaliti</b>
<input type="password" name="key" placeholder="••••••••" autofocus required><button>Kirish</button></form></body></html>`;
}

// Toshkent vaqtini aniq olish va hafta kunini aniqlash
function getTashkentTimeDetails(isoString?: string) {
  const dateObj = isoString ? new Date(isoString) : new Date();
  const tashkentDate = new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Tashkent' }));

  const year = tashkentDate.getFullYear();
  const month = String(tashkentDate.getMonth() + 1).padStart(2, '0');
  const day = String(tashkentDate.getDate()).padStart(2, '0');
  const hours = tashkentDate.getHours();
  const minutes = tashkentDate.getMinutes();
  const dayOfWeek = tashkentDate.getDay(); // 0 - Yakshanba, 6 - Shanba

  const dateStr = `${day}.${month}.${year}`;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const totalMinutes = hours * 60 + minutes;

  return { dateStr, timeStr, totalMinutes, dayOfWeek };
}

// Telegramga xabar yuborish
async function sendTelegramNotification(message: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
      });
      const j: any = await r.json();
      if (!j.ok) console.error(`Telegram rad etdi (${chatId}):`, j.description);
    } catch (err) {
      console.error(`Telegram xabar yuborishda xatolik (${chatId}):`, err);
    }
  }
}

// ====== TELEGRAMGA ZAXIRA ======
let backupBusy = false;
let backupTimer: ReturnType<typeof setTimeout> | null = null;

async function backupDbToTelegram(reason: string) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) return;
  if (restoreUncertain) {
    console.error("Zaxira o'tkazib yuborildi: tiklash holati noaniq (eski zaxira ustiga yozmaslik uchun)");
    return;
  }
  if (backupBusy) {
    scheduleBackup(reason, 30000);
    return;
  }
  backupBusy = true;
  const api = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  const chatId = process.env.BACKUP_CHAT_ID || TELEGRAM_CHAT_IDS[0];
  const tmp = path.join(os.tmpdir(), `attendance-backup-${Date.now()}.db`);
  try {
    await db.backup(tmp);
    const buf = fs.readFileSync(tmp);
    const tn = getTashkentTimeDetails();
    const name = `attendance-backup-${tn.dateStr.replace(/\./g, '-')}_${tn.timeStr.replace(':', '-')}.db`;

    // eski pin xabarini eslab qolamiz (keyin olib tashlaymiz)
    let oldPinId: number | null = null;
    try {
      const c: any = await (await fetch(`${api}/getChat?chat_id=${encodeURIComponent(chatId)}`)).json();
      oldPinId = c.result?.pinned_message?.message_id ?? null;
    } catch {}

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('disable_notification', 'true');
    form.append('caption', `💾 Baza zaxirasi (${reason}) — o'chirmang`);
    form.append('document', new Blob([buf]), name);
    const j: any = await (await fetch(`${api}/sendDocument`, { method: 'POST', body: form })).json();
    if (!j.ok) {
      console.error('Zaxira yuborilmadi:', j.description);
      return;
    }
    const newId = j.result.message_id;
    await fetch(`${api}/pinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: newId, disable_notification: true }),
    });
    if (oldPinId && oldPinId !== newId) {
      await fetch(`${api}/unpinChatMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: oldPinId }),
      });
    }
    console.log(`💾 Zaxira yuborildi (${reason}, ${buf.length} bayt)`);
  } catch (e) {
    console.error('Zaxira xatosi:', e);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    backupBusy = false;
  }
}

// Ketma-ket o'zgarishlarni bitta zaxiraga birlashtiradi
function scheduleBackup(reason: string, delayMs = 90000) {
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = null;
    void backupDbToTelegram(reason);
  }, delayMs);
}

// Masofani hisoblash (Haversine)
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// =====================================================================
// ISH VAQTIDA NAZORAT (hududdan chiqish, aloqa uzilishi, kunlik hisobot)
// =====================================================================
type DB = InstanceType<typeof Database>;
interface Exc { id: number; jshr: string; fio: string; date_str: string; kind: string; left_ts: number; back_ts: number | null; max_distance: number }
interface Seen { jshr: string; ts: number; lat: number; lng: number; distance: number; accuracy: number | null }

const OUT_RADIUS = 600;       // shundan uzoq = hududdan chiqdi
const BACK_RADIUS = 450;      // shundan yaqin = qaytdi
const MAX_ACCURACY = 150;     // GPS aniqligi bundan yomon bo'lsa, hisobga olinmaydi
const CONFIRM_PINGS = 2;      // ketma-ket nechta signal tashqarida bo'lsa tasdiqlanadi
const SIGNAL_LOST_MIN = 15;   // necha daqiqa signal bo'lmasa "aloqa uzildi"
const WORK_START = 8 * 60 + 30;

const pad2 = (n: number) => String(n).padStart(2, '0');
const minsOf = (ms: number) => Math.max(0, Math.round(ms / 60000));
const hhmmOf = (total: number) => `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
const workEnd = (dow: number): number | null => (dow === 0 ? null : dow === 6 ? 13 * 60 : 16 * 60);

function tashkentNow() {
  const d = getTashkentTimeDetails();
  return { dateStr: d.dateStr, total: d.totalMinutes, dow: d.dayOfWeek };
}

function registerMonitoring(
  app: Express,
  db: DB,
  notify: (message: string) => Promise<void>,
  teachersOf: () => Teacher[]
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS last_seen (
      jshr TEXT PRIMARY KEY, ts INTEGER, lat REAL, lng REAL, distance REAL, accuracy REAL
    );
    CREATE TABLE IF NOT EXISTS excursions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, jshr TEXT, fio TEXT, date_str TEXT,
      kind TEXT, left_ts INTEGER, back_ts INTEGER, max_distance REAL
    );
    CREATE TABLE IF NOT EXISTS daily_reports (date_str TEXT PRIMARY KEY, sent_ts INTEGER);
    CREATE TABLE IF NOT EXISTS reports_sent (date_str TEXT, kind TEXT, sent_ts INTEGER, PRIMARY KEY (date_str, kind));
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS first_seen (jshr TEXT PRIMARY KEY, ts INTEGER);
    INSERT OR IGNORE INTO first_seen (jshr, ts) SELECT jshr, ts FROM last_seen;
    INSERT OR IGNORE INTO first_seen (jshr, ts)
      SELECT jshr, CAST(strftime('%s', MIN(server_timestamp)) AS INTEGER) * 1000 FROM attendance
      WHERE server_timestamp IS NOT NULL GROUP BY jshr HAVING strftime('%s', MIN(server_timestamp)) IS NOT NULL;
  `);
  const insFirst = db.prepare('INSERT OR IGNORE INTO first_seen (jshr, ts) VALUES (?, ?)');

  const findTeacher = (jshr: string) => teachersOf().find((t) => t.jshr === jshr);
  const strikes = new Map<string, number>();

  const getOpen = db.prepare('SELECT * FROM excursions WHERE jshr = ? AND back_ts IS NULL ORDER BY id DESC LIMIT 1');
  const insExc = db.prepare('INSERT INTO excursions (jshr, fio, date_str, kind, left_ts, max_distance) VALUES (?, ?, ?, ?, ?, ?)');
  const closeExc = db.prepare('UPDATE excursions SET back_ts = ? WHERE id = ?');
  const bumpMax = db.prepare('UPDATE excursions SET max_distance = MAX(max_distance, ?) WHERE id = ?');
  const upsertSeen = db.prepare(`
    INSERT INTO last_seen (jshr, ts, lat, lng, distance, accuracy) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(jshr) DO UPDATE SET ts = excluded.ts, lat = excluded.lat, lng = excluded.lng,
      distance = excluded.distance, accuracy = excluded.accuracy`);

  const todayStatus = (jshr: string, dateStr: string) => {
    const rows = db.prepare('SELECT action_type FROM attendance WHERE jshr = ? AND date_str = ?').all(jshr, dateStr) as { action_type: string }[];
    return { in: rows.some((r) => r.action_type === 'Keldi'), out: rows.some((r) => r.action_type === 'Ketdi') };
  };

  const endTsToday = (tn: ReturnType<typeof tashkentNow>) => {
    const end = workEnd(tn.dow);
    return end === null ? Date.now() : Date.now() - Math.max(0, tn.total - end) * 60000;
  };

  // ====== XODIMDAN KELADIGAN SIGNAL ======
  app.post('/api/ping', (req: Request, res: Response) => {
    const { jshr, latitude, longitude, accuracy } = req.body || {};
    const t = findTeacher(String(jshr || '').trim());
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!t || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, error: "Xodim yoki koordinata noto'g'ri" });
    }
    const acc = Number(accuracy);
    const now = Date.now();
    const tn = tashkentNow();
    const dist = Math.round(calculateDistanceMeters(COLLEGE_LAT, COLLEGE_LNG, lat, lng));
    upsertSeen.run(t.jshr, now, lat, lng, dist, Number.isFinite(acc) ? acc : null);
    insFirst.run(t.jshr, now);

    let open = getOpen.get(t.jshr) as Exc | undefined;

    // kechagi qolib ketgan yozuvni yopamiz
    if (open && open.date_str !== tn.dateStr) {
      closeExc.run(open.left_ts, open.id);
      open = undefined;
    }

    // aloqa tiklandi
    if (open && open.kind === 'signal') {
      closeExc.run(now, open.id);
      void notify(
        `🔄 <b>ALOQA TIKLANDI</b>\n\n👤 <b>${esc(t.fio)}</b>\n💼 ${esc(t.lavozim)}\n` +
          `⏱ Aloqasiz bo'lgan vaqt: <b>${minsOf(now - open.left_ts)} daq.</b>\n📍 Hozirgi masofa: ${dist} m`
      );
      open = undefined;
    }

    const st = todayStatus(t.jshr, tn.dateStr);
    const end = workEnd(tn.dow);
    const inWork = end !== null && tn.total >= WORK_START && tn.total <= end;

    // ketgan yoki ish vaqti tugagan: kuzatuv to'xtaydi
    if (!st.in || st.out || !inWork) {
      if (open) closeExc.run(Math.min(now, endTsToday(tn)), open.id);
      strikes.delete(t.jshr);
      return res.json({ success: true, tracking: false });
    }

    if (Number.isFinite(acc) && acc > MAX_ACCURACY) {
      return res.json({ success: true, tracking: true, ignored: 'accuracy' });
    }

    if (dist > OUT_RADIUS) {
      if (open) {
        bumpMax.run(dist, open.id);
      } else {
        const n = (strikes.get(t.jshr) || 0) + 1;
        strikes.set(t.jshr, n);
        if (n >= CONFIRM_PINGS) {
          insExc.run(t.jshr, t.fio, tn.dateStr, 'outside', now, dist);
          void notify(
            `🚨 <b>ISH VAQTIDA HUDUDDAN CHIQDI</b>\n\n👤 <b>${esc(t.fio)}</b>\n💼 ${esc(t.lavozim)}\n` +
              `⏰ Vaqt: ${hhmmOf(tn.total)}\n📍 Masofa: <b>${dist} m</b> (chegara ${OUT_RADIUS} m)\n` +
              `ℹ️ «Ketdim» belgisi hali qo'yilmagan.`
          );
        }
      }
    } else if (dist <= BACK_RADIUS) {
      strikes.delete(t.jshr);
      if (open) {
        closeExc.run(now, open.id);
        void notify(
          `✅ <b>HUDUDGA QAYTDI</b>\n\n👤 <b>${esc(t.fio)}</b>\n💼 ${esc(t.lavozim)}\n` +
            `⏱ Tashqarida bo'ldi: <b>${minsOf(now - open.left_ts)} daq.</b>\n📍 Eng uzoq masofa: ${Math.round(open.max_distance)} m`
        );
      }
    }
    return res.json({ success: true, tracking: true, distance: dist });
  });

  // ====== BUGUNGI HOLAT ======
  function buildToday(dateStr: string, capTs?: number) {
    const att = db
      .prepare('SELECT jshr, action_type, time_str, time_status FROM attendance WHERE date_str = ? ORDER BY server_timestamp ASC')
      .all(dateStr) as { jshr: string; action_type: string; time_str: string; time_status: string }[];
    const exc = db.prepare('SELECT * FROM excursions WHERE date_str = ?').all(dateStr) as Exc[];
    const seenMap = new Map((db.prepare('SELECT * FROM last_seen').all() as Seen[]).map((s) => [s.jshr, s]));
    const now = capTs ?? Date.now();

    return teachersOf().map((t) => {
      const mine = att.filter((a) => a.jshr === t.jshr);
      const inRec = mine.find((a) => a.action_type === 'Keldi');
      const outRec = [...mine].reverse().find((a) => a.action_type === 'Ketdi');
      const ex = exc.filter((e) => e.jshr === t.jshr);
      const openEx = ex.find((e) => e.back_ts === null);
      const outside = ex.filter((e) => e.kind === 'outside');
      const signal = ex.filter((e) => e.kind === 'signal');
      const seen = seenMap.get(t.jshr);
      const status = !inRec
        ? 'Kelmagan'
        : outRec
        ? 'Ketdi'
        : openEx
        ? openEx.kind === 'outside'
          ? 'Hududdan tashqarida'
          : "Aloqa yo'q"
        : 'Ishda';
      return {
        fio: t.fio,
        lavozim: t.lavozim,
        status,
        keldi: inRec?.time_str || '',
        ketdi: outRec?.time_str || '',
        late: !!inRec && inRec.time_status.startsWith('Kechikdi'),
        timeStatus: inRec?.time_status || '',
        outCount: outside.length,
        outMin: outside.reduce((s, e) => s + minsOf((e.back_ts ?? now) - e.left_ts), 0),
        outMax: outside.reduce((m, e) => Math.max(m, Math.round(e.max_distance)), 0),
        signalCount: signal.length,
        seenAgo: seen ? minsOf(Date.now() - seen.ts) : null,
        seenDist: seen ? Math.round(seen.distance) : null,
      };
    });
  }

  app.get('/api/monitor/today', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ success: false, error: "Ruxsat yo'q" });
    const tn = tashkentNow();
    return res.json({ success: true, date: tn.dateStr, rows: buildToday(tn.dateStr) });
  });

  app.get('/monitor', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(401).send(keyForm('/monitor'));
    const tn = tashkentNow();
    const rows = buildToday(tn.dateStr);
    const weight: Record<string, number> = { 'Hududdan tashqarida': 0, "Aloqa yo'q": 1, Kelmagan: 2, Ishda: 3, Ketdi: 4 };
    rows.sort((a, b) => weight[a.status] - weight[b.status] || a.fio.localeCompare(b.fio));
    const color: Record<string, string> = {
      'Hududdan tashqarida': '#f43f5e', "Aloqa yo'q": '#f59e0b', Kelmagan: '#94a3b8', Ishda: '#10b981', Ketdi: '#38bdf8',
    };
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    const key = encodeURIComponent(String(req.query.key));
    const body = rows
      .map(
        (r) => `<tr>
        <td><b>${esc(r.fio)}</b><div class="s">${esc(r.lavozim)}</div></td>
        <td><span class="b" style="background:${color[r.status]}22;color:${color[r.status]}">${r.status}</span></td>
        <td>${r.keldi || '-'}${r.late ? ' ⚠️' : ''}</td>
        <td>${r.ketdi || '-'}</td>
        <td>${r.outCount ? `${r.outCount} marta, ${r.outMin} daq. (maks. ${r.outMax} m)` : '-'}${r.signalCount ? `<div class="s">aloqa uzilgan: ${r.signalCount}</div>` : ''}</td>
        <td>${r.seenAgo === null ? '-' : `${r.seenAgo} daq. oldin, ${r.seenDist} m`}</td></tr>`
      )
      .join('');
    res.send(`<!doctype html><html lang="uz"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60">
<title>Davomat nazorati</title><style>
body{margin:0;background:#050816;color:#e2e8f0;font-family:system-ui,sans-serif;padding:16px}
h1{font-size:18px;margin:0 0 4px}.s{font-size:11px;color:#64748b}a{color:#38bdf8;font-size:13px}
.k{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.k div{background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:10px 14px}
.k b{font-size:20px;display:block}.w{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:720px;font-size:13px}
th{text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;padding:8px;border-bottom:1px solid #1e293b}
td{padding:9px 8px;border-bottom:1px solid #0f172a;vertical-align:top}.b{padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700}
</style></head><body>
<h1>🛡️ Davomat nazorati — ${tn.dateStr}</h1><div class="s">Har 60 soniyada yangilanadi · ${hhmmOf(tn.total)}</div>
<a href="/admin/employees?key=${key}">👥 Xodimlarni boshqarish</a> · <a href="/registered?key=${key}">✅ Ro'yxatdan o'tganlar</a>
<div class="k"><div><b style="color:#10b981">${count('Ishda')}</b>Ishda</div><div><b style="color:#f43f5e">${count('Hududdan tashqarida')}</b>Tashqarida</div>
<div><b style="color:#f59e0b">${count("Aloqa yo'q")}</b>Aloqa yo'q</div><div><b style="color:#94a3b8">${count('Kelmagan')}</b>Kelmagan</div>
<div><b style="color:#38bdf8">${count('Ketdi')}</b>Ketgan</div></div>
<div class="w"><table><tr><th>Xodim</th><th>Holat</th><th>Keldi</th><th>Ketdi</th><th>Ish vaqtida chiqishlar</th><th>Oxirgi signal</th></tr>${body}</table></div>
</body></html>`);
  });

  // ====== RO'YXATDAN O'TGANLAR / O'TMAGANLAR ======
  app.get('/registered', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(401).send(keyForm('/registered'));
    const key = encodeURIComponent(String(req.query.key));
    const firstMap = new Map(
      (db.prepare('SELECT jshr, ts FROM first_seen').all() as { jshr: string; ts: number }[]).map((r) => [r.jshr, r.ts])
    );
    const seenMap = new Map((db.prepare('SELECT * FROM last_seen').all() as Seen[]).map((r) => [r.jshr, r]));
    const fmt = (ts: number) => {
      const d = getTashkentTimeDetails(new Date(ts).toISOString());
      return `${d.dateStr} ${d.timeStr}`;
    };
    const all = teachersOf();
    const done = all.filter((t) => firstMap.has(t.jshr)).sort((a, b) => firstMap.get(a.jshr)! - firstMap.get(b.jshr)!);
    const notDone = all.filter((t) => !firstMap.has(t.jshr)).sort((a, b) => a.fio.localeCompare(b.fio));
    const rowsDone = done
      .map((t, i) => {
        const sn = seenMap.get(t.jshr);
        return `<tr><td>${i + 1}</td><td><b>${esc(t.fio)}</b><div class="s">${esc(t.lavozim)}</div></td>
        <td>${fmt(firstMap.get(t.jshr)!)}</td><td>${sn ? minsOf(Date.now() - sn.ts) + ' daq. oldin' : '-'}</td></tr>`;
      })
      .join('');
    const rowsNot = notDone
      .map((t, i) => `<tr><td>${i + 1}</td><td><b>${esc(t.fio)}</b><div class="s">${esc(t.lavozim)}</div></td></tr>`)
      .join('');
    res.send(`<!doctype html><html lang="uz"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Ro'yxatdan o'tganlar</title><style>
body{margin:0;background:#050816;color:#e2e8f0;font-family:system-ui,sans-serif;padding:16px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px}.s{font-size:11px;color:#64748b}a{color:#38bdf8;font-size:13px}
.k{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.k div{background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:10px 14px}
.k b{font-size:20px;display:block}.w{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:420px;font-size:13px}
th{text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;padding:8px;border-bottom:1px solid #1e293b}
td{padding:9px 8px;border-bottom:1px solid #0f172a;vertical-align:top}
</style></head><body>
<h1>✅ Ro'yxatdan o'tganlar</h1>
<div class="s">Ilovani ochib, profil kiritgan va birinchi GPS signali (yoki davomati) serverga kelgan xodimlar</div>
<a href="/monitor?key=${key}">🛡️ Nazorat</a> · <a href="/admin/employees?key=${key}">👥 Xodimlar</a>
<div class="k"><div><b style="color:#10b981">${done.length}</b>O'tgan</div><div><b style="color:#f43f5e">${notDone.length}</b>O'tmagan</div><div><b>${all.length}</b>Jami</div></div>
<h2>O'tganlar (birinchi marta kirgan vaqti bilan)</h2>
<div class="w"><table><tr><th>#</th><th>Xodim</th><th>Birinchi kirgan</th><th>Oxirgi signal</th></tr>${rowsDone || '<tr><td colspan="4" class="s">Hali hech kim yo\'q</td></tr>'}</table></div>
<h2>O'tmaganlar</h2>
<div class="w"><table><tr><th>#</th><th>Xodim</th></tr>${rowsNot || '<tr><td colspan="2" class="s">Hamma o\'tgan 🎉</td></tr>'}</table></div>
</body></html>`);
  });

  // ====== KUNLIK HISOBOT ======
  async function sendChunks(lines: string[]) {
    let buf = '';
    for (const line of lines) {
      if (buf.length + line.length + 1 > 3500) {
        await notify(buf);
        buf = '';
      }
      buf += line + '\n';
    }
    if (buf.trim()) await notify(buf);
  }

  const byTime = (x: string, y: string) => (x || '99:99').localeCompare(y || '99:99');

  // 08:40 — ertalabki davomat
  async function sendMorningReport(tn: ReturnType<typeof tashkentNow>, late = false) {
    const rows = buildToday(tn.dateStr);
    const came = rows.filter((r) => r.keldi).sort((a, b) => byTime(a.keldi, b.keldi));
    const absent = rows.filter((r) => !r.keldi);
    const lines = [
      `🌅 <b>ERTALABKI DAVOMAT — ${tn.dateStr}</b>`,
      '',
      `Jami: ${rows.length} · Kelgan: ${came.length} · Kelmagan: ${absent.length}`,
      '',
    ];
    if (came.length) {
      lines.push(`✅ <b>Kelganlar (${came.length}):</b>`);
      came.forEach((r) => lines.push(`• ${esc(r.fio)} — ${r.keldi}${r.late ? ' ⚠️ ' + esc(r.timeStatus) : ''}`));
      lines.push('');
    }
    if (absent.length) {
      lines.push(`❌ <b>Kelmaganlar (${absent.length}):</b>`);
      absent.forEach((r) => lines.push(`• ${esc(r.fio)}`));
    }
    await sendChunks(late ? [lines[0], '⚠️ <i>Kechikib yuborildi — hisobot vaqtida server ishlamagan edi</i>', ...lines.slice(1)] : lines);
  }

  // ish tugaganidan 30 daqiqa keyin (16:30) — ketganlar
  async function sendLeaveReport(tn: ReturnType<typeof tashkentNow>, late = false) {
    const rows = buildToday(tn.dateStr, endTsToday(tn));
    const left = rows.filter((r) => r.ketdi).sort((a, b) => byTime(a.ketdi, b.ketdi));
    const stay = rows.filter((r) => r.keldi && !r.ketdi);
    const lines = [
      `🏁 <b>KETISH HISOBOTI — ${tn.dateStr}</b>`,
      '',
      `Ketganlar: ${left.length} · «Ketdim» bosmaganlar: ${stay.length}`,
      '',
    ];
    if (left.length) {
      lines.push(`🔴 <b>Ketganlar (${left.length}):</b>`);
      left.forEach((r) => lines.push(`• ${esc(r.fio)} — ${r.ketdi}`));
      lines.push('');
    }
    if (stay.length) {
      lines.push(`❓ <b>«Ketdim» bosmaganlar (${stay.length}):</b>`);
      stay.forEach((r) => lines.push(`• ${esc(r.fio)} — keldi ${r.keldi}`));
    }
    await sendChunks(late ? [lines[0], '⚠️ <i>Kechikib yuborildi — hisobot vaqtida server ishlamagan edi</i>', ...lines.slice(1)] : lines);
  }

  // ish tugaganidan 60 daqiqa keyin (17:00) — hammasi bitta ro'yxatda
  async function sendDailyReport(tn: ReturnType<typeof tashkentNow>, late = false) {
    const rows = buildToday(tn.dateStr, endTsToday(tn));
    const came = rows.filter((r) => r.keldi).sort((a, b) => byTime(a.keldi, b.keldi));
    const absent = rows.filter((r) => !r.keldi);
    const noOut = came.filter((r) => !r.ketdi);
    const outs = rows.filter((r) => r.outCount > 0);
    const sig = rows.filter((r) => r.signalCount > 0);

    const lines = [
      `📋 <b>KUNLIK YAKUNIY HISOBOT — ${tn.dateStr}</b>`,
      '',
      `Jami: ${rows.length} · Kelgan: ${came.length} · Kelmagan: ${absent.length} · «Ketdim» bosmagan: ${noOut.length}`,
      '',
    ];
    if (came.length) {
      lines.push(`✅ <b>Davomat (keldi → ketdi):</b>`);
      came.forEach((r, i) =>
        lines.push(`${i + 1}. ${esc(r.fio)} — ${r.keldi} → ${r.ketdi || '❓'}${r.late ? ' ⚠️' : ''}`)
      );
      lines.push('');
      lines.push('⚠️ — kechikkan · ❓ — «Ketdim» bosilmagan');
      lines.push('');
    }
    if (outs.length) {
      lines.push(`🚨 <b>Ish vaqtida hududdan chiqqanlar (${outs.length}):</b>`);
      outs.forEach((r) => lines.push(`• ${esc(r.fio)} — ${r.outCount} marta, jami ${r.outMin} daq. (maks. ${r.outMax} m)`));
      lines.push('');
    }
    if (sig.length) {
      lines.push(`📡 <b>Aloqasi uzilganlar (${sig.length}):</b>`);
      sig.forEach((r) => lines.push(`• ${esc(r.fio)} — ${r.signalCount} marta`));
      lines.push('');
    }
    if (absent.length) {
      lines.push(`❌ <b>Kelmaganlar (${absent.length}):</b>`);
      absent.forEach((r) => lines.push(`• ${esc(r.fio)}`));
    }
    await sendChunks(late ? [lines[0], '⚠️ <i>Kechikib yuborildi — hisobot vaqtida server ishlamagan edi</i>', ...lines.slice(1)] : lines);
  }

  // ====== HAR DAQIQADA TEKSHIRUV ======
  function watchdog() {
    const tn = tashkentNow();
    const end = workEnd(tn.dow);
    if (end === null) return;
    const now = Date.now();

    // Hisobotlar jadvali (har biri kuniga bir marta; kech qayta ishga tushsa takror yuborilmaydi)
    const sendOnce = (kind: string, from: number, lateUntil: number, fn: (late: boolean) => Promise<void>) => {
      if (tn.total < from || tn.total > lateUntil) return;
      const done = db.prepare('SELECT 1 FROM reports_sent WHERE date_str = ? AND kind = ?').get(tn.dateStr, kind);
      if (done) return;
      db.prepare('INSERT INTO reports_sent (date_str, kind, sent_ts) VALUES (?, ?, ?)').run(tn.dateStr, kind, now);
      const late = tn.total > from + 90;
      if (late) {
        // Kechikib yuborishdan oldin ma'lumot ishonchli ekanini tekshiramiz (baza o'chib ketgan bo'lsa, yolg'on hisobot yubormaymiz)
        const c = db.prepare('SELECT COUNT(*) AS c FROM attendance WHERE date_str = ?').get(tn.dateStr) as { c: number };
        if (restoreUncertain || c.c === 0) {
          console.error(`Kechikkan hisobot (${kind}) o'tkazib yuborildi: bugungi ma'lumot ishonchsiz`);
          return;
        }
      }
      scheduleBackup('hisobot', 30000);
      void fn(late);
    };
    sendOnce('morning', 8 * 60 + 40, end, (late) => sendMorningReport(tn, late)); // 08:40
    sendOnce('leave', end + 30, 23 * 60 + 55, (late) => sendLeaveReport(tn, late)); // 16:30 (shanba 13:30)
    sendOnce('final', end + 60, 23 * 60 + 55, (late) => sendDailyReport(tn, late)); // 17:00 (shanba 14:00)

    if (tn.total < WORK_START || tn.total > end) return;

    const ins = db
      .prepare("SELECT jshr, MIN(server_timestamp) AS in_ts FROM attendance WHERE date_str = ? AND action_type = 'Keldi' GROUP BY jshr")
      .all(tn.dateStr) as { jshr: string; in_ts: string }[];
    const outs = new Set(
      (db.prepare("SELECT DISTINCT jshr FROM attendance WHERE date_str = ? AND action_type = 'Ketdi'").all(tn.dateStr) as { jshr: string }[]).map((r) => r.jshr)
    );

    for (const r of ins) {
      if (outs.has(r.jshr)) continue;
      const t = findTeacher(r.jshr);
      if (!t || getOpen.get(r.jshr)) continue;
      const seen = db.prepare('SELECT * FROM last_seen WHERE jshr = ?').get(r.jshr) as Seen | undefined;
      const ref = Math.max(seen?.ts ?? 0, Date.parse(r.in_ts) || 0);
      if (now - ref < SIGNAL_LOST_MIN * 60000) continue;
      insExc.run(t.jshr, t.fio, tn.dateStr, 'signal', ref, seen?.distance ?? 0);
      void notify(
        `📡 <b>ALOQA UZILDI</b>\n\n👤 <b>${esc(t.fio)}</b>\n💼 ${esc(t.lavozim)}\n` +
          `⏱ Oxirgi signal: <b>${minsOf(now - ref)} daq.</b> oldin\n📍 Oxirgi masofa: ${seen ? Math.round(seen.distance) + ' m' : "noma'lum"}\n` +
          `ℹ️ Ilova yopilgan, GPS yoki internet o'chirilgan bo'lishi mumkin. «Ketdim» belgisi qo'yilmagan.`
      );
    }
  }

  setInterval(() => {
    try {
      watchdog();
    } catch (e) {
      console.error('Watchdog xatosi:', e);
    }
  }, 60000);
}

// =====================================================================
// SERVER
// =====================================================================
async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Nazorat tizimini ulash (/api/ping, /monitor, kunlik hisobot)
  registerMonitoring(app, db, sendTelegramNotification, getTeachers);

  // ====== XODIMLARNI BOSHQARISH (faqat admin) ======
  app.get('/admin/employees', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(401).send(keyForm('/admin/employees'));
    const key = encodeURIComponent(String(req.query.key));
    const msg = typeof req.query.msg === 'string' ? req.query.msg : '';
    const list = db
      .prepare('SELECT id, jshr, fio, lavozim FROM employees WHERE active = 1 ORDER BY fio COLLATE NOCASE')
      .all() as Teacher[];
    const rows = list
      .map(
        (r) => `<tr><td><b>${esc(r.fio)}</b><div class="s">${esc(r.lavozim)}</div></td>
        <td class="m">${maskJshr(r.jshr)}</td>
        <td><form method="post" action="/admin/employees/remove?key=${key}" onsubmit="return confirm('Xodim royxatdan ochirilsinmi?')">
        <input type="hidden" name="id" value="${r.id}"><button class="d">O'chirish</button></form></td></tr>`
      )
      .join('');
    res.send(`<!doctype html><html lang="uz"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Xodimlar</title><style>
body{margin:0;background:#050816;color:#e2e8f0;font-family:system-ui,sans-serif;padding:16px;max-width:760px;margin:auto}
h1{font-size:18px}.s{font-size:11px;color:#64748b}a{color:#38bdf8;font-size:13px}
.c{background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:16px;margin:14px 0}
input{width:100%;box-sizing:border-box;padding:11px;border-radius:12px;border:1px solid #334155;background:#020617;color:#fff;margin:6px 0;font-size:14px}
button{padding:11px 16px;border-radius:12px;border:0;background:#0d9488;color:#fff;font-weight:700;font-size:14px}
button.d{background:#be123c;padding:7px 12px;font-size:12px}.m{font-family:monospace;color:#94a3b8;font-size:12px}
.msg{background:#0d948822;border:1px solid #0d9488;color:#5eead4;border-radius:12px;padding:10px;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:8px 6px;border-bottom:1px solid #1e293b}
</style></head><body>
<h1>👥 Xodimlar (${list.length})</h1><a href="/monitor?key=${key}">← Nazorat sahifasi</a>
${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
<form class="c" method="post" action="/admin/employees/add?key=${key}">
<b>➕ Yangi xodim qo'shish</b>
<input name="fio" placeholder="Familiya Ism Sharif" required minlength="5">
<input name="lavozim" list="lv" placeholder="Lavozimi" required>
<datalist id="lv"><option value="O'qituvchi"><option value="ICHITU"><option value="Ma'muriyat"><option value="Xodim"></datalist>
<input name="jshr" placeholder="14 xonali JSHR" inputmode="numeric" maxlength="14" minlength="14" pattern="[0-9]{14}" required>
<button>Qo'shish</button></form>
<div class="c"><table>${rows}</table></div>
</body></html>`);
  });

  app.post('/admin/employees/add', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(401).send("Ruxsat yo'q");
    const back = (m: string) =>
      res.redirect(`/admin/employees?key=${encodeURIComponent(String(req.query.key))}&msg=${encodeURIComponent(m)}`);
    const jshr = String(req.body.jshr || '').replace(/\D/g, '');
    const fio = String(req.body.fio || '').trim().replace(/\s+/g, ' ');
    const lavozim = String(req.body.lavozim || '').trim();
    if (jshr.length !== 14) return back("JSHR 14 xonali bo'lishi kerak.");
    if (fio.length < 5) return back("Ism-familiyani to'liq kiriting.");
    if (!lavozim) return back('Lavozimni kiriting.');

    const ex = db.prepare('SELECT id, fio, active FROM employees WHERE jshr = ?').get(jshr) as
      | { id: number; fio: string; active: number }
      | undefined;
    if (ex && ex.active === 1) return back(`Bu JSHR allaqachon mavjud: ${ex.fio}`);
    if (ex) {
      db.prepare('UPDATE employees SET fio = ?, lavozim = ?, active = 1 WHERE id = ?').run(fio, lavozim, ex.id);
    } else {
      db.prepare('INSERT INTO employees (jshr, fio, lavozim) VALUES (?, ?, ?)').run(jshr, fio, lavozim);
    }
    scheduleBackup('xodim');
    void sendTelegramNotification(
      `➕ <b>Yangi xodim qo'shildi</b>\n\n👤 ${esc(fio)}\n💼 ${esc(lavozim)}\n🆔 ${maskJshr(jshr)}`
    );
    return back(`Qo'shildi: ${fio}`);
  });

  app.post('/admin/employees/remove', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(401).send("Ruxsat yo'q");
    const id = Number(req.body.id);
    const ex = db.prepare('SELECT fio FROM employees WHERE id = ? AND active = 1').get(id) as { fio: string } | undefined;
    let m = 'Xodim topilmadi.';
    if (ex) {
      db.prepare('UPDATE employees SET active = 0 WHERE id = ?').run(id);
      scheduleBackup('xodim');
      void sendTelegramNotification(`➖ <b>Xodim ro'yxatdan o'chirildi</b>\n\n👤 ${esc(ex.fio)}`);
      m = `O'chirildi: ${ex.fio}`;
    }
    return res.redirect(`/admin/employees?key=${encodeURIComponent(String(req.query.key))}&msg=${encodeURIComponent(m)}`);
  });

  // Faqat admin: JSHR yashirilgan holda
  app.get('/api/teachers', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ success: false, error: "Ruxsat yo'q" });
    const teachers = getTeachers().map((t) => ({ id: t.id, fio: t.fio, lavozim: t.lavozim, jshr: maskJshr(t.jshr) }));
    res.json({ success: true, count: teachers.length, teachers });
  });

  app.post('/check-attendance', async (req: Request, res: Response) => {
    const { jshr, latitude, longitude, action_type, timestamp, device_info, synced_from_offline } = req.body;

    if (!jshr || latitude === undefined || longitude === undefined || !action_type) {
      return res.status(400).json({
        success: false,
        error: 'Kerakli parametrlar yetishmayapti: jshr, latitude, longitude, action_type talab qilinadi.',
      });
    }

    if (action_type !== 'Keldi' && action_type !== 'Ketish' && action_type !== 'Ketdi') {
      return res.status(400).json({
        success: false,
        error: "action_type faqat 'Keldi' yoki 'Ketdi' bo'lishi kerak.",
      });
    }

    const normalizedAction = action_type === 'Ketish' ? 'Ketdi' : action_type;
    const cleanJshr = String(jshr).trim();
    const teacher = getTeachers().find((t) => t.jshr === cleanJshr);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: `Diqqat! Bunday PNFL (${maskJshr(cleanJshr)}) egasi texnikum xodimlarining rasmiy bazasida topilmadi.`,
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const distance = calculateDistanceMeters(COLLEGE_LAT, COLLEGE_LNG, lat, lng);
    const withinGeofence = distance <= GEOFENCE_RADIUS_METERS;

    const { dateStr, timeStr, totalMinutes, dayOfWeek } = getTashkentTimeDetails(timestamp);

    // Bir kunda bir xil belgi ikki marta yozilmasin
    const dup = db
      .prepare('SELECT 1 FROM attendance WHERE jshr = ? AND date_str = ? AND action_type = ?')
      .get(cleanJshr, dateStr, normalizedAction);
    if (dup) {
      return res.status(200).json({
        success: true,
        status: 'already',
        message: `${teacher.fio}: bugun «${normalizedAction}» allaqachon qayd etilgan.`,
      });
    }

    let timeStatus = "O'z vaqtida";
    let statusAlertEmoji = '✅';
    let extraTelegramNote = '';

    const WORK_START_MINUTES = 8 * 60 + 30; // 08:30

    if (normalizedAction === 'Keldi') {
      if (totalMinutes > WORK_START_MINUTES) {
        const lateMins = totalMinutes - WORK_START_MINUTES;
        timeStatus = `Kechikdi (${lateMins} daq.)`;
        statusAlertEmoji = '⚠️';
        extraTelegramNote = `\n🚨 <b>DIQQAT: Xodim 08:30 dan kechikib keldi! (${lateMins} daqiqa)</b>`;
      } else {
        timeStatus = "O'z vaqtida keldi";
      }
    } else if (normalizedAction === 'Ketdi') {
      if (dayOfWeek === 6) {
        const SATURDAY_END_MINUTES = 13 * 60; // 13:00
        if (totalMinutes < SATURDAY_END_MINUTES) {
          const earlyMins = SATURDAY_END_MINUTES - totalMinutes;
          timeStatus = `Shanba erta ketdi (${earlyMins} daq.)`;
          statusAlertEmoji = '⚠️';
          extraTelegramNote = `\n🚨 <b>DIQQAT (Shanba): Xodim 13:00 dan oldin chiqib ketdi! (${earlyMins} daqiqa ertaroq)</b>`;
        } else {
          timeStatus = "O'z vaqtida ketdi (Shanba)";
          extraTelegramNote = `\nℹ️ <b>Shanba kuni soat 13:00 dan keyin binodan chiqib ketdi.</b>`;
        }
      } else {
        const WEEKDAY_END_MINUTES = 16 * 60; // 16:00
        if (totalMinutes < WEEKDAY_END_MINUTES) {
          const earlyMins = WEEKDAY_END_MINUTES - totalMinutes;
          timeStatus = `Oldin chiqib ketdi (${earlyMins} daq.)`;
          statusAlertEmoji = '⚠️';
          extraTelegramNote = `\n🚨 <b>DIQQAT: Xodim 16:00 dan oldin chiqib ketdi! (${earlyMins} daqiqa ertaroq)</b>`;
        } else {
          timeStatus = "O'z vaqtida ketdi";
          extraTelegramNote = `\nℹ️ <b>Xodim ish vaqtidan keyin binodan chiqib ketdi.</b>`;
        }
      }
    }

    const recordId = 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const serverTimestamp = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO attendance (
        id, jshr, fio, lavozim, latitude, longitude, action_type,
        date_str, time_str, time_status, timestamp, server_timestamp,
        distance_meters, within_geofence, device_info, ip, synced_from_offline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      recordId,
      cleanJshr,
      teacher.fio,
      teacher.lavozim,
      lat,
      lng,
      normalizedAction,
      dateStr,
      timeStr,
      timeStatus,
      timestamp || serverTimestamp,
      serverTimestamp,
      distance,
      withinGeofence ? 1 : 0,
      device_info || req.headers['user-agent'] || 'Android Device',
      (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
      synced_from_offline ? 1 : 0
    );
    db.prepare('INSERT OR IGNORE INTO first_seen (jshr, ts) VALUES (?, ?)').run(cleanJshr, Date.now());
    scheduleBackup('davomat');

    const actionEmoji = normalizedAction === 'Keldi' ? '🟢' : '🔴';
    const geoText = withinGeofence ? '✅ Kollej hududida' : '❌ Hududdan tashqarida';

    const telegramMsg =
      `<b>${actionEmoji} Davomat qayd etildi!</b>\n\n` +
      `👤 <b>FIO:</b> ${esc(teacher.fio)}\n` +
      `📌 <b>Lavozim:</b> ${esc(teacher.lavozim)}\n` +
      `📋 <b>Harakat:</b> ${normalizedAction}\n` +
      `🕒 <b>Soat:</b> ${timeStr} (${dateStr})\n` +
      `${statusAlertEmoji} <b>Intizom:</b> ${timeStatus}\n` +
      `📍 <b>Masofa:</b> ${distance}m (${geoText})` +
      extraTelegramNote;

    // Ilova rasmli xabarni o'zi yuboradi; "silent" bo'lsa server takrorlamaydi
    if (!req.body.silent) await sendTelegramNotification(telegramMsg);

    return res.status(200).json({
      success: true,
      status: 'success',
      message: `${teacher.fio}: ${normalizedAction} (${timeStr}) - ${timeStatus}`,
      data: {
        id: recordId,
        jshr: maskJshr(cleanJshr),
        fio: teacher.fio,
        lavozim: teacher.lavozim,
        action_type: normalizedAction,
        date_str: dateStr,
        time_str: timeStr,
        time_status: timeStatus,
        distance_meters: distance,
        within_geofence: withinGeofence,
      },
    });
  });

  // Faqat admin
  app.get('/api/attendance-history', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ success: false, error: "Ruxsat yo'q" });
    const jshr = req.query.jshr as string;
    const fio = req.query.fio as string;

    let query = 'SELECT * FROM attendance WHERE 1=1';
    const params: any[] = [];

    if (jshr) {
      query += ' AND jshr = ?';
      params.push(jshr);
    }
    if (fio) {
      query += ' AND fio LIKE ?';
      params.push(`%${fio}%`);
    }

    query += ' ORDER BY server_timestamp DESC LIMIT 500';
    const records = (db.prepare(query).all(...params) as any[]).map((r) => ({ ...r, jshr: maskJshr(r.jshr) }));

    res.json({
      success: true,
      college: { latitude: COLLEGE_LAT, longitude: COLLEGE_LNG, radius: GEOFENCE_RADIUS_METERS },
      count: records.length,
      records,
    });
  });

  // Faqat admin: JSHR yashirilgan CSV
  app.get('/api/export', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ success: false, error: "Ruxsat yo'q" });
    const records: any[] = db.prepare('SELECT * FROM attendance ORDER BY server_timestamp ASC').all();

    if (records.length === 0) {
      return res.status(404).json({ success: false, error: "Yuklab olish uchun ma'lumotlar mavjud emas!" });
    }

    interface DailySummary {
      date: string;
      jshr: string;
      fio: string;
      lavozim: string;
      keldi_vaqt: string;
      keldi_holat: string;
      ketdi_vaqt: string;
      ketdi_holat: string;
    }

    const groupedMap = new Map<string, DailySummary>();

    for (const log of records) {
      const key = `${log.date_str}_${log.jshr}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          date: log.date_str,
          jshr: maskJshr(log.jshr),
          fio: log.fio,
          lavozim: log.lavozim,
          keldi_vaqt: '-',
          keldi_holat: 'Kelmagan',
          ketdi_vaqt: '-',
          ketdi_holat: 'Ketmagan',
        });
      }

      const entry = groupedMap.get(key)!;
      if (log.action_type === 'Keldi' && entry.keldi_vaqt === '-') {
        entry.keldi_vaqt = log.time_str;
        entry.keldi_holat = log.time_status;
      } else if (log.action_type === 'Ketdi') {
        entry.ketdi_vaqt = log.time_str;
        entry.ketdi_holat = log.time_status;
      }
    }

    let csv = '\uFEFFSana,PNFL (JSHR),FIO,Lavozim,Kelgan soati,Kelish holati,Ketgan soati,Ketish holati\n';

    groupedMap.forEach((row) => {
      csv += `"${row.date}","${row.jshr}","${row.fio}","${row.lavozim}","${row.keldi_vaqt}","${row.keldi_holat}","${row.ketdi_vaqt}","${row.ketdi_holat}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=texnikum_kunlik_davomat.csv');
    return res.status(200).send(csv);
  });

  // Bazani tozalash faqat admin kalit bilan
  app.post('/api/attendance-clear', (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ success: false, error: "Ruxsat yo'q" });
    db.exec('DELETE FROM attendance');
    res.json({ success: true, message: 'Baza tozalandi.' });
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    const countRow: any = db.prepare('SELECT COUNT(*) as cnt FROM attendance').get();
    res.json({
      status: 'online',
      service: "Yakkabog' 2-son Texnikum Davomat API Server",
      teachers_loaded: getTeachers().length,
      total_saved_records: countRow.cnt,
      database: 'SQLite',
      db_path: DB_FILE,
      telegram_backup: !!TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length > 0,
      work_hours: 'Mon-Fri: 08:30-16:00, Sat: 08:30-13:00',
      telegram_configured: !!TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length > 0,
      timestamp: new Date().toISOString(),
    });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });

  // Ishga tushgandan 2 daqiqa keyin birinchi zaxira (pin qilingan fayl bo'lishi uchun)
  scheduleBackup('start', 120000);

  // Har 3 soatda zaxira (o'zgarish bo'lmasa ham)
  setInterval(() => void backupDbToTelegram('davriy'), 3 * 60 * 60 * 1000);
}

startServer();

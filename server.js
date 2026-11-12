const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// SQLite bazasini ochish
const db = new Database('attendance.db');

// Jadvalni yaratish
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
  )
`);

const COLLEGE_LAT = 38.971199;
const COLLEGE_LNG = 66.707470;
const GEOFENCE_RADIUS_METERS = 500;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9241880191:AAHfYqQSQC9KOpeAfFdomyft9nhIBm-h6sk';
const TELEGRAM_CHAT_IDS = [
  '1179846016',
  '727029645',
  '1838498079',
  '1611805500'
];

function getTashkentTimeDetails(isoString) {
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

async function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN) return;
  
  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
    } catch (err) {
      console.error(`Telegram xabar yuborishda xatolik (${chatId}):`, err);
    }
  }
}

// 93 nafar xodim bazasi
const TEACHERS_DATABASE = [
  { id: 1, fio: 'Xujaniyozov Bekzod Sunnatovich', lavozim: 'Direktor', jshr: '30306812710045' },
  { id: 2, fio: 'Sultonov Abror Tursunpo\'lat o\'g\'li', lavozim: 'O\'IBDO\'', jshr: '30812917530017' },
  { id: 3, fio: 'Husanov Zohid Pardayevich', lavozim: 'Yo\'IBDO\'', jshr: '32406822710049' },
  { id: 4, fio: 'Qulmamatov Azamat Xolmamatovich', lavozim: 'ICHIBDO\'', jshr: '31712725730022' },
  { id: 5, fio: 'Ismatov Xudoyqul Dilshod o\'g\'li', lavozim: 'Ta\'lim sifatini nazorat qilish bosh mutaxassisi', jshr: '30102985730037' },
  { id: 6, fio: 'Azimov Tohir Eshpo\'latovich', lavozim: 'Bosh hisobchi', jshr: '31009732710023' },
  { id: 7, fio: 'Xo\'janov Chori Karimovich', lavozim: 'Xo\'jalik mudiri', jshr: '31304605730039' },
  { id: 8, fio: 'Ismatova Umida Dilshod qizi', lavozim: 'Kadrlar bo\'limi', jshr: '42308952710050' },
  { id: 9, fio: 'Moyliyev Muxtor Xushnurodovich', lavozim: 'Uslubchi', jshr: '32501715730026' },
  { id: 10, fio: 'Boysunov Chimnigul Xayrullayevna', lavozim: 'Bo\'lim boshlig\'i', jshr: '41401815730020' },
  { id: 11, fio: 'Ravshanov Otabek Abdurashidovich', lavozim: 'CHYOT rahbari', jshr: '33112915590010' },
  { id: 12, fio: 'Jonqobilova Dilnoza Hamidovna', lavozim: 'Tarmoq administratori', jshr: '41902852710117' },
  { id: 13, fio: 'Norchayeva Ro\'zigul G\'ayratovna', lavozim: 'Yordamchi hisobchi', jshr: '41305862710117' },
  { id: 14, fio: 'Arziyeva Dilorom Raxmonovna', lavozim: 'Inspektor', jshr: '40805712710012' },
  { id: 15, fio: 'Maxmatqulova Gulhayo To\'ra qizi', lavozim: 'Kotiba', jshr: '40910922530023' },
  { id: 16, fio: 'Dilova Marhamat Ravshanovna', lavozim: 'Yotoqxona navbatchisi', jshr: '40903732560045' },
  { id: 17, fio: 'Muhammadiyeva Muqaddas Maxmadaliyevna', lavozim: 'Yotoqxona navbatchisi', jshr: '41203745730024' },
  { id: 18, fio: 'Primova Yulduz Mixliyevna', lavozim: 'Yotoqxona navbatchisi', jshr: '40506812530022' },
  { id: 19, fio: 'Ismoilov Sarvarjon Quchqarovich', lavozim: 'Bosh usta', jshr: '31405725730014' },
  { id: 20, fio: 'Abdiyeva Sohiba Mirzayevna', lavozim: 'Elektron kutubxonachi', jshr: '43012715730021' },
  { id: 21, fio: 'Eshmuminova O\'raz Kenjayevna', lavozim: 'ARM rahbari', jshr: '41510715730024' },
  { id: 22, fio: 'Sayfiyev Yashinbek Komil o\'g\'li', lavozim: 'Jismoniy tarbiya rahbari', jshr: '30901975560010' },
  { id: 23, fio: 'Aralova Yulduz Shodiyevna', lavozim: 'ICHITU', jshr: '41610742710023' },
  { id: 24, fio: 'Diyorova Nafosat Maxmudovna', lavozim: 'ICHITU', jshr: '43011735730015' },
  { id: 25, fio: 'Suyunov Eshmurod Eshonqulovich', lavozim: 'ICHITU', jshr: '32912642710096' },
  { id: 26, fio: 'Norboyev Eshmamat Muratovich', lavozim: 'ICHITU', jshr: '30501662710052' },
  { id: 27, fio: 'Qodirova Gulchexra Xoliqulovna', lavozim: 'ICHITU', jshr: '41005712710019' },
  { id: 28, fio: 'Abdiyev Akmal Tursunovich', lavozim: 'ICHITU', jshr: '30710705730012' },
  { id: 29, fio: 'Ulashev Xumoyun', lavozim: 'ICHITU', jshr: '50107035550058' },
  { id: 30, fio: 'Karimov Musurmon Asrorovich', lavozim: 'ICHITU', jshr: '30302852530036' },
  { id: 31, fio: 'To\'rayeva Shaxnoza Yuldoshevna', lavozim: 'ICHITU', jshr: '41312862690033' },
  { id: 32, fio: 'Sharipov Ma\'ruf Tolib o\'g\'li', lavozim: 'ICHITU', jshr: '31005942530022' },
  { id: 33, fio: 'Sharipov Abbos Azim o\'g\'li', lavozim: 'ICHITU', jshr: '30911912530022' },
  { id: 34, fio: 'Yo\'ldosheva Maftuna To\'lqinovna', lavozim: 'ICHITU', jshr: '40106905730016' },
  { id: 35, fio: 'Eshmurodov Asqar Tursunpulatovich', lavozim: 'ICHITU', jshr: '30312795560016' },
  { id: 36, fio: 'Suyunov G\'olibjon Ismatillayevich', lavozim: 'ICHITU', jshr: '33010852710017' },
  { id: 37, fio: 'Ochilov Sanjar Orif o\'g\'li', lavozim: 'ICHITU', jshr: '50101005730204' },
  { id: 38, fio: 'Yunusov Jasur Yunus o\'g\'li', lavozim: 'ICHITU', jshr: '32001985730015' },
  { id: 39, fio: 'Vahobov Qahramon', lavozim: 'ICHITU', jshr: '30403615550019' },
  { id: 40, fio: 'Abdiraxmonova Gulnoza Baxtiyorovna', lavozim: 'ICHITU', jshr: '40701882710057' },
  { id: 41, fio: 'Mo\'minov Farhod Fozilovich', lavozim: 'ICHITU', jshr: '30605882530022' },
  { id: 42, fio: 'Xayrullayev Burxon Erkinovich', lavozim: 'Avto boshqarish ICHITU', jshr: '32804792530054' },
  { id: 43, fio: 'Do\'sqorayev Xo\'lmo\'min Muhammadiyevich', lavozim: 'Avto boshqarish ICHITU', jshr: '32503682710034' },
  { id: 44, fio: 'Jo\'rayeva Nargiza Yuldoshevna', lavozim: 'Avto boshqarish ICHITU', jshr: '40507882690041' },
  { id: 45, fio: 'Ergashev Shodmon', lavozim: 'Avto boshqarish ICHITU', jshr: '30208682710078' },
  { id: 46, fio: 'Sultonov Baxriddin', lavozim: 'Avto boshqarish ICHITU', jshr: '31511672710059' },
  { id: 48, fio: 'Abdiraxmanova Kamola Abdirasulovna', lavozim: 'O\'qituvchi', jshr: '42409872710033' },
  { id: 49, fio: 'Ismatova Mo\'tabar Dilshod qizi', lavozim: 'O\'qituvchi', jshr: '42008965730026' },
  { id: 50, fio: 'Jo\'rayeva Sarvinoz', lavozim: 'O\'qituvchi', jshr: '42011872530041' },
  { id: 51, fio: 'Muzaffarova Xurshida Vahobovna', lavozim: 'O\'qituvchi', jshr: '40806882710015' },
  { id: 52, fio: 'Azizova Maftuna Bozorovna', lavozim: 'O\'qituvchi', jshr: '42311895730018' },
  { id: 53, fio: 'Suvonova Kamola Odilovna', lavozim: 'O\'qituvchi', jshr: '42206862710080' },
  { id: 54, fio: 'Mustafayeva Saboxat Komiljonovna', lavozim: 'O\'qituvchi', jshr: '41606915730035' },
  { id: 55, fio: 'Suyunov Sherdor Ismatilla o\'g\'li', lavozim: 'O\'qituvchi', jshr: '31505932710011' },
  { id: 56, fio: 'Muzaffarov Shuxrat Maqsudovich', lavozim: 'O\'qituvchi', jshr: '32304702710047' },
  { id: 57, fio: 'Eshqulova Setora Sheraliyevna', lavozim: 'O\'qituvchi', jshr: '40611905730013' },
  { id: 58, fio: 'Najimov G\'olib Turdiyevich', lavozim: 'O\'qituvchi', jshr: '30905735730020' },
  { id: 59, fio: 'Ergashova Dilbar Sherzod qizi', lavozim: 'O\'qituvchi', jshr: '40112985560061' },
  { id: 60, fio: 'Jobborov Bobomurod', lavozim: 'O\'qituvchi', jshr: '51311025730015' },
  { id: 61, fio: 'Qilichova Shoxista Tarib qizi', lavozim: 'O\'qituvchi', jshr: '62502025730044' },
  { id: 62, fio: 'Boqiyev Akobir Akbar o\'g\'li', lavozim: 'O\'qituvchi', jshr: '51110035560016' },
  { id: 63, fio: 'Usmonova Dilobar', lavozim: 'O\'qituvchi', jshr: '61103005630069' },
  { id: 64, fio: 'To\'rayeva Dilfuza To\'ra qizi', lavozim: 'O\'qituvchi', jshr: '40512905730046' },
  { id: 65, fio: 'Nafasova Gulsanam', lavozim: 'O\'qituvchi', jshr: '40501925590019' },
  { id: 66, fio: 'Xushvaqtova Husniya Abdivait qizi', lavozim: 'O\'qituvchi', jshr: '41203932710057' },
  { id: 67, fio: 'To\'rayeva Dilafro\'z To\'ra qizi', lavozim: 'O\'qituvchi', jshr: '41409955730016' },
  { id: 68, fio: 'Xudoynazarova Nigora Bozorovna', lavozim: 'O\'qituvchi', jshr: '42403862710076' },
  { id: 69, fio: 'Xolmurodov Jovli Abdirazzoqovich', lavozim: 'O\'qituvchi', jshr: '31212665730017' },
  { id: 70, fio: 'Safarova Sharofat Juma qizi', lavozim: 'O\'qituvchi', jshr: '40603852710075' },
  { id: 71, fio: 'Islomova Shoxida Erkin qizi', lavozim: 'O\'qituvchi', jshr: '41110995730035' },
  { id: 72, fio: 'Razzoqova Gulzoda Eshmo\'min qizi', lavozim: 'O\'qituvchi', jshr: '40908965730036' },
  { id: 73, fio: 'Baxriddinova Zarifa Erkin qizi', lavozim: 'O\'qituvchi', jshr: '43004942710037' },
  { id: 74, fio: 'Xushnazarov Feruz Ravshan o\'g\'li', lavozim: 'O\'qituvchi', jshr: '32705985730038' },
  { id: 75, fio: 'Razzoqova Go\'zal Ulashevna', lavozim: 'O\'qituvchi', jshr: '41007892620023' },
  { id: 76, fio: 'Nematova Marg\'uba Baxriddinova', lavozim: 'O\'qituvchi', jshr: '40501785560025' },
  { id: 77, fio: 'Norqobilova Iroda', lavozim: 'O\'qituvchi', jshr: '40302922710048' },
  { id: 78, fio: 'Asadova Fayoza Faxriddin qizi', lavozim: 'O\'qituvchi', jshr: '62911045740036' },
  { id: 79, fio: 'Umarov Behro\'z Faxriddin o\'g\'li', lavozim: 'O\'qituvchi', jshr: '31905975730016' },
  { id: 80, fio: 'Eshpo\'latov Abbos Tohir o\'g\'li', lavozim: 'O\'qituvchi', jshr: '52604015730030' },
  { id: 81, fio: 'Abdiraximova Laylo', lavozim: 'O\'qituvchi', jshr: '61906035730020' },
  { id: 82, fio: 'Turdiyeva Dildora', lavozim: 'O\'qituvchi', jshr: '42601862710058' },
  { id: 83, fio: 'Eshto\'xtarov Ibrohim', lavozim: 'O\'qituvchi', jshr: '51006045730076' },
  { id: 84, fio: 'Jo\'rayeva Durdona Nurali qizi', lavozim: 'O\'qituvchi', jshr: '42204942710050' },
  { id: 86, fio: 'Muhammadiyeva Sitora Shokir qizi', lavozim: 'O\'qituvchi', jshr: '62512025730010' },
  { id: 87, fio: 'Xudoyberdiyev Shaxriyor', lavozim: 'O\'qituvchi', jshr: '31503892710030' },
  { id: 88, fio: 'Eshmo\'minova Aziza', lavozim: 'O\'qituvchi', jshr: '42506882710087' },
  { id: 89, fio: 'Berdaliyeva Zulayho', lavozim: 'O\'qituvchi', jshr: '42312955590011' },
  { id: 90, fio: 'Normaxmatova Sarvinoz', lavozim: 'O\'qituvchi', jshr: '40102985730104' },
  { id: 91, fio: 'Rajapov Oybek Chorshanbiyevich', lavozim: 'O\'qituvchi', jshr: '32501715730026' },
  { id: 92, fio: 'Abdiraxmonova Muhayyo To\'ra qizi', lavozim: 'O\'qituvchi', jshr: '42902962620013' },
  { id: 93, fio: 'Chorshanbiyev Elbek', lavozim: 'O\'qituvchi', jshr: '32801902710014' }
];

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
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

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/api/teachers', (_req, res) => {
  res.json({ success: true, count: TEACHERS_DATABASE.length, teachers: TEACHERS_DATABASE });
});

app.post('/check-attendance', async (req, res) => {
  const { jshr, latitude, longitude, action_type, timestamp, device_info, synced_from_offline } = req.body;

  if (!jshr || latitude === undefined || longitude === undefined || !action_type) {
    return res.status(400).json({ success: false, error: 'Parametrlar yetishmayapti.' });
  }

  const normalizedAction = action_type === 'Ketish' ? 'Ketdi' : action_type;
  const cleanJshr = String(jshr).trim();
  const teacher = TEACHERS_DATABASE.find(t => t.jshr === cleanJshr);

  if (!teacher) {
    return res.status(404).json({ success: false, error: `PNFL (${cleanJshr}) topilmadi.` });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  const distance = calculateDistanceMeters(COLLEGE_LAT, COLLEGE_LNG, lat, lng);
  const withinGeofence = distance <= GEOFENCE_RADIUS_METERS;

  const { dateStr, timeStr, totalMinutes, dayOfWeek } = getTashkentTimeDetails(timestamp);
  
  let timeStatus = "O'z vaqtida";
  let statusAlertEmoji = "✅";
  let extraTelegramNote = "";

  const WORK_START_MINUTES = 8 * 60 + 30; // 08:30

  if (normalizedAction === 'Keldi') {
    if (totalMinutes > WORK_START_MINUTES) {
      const lateMins = totalMinutes - WORK_START_MINUTES;
      timeStatus = `Kechikdi (${lateMins} daq.)`;
      statusAlertEmoji = "⚠️";
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
        statusAlertEmoji = "⚠️";
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
        statusAlertEmoji = "⚠️";
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
    recordId, cleanJshr, teacher.fio, teacher.lavozim, lat, lng,
    normalizedAction, dateStr, timeStr, timeStatus,
    timestamp || serverTimestamp, serverTimestamp, distance,
    withinGeofence ? 1 : 0, device_info || 'Mobile Device',
    req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
    synced_from_offline ? 1 : 0
  );

  const actionEmoji = normalizedAction === 'Keldi' ? '🟢' : '🔴';
  const geoText = withinGeofence ? '✅ Kollej hududida' : '❌ Hududdan tashqarida';
  
  const telegramMsg = 
    `<b>${actionEmoji} Davomat qayd etildi!</b>\n\n` +
    `👤 <b>FIO:</b> ${teacher.fio}\n` +
    `📌 <b>Lavozim:</b> ${teacher.lavozim}\n` +
    `📋 <b>Harakat:</b> ${normalizedAction}\n` +
    `🕒 <b>Soat:</b> ${timeStr} (${dateStr})\n` +
    `${statusAlertEmoji} <b>Intizom:</b> ${timeStatus}\n` +
    `📍 <b>Masofa:</b> ${distance}m (${geoText})` +
    extraTelegramNote;

  await sendTelegramNotification(telegramMsg);

  return res.json({
    success: true,
    message: `${teacher.fio}: ${normalizedAction} (${timeStr}) - ${timeStatus}`
  });
});

app.get('/api/attendance-history', (req, res) => {
  const records = db.prepare('SELECT * FROM attendance ORDER BY server_timestamp DESC LIMIT 500').all();
  res.json({ success: true, count: records.length, records });
});

app.get('/api/export', (_req, res) => {
  const records = db.prepare('SELECT * FROM attendance ORDER BY server_timestamp ASC').all();
  if (records.length === 0) {
    return res.status(404).json({ success: false, error: 'Ma\'lumotlar mavjud emas!' });
  }

  const groupedMap = new Map();
  for (const log of records) {
    const key = `${log.date_str}_${log.jshr}`;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        date: log.date_str,
        jshr: log.jshr,
        fio: log.fio,
        lavozim: log.lavozim,
        keldi_vaqt: '-',
        keldi_holat: 'Kelmagan',
        ketdi_vaqt: '-',
        ketdi_holat: 'Ketmagan'
      });
    }
    const entry = groupedMap.get(key);
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
  return res.send(csv);
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'online', service: 'Texnikum Davomat API Server', timestamp: new Date().toISOString() });
});

app.use(express.static(path.resolve(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

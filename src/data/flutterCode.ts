export interface FlutterFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const FLUTTER_PROJECT_FILES: FlutterFile[] = [
  {
    name: 'pubspec.yaml',
    path: 'pubspec.yaml',
    language: 'yaml',
    description: "Flutter bog'liqliklar (Dependencies) konfiguratsiyasi",
    content: `name: teacher_attendance_app
description: "O'qituvchilar davomati uchun Flutter Android ilovasi (GPS Geofence & Offline SQLite)"
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.2.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  # GPS Geolocation
  geolocator: ^13.0.2
  # Orqa fonda ishlash (Background execution)
  workmanager: ^0.5.2
  # Lokal SQLite ma'lumotlar bazasi
  sqflite: ^2.4.1
  path: ^1.9.0
  # Render API bilan aloqa
  http: ^1.2.2
  # Internet bor/yo'qligini aniqlash (Auto sync)
  connectivity_plus: ^6.1.0
  # Bildirishnomalar (Background Notifications)
  flutter_local_notifications: ^18.0.1
  # Sana va vaqt formatlash
  intl: ^0.20.1
  # Foydalanuvchi sozlamalari (JSHR saqlash)
  shared_preferences: ^2.3.3
  # Ikonkalar
  cupertino_icons: ^1.0.8

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0

flutter:
  uses-material-design: true
`
  },
  {
    name: 'AndroidManifest.xml',
    path: 'android/app/src/main/AndroidManifest.xml',
    language: 'xml',
    description: "Android huquqlari: GPS, Background Location, Foreground Service va Internet",
    content: `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.teacher_attendance_app">

    <!-- Internet va tarmoq holati huquqlari -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- GPS va Geozona huquqlari -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    
    <!-- Orqa fonda GPS kuzatish huquqi (Android 10+) -->
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    
    <!-- Foreground Service va Boot (Qayta yuklanganda orqa fonda ishlash) -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:label="O'qituvchi Davomati"
        android:name="\${applicationName}"
        android:icon="@mipmap/ic_launcher"
        android:usesCleartextTraffic="true">
        
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <meta-data
              android:name="io.flutter.embedding.android.NormalTheme"
              android:resource="@style/NormalTheme" />
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>

        <meta-data
            android:name="flutterEmbedding"
            android:value="2" />
    </application>
</manifest>
`
  },
  {
    name: 'attendance_model.dart',
    path: 'lib/models/attendance_model.dart',
    language: 'dart',
    description: "Davomat ma'lumot modeli (SQLite & JSON serialization)",
    content: `class AttendanceRecord {
  final String id;
  final String jshr;
  final double latitude;
  final double longitude;
  final String actionType; // 'Keldi' yoki 'Ketdi'
  final DateTime timestamp;
  final double distanceMeters;
  final bool withinGeofence;
  int syncStatus; // 0 = kutilmoqda (offline), 1 = yuborilgan (synced), 2 = xato
  final String? deviceInfo;

  AttendanceRecord({
    required this.id,
    required this.jshr,
    required this.latitude,
    required this.longitude,
    required this.actionType,
    required this.timestamp,
    required this.distanceMeters,
    required this.withinGeofence,
    this.syncStatus = 0,
    this.deviceInfo,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'jshr': jshr,
      'latitude': latitude,
      'longitude': longitude,
      'action_type': actionType,
      'timestamp': timestamp.toIso8601String(),
      'distance_meters': distanceMeters,
      'within_geofence': withinGeofence ? 1 : 0,
      'sync_status': syncStatus,
      'device_info': deviceInfo ?? 'Flutter Android',
    };
  }

  factory AttendanceRecord.fromMap(Map<String, dynamic> map) {
    return AttendanceRecord(
      id: map['id'],
      jshr: map['jshr'],
      latitude: (map['latitude'] as num).toDouble(),
      longitude: (map['longitude'] as num).toDouble(),
      actionType: map['action_type'],
      timestamp: DateTime.parse(map['timestamp']),
      distanceMeters: (map['distance_meters'] as num).toDouble(),
      withinGeofence: map['within_geofence'] == 1,
      syncStatus: map['sync_status'] ?? 0,
      deviceInfo: map['device_info'],
    );
  }

  Map<String, dynamic> toApiPayload() {
    return {
      'jshr': jshr,
      'latitude': latitude,
      'longitude': longitude,
      'action_type': actionType,
      'timestamp': timestamp.toIso8601String(),
      'distance_meters': distanceMeters,
      'device_info': deviceInfo ?? 'Flutter Android',
    };
  }
}
`
  },
  {
    name: 'database_helper.dart',
    path: 'lib/services/database_helper.dart',
    language: 'dart',
    description: "Lokal SQLite ma'lumotlar bazasi boshqaruvchisi (sqflite)",
    content: `import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import '../models/attendance_model.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('attendance_local.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path,
      version: 1,
      onCreate: _createDB,
    );
  }

  Future<void> _createDB(Database db, int version) async {
    await db.execute('''
      CREATE TABLE attendance_cache (
        id TEXT PRIMARY KEY,
        jshr TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        action_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        distance_meters REAL NOT NULL,
        within_geofence INTEGER NOT NULL,
        sync_status INTEGER NOT NULL DEFAULT 0,
        device_info TEXT
      )
    ''');
  }

  // Yangi davomatni SQLite keshga kiritish
  Future<int> insertAttendance(AttendanceRecord record) async {
    final db = await instance.database;
    return await db.insert(
      'attendance_cache',
      record.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  // Hali serverga yuborilmagan (syncStatus == 0) yozuvlarni olish
  Future<List<AttendanceRecord>> getPendingAttendances() async {
    final db = await instance.database;
    final result = await db.query(
      'attendance_cache',
      where: 'sync_status = ?',
      whereArgs: [0],
      orderBy: 'timestamp ASC',
    );
    return result.map((json) => AttendanceRecord.fromMap(json)).toList();
  }

  // Barcha yozuvlarni olish (tarix uchun)
  Future<List<AttendanceRecord>> getAllAttendances() async {
    final db = await instance.database;
    final result = await db.query(
      'attendance_cache',
      orderBy: 'timestamp DESC',
    );
    return result.map((json) => AttendanceRecord.fromMap(json)).toList();
  }

  // Yozuvni muvaffaqiyatli sinxronlandi deb belgilash
  Future<int> markAsSynced(String id) async {
    final db = await instance.database;
    return await db.update(
      'attendance_cache',
      {'sync_status': 1},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // Xatolik bilan belgilash
  Future<int> markAsFailed(String id) async {
    final db = await instance.database;
    return await db.update(
      'attendance_cache',
      {'sync_status': 2},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> clearAll() async {
    final db = await instance.database;
    await db.delete('attendance_cache');
  }
}
`
  },
  {
    name: 'geofence_service.dart',
    path: 'lib/services/geofence_service.dart',
    language: 'dart',
    description: "GPS Geofence: Kollej koordinatasi va 500 metr masofa hisoblash",
    content: `import 'package:geolocator/geolocator.dart';

class GeofenceService {
  // Foydalanuvchi kiritgan kollej koordinatalari
  static const double collegeLat = 38.971199;
  static const double collegeLng = 66.707470;
  static const double collegeRadiusMeters = 500.0;

  /// GPS ruxsatlarini tekshirish va so'rash
  static Future<bool> handleLocationPermission() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return false;
    }

    return true;
  }

  /// Joriy aniq GPS joylashuvni olish
  static Future<Position?> getCurrentPosition() async {
    final hasPermission = await handleLocationPermission();
    if (!hasPermission) return null;

    return await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 10),
      ),
    );
  }

  /// Kollejgacha bo'lgan masofani hisoblash (metrlarda)
  static double getDistanceToCollege(double userLat, double userLng) {
    return Geolocator.distanceBetween(
      collegeLat,
      collegeLng,
      userLat,
      userLng,
    );
  }

  /// O'qituvchi 500m radius ichidami?
  static bool isInsideCollegeGeofence(double userLat, double userLng) {
    final distance = getDistanceToCollege(userLat, userLng);
    return distance <= collegeRadiusMeters;
  }
}
`
  },
  {
    name: 'api_service.dart',
    path: 'lib/services/api_service.dart',
    language: 'dart',
    description: "Render server API mijozi: /check-attendance POST so'rovi",
    content: `import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/attendance_model.dart';

class ApiService {
  // Standart Render server manzili (Sozlamalardan o'zgartirish mumkin)
  static String baseUrl = 'https://your-app.onrender.com';

  /// /check-attendance endpointiga POST so'rov yuborish
  static Future<Map<String, dynamic>> sendAttendance(AttendanceRecord record) async {
    final url = Uri.parse('\$baseUrl/check-attendance');

    try {
      final response = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Flutter-Teacher-Attendance/1.0',
        },
        body: jsonEncode(record.toApiPayload()),
      ).timeout(const Duration(seconds: 12));

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return {
          'success': true,
          'statusCode': response.statusCode,
          'data': jsonDecode(response.body),
        };
      } else {
        return {
          'success': false,
          'statusCode': response.statusCode,
          'error': 'Server xatoligi: \${response.statusCode} - \${response.body}',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'error': 'Tarmoqqa ulanishda xato: \$e',
      };
    }
  }
}
`
  },
  {
    name: 'sync_worker.dart',
    path: 'lib/services/sync_worker.dart',
    language: 'dart',
    description: "Avtomatik sinxronlash va WorkManager orqa fon vazifasi",
    content: `import 'package:connectivity_plus/connectivity_plus.dart';
import 'database_helper.dart';
import 'api_service.dart';

class SyncWorker {
  static bool _isSyncing = false;

  /// Kutilayotgan barcha lokal SQLite yozuvlarini Render serverga yuborish
  static Future<int> syncPendingRecords() async {
    if (_isSyncing) return 0;
    _isSyncing = true;

    int syncedCount = 0;
    try {
      final pendingList = await DatabaseHelper.instance.getPendingAttendances();
      if (pendingList.isEmpty) {
        _isSyncing = false;
        return 0;
      }

      for (var record in pendingList) {
        final result = await ApiService.sendAttendance(record);
        if (result['success'] == true) {
          await DatabaseHelper.instance.markAsSynced(record.id);
          syncedCount++;
        } else {
          await DatabaseHelper.instance.markAsFailed(record.id);
        }
      }
    } catch (e) {
      print('Sync worker error: \$e');
    } finally {
      _isSyncing = false;
    }

    return syncedCount;
  }

  /// Internet aloqasi paydo bo'lganda avtomatik sinxronlashni yoqish
  static void listenToConnectivityChanges() {
    Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) {
      if (results.any((r) => r != ConnectivityResult.none)) {
        // Internet paydo bo'ldi - avtomatik sinxronlaymiz
        syncPendingRecords();
      }
    });
  }
}
`
  },
  {
    name: 'main.dart',
    path: 'lib/main.dart',
    language: 'dart',
    description: "Ilova kirish nuqtasi: Workmanager va asosiy konfiguratsiya",
    content: `import 'package:flutter/material.dart';
import 'package:workmanager/workmanager.dart';
import 'services/database_helper.dart';
import 'services/sync_worker.dart';
import 'services/geofence_service.dart';
import 'screens/attendance_screen.dart';

// Orqa fon (Background) vazifasi uchun dispatcher
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((taskName, inputData) async {
    switch (taskName) {
      case 'attendance_periodic_sync':
        // Orqa fonda kutilayotgan davomatlarni serverga yuborish
        await SyncWorker.syncPendingRecords();
        break;
      case 'geofence_background_check':
        // Orqa fonda GPS koordinatani tekshirish
        final position = await GeofenceService.getCurrentPosition();
        if (position != null) {
          final isInside = GeofenceService.isInsideCollegeGeofence(
            position.latitude,
            position.longitude,
          );
          print('Background GPS Check: Lat=\${position.latitude}, Inside=\$isInside');
        }
        break;
    }
    return Future.value(true);
  });
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Workmanager background servisini ishga tushirish
  await Workmanager().initialize(
    callbackDispatcher,
    isInDebugMode: false,
  );

  // Har 15 daqiqada orqa fonda sinxronlashni ro'yxatdan o'tkazish
  Workmanager().registerPeriodicTask(
    'sync_task_id',
    'attendance_periodic_sync',
    frequency: const Duration(minutes: 15),
    constraints: Constraints(
      networkType: NetworkType.connected,
    ),
  );

  // Internet o'zgarishini tinglash
  SyncWorker.listenToConnectivityChanges();

  runApp(const TeacherAttendanceApp());
}

class TeacherAttendanceApp extends StatelessWidget {
  const TeacherAttendanceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "O'qituvchi Davomati",
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F766E), // Teal / Emerald
          brightness: Brightness.light,
        ),
        fontFamily: 'Roboto',
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF14B8A6),
          brightness: Brightness.dark,
        ),
      ),
      home: const AttendanceScreen(),
    );
  }
}
`
  },
  {
    name: 'attendance_screen.dart',
    path: 'lib/screens/attendance_screen.dart',
    language: 'dart',
    description: "Asosiy ekran: JSHR kiritish, GPS Geozona, 'Keldi'/'Ketdi' tugmalari",
    content: `import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:intl/intl.dart';
import '../models/attendance_model.dart';
import '../services/database_helper.dart';
import '../services/geofence_service.dart';
import '../services/api_service.dart';
import '../services/sync_worker.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  final TextEditingController _jshrController = TextEditingController();
  Position? _currentPosition;
  double _distanceToCollege = 0.0;
  bool _isInside = false;
  bool _isLoadingGps = false;
  bool _isSubmitting = false;
  int _pendingCount = 0;
  List<AttendanceRecord> _history = [];

  @override
  void initState() {
    super.initState();
    _loadSavedJshr();
    _refreshLocation();
    _loadHistoryAndPending();
  }

  Future<void> _loadSavedJshr() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('saved_jshr');
    if (saved != null && saved.isNotEmpty) {
      setState(() {
        _jshrController.text = saved;
      });
    }
  }

  Future<void> _saveJshr(String val) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('saved_jshr', val.trim());
  }

  Future<void> _refreshLocation() async {
    setState(() => _isLoadingGps = true);
    final pos = await GeofenceService.getCurrentPosition();
    if (pos != null) {
      final dist = GeofenceService.getDistanceToCollege(pos.latitude, pos.longitude);
      final inside = GeofenceService.isInsideCollegeGeofence(pos.latitude, pos.longitude);
      setState(() {
        _currentPosition = pos;
        _distanceToCollege = dist;
        _isInside = inside;
        _isLoadingGps = false;
      });
    } else {
      setState(() => _isLoadingGps = false);
    }
  }

  Future<void> _loadHistoryAndPending() async {
    final pending = await DatabaseHelper.instance.getPendingAttendances();
    final all = await DatabaseHelper.instance.getAllAttendances();
    setState(() {
      _pendingCount = pending.length;
      _history = all;
    });
  }

  Future<void> _handleAttendance(String actionType) async {
    final jshr = _jshrController.text.trim();
    if (jshr.length != 14) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Iltimos, 14 xonali JSHR (PINFL) raqamingizni to\\'liq kiriting!'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_currentPosition == null) {
      await _refreshLocation();
      if (_currentPosition == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('GPS joylashuvni aniqlab bo\\'lmadi. GPS yoqilganligini tekshiring.'),
            backgroundColor: Colors.orange,
          ),
        );
        return;
      }
    }

    await _saveJshr(jshr);
    setState(() => _isSubmitting = true);

    final record = AttendanceRecord(
      id: 'att_\${DateTime.now().millisecondsSinceEpoch}',
      jshr: jshr,
      latitude: _currentPosition!.latitude,
      longitude: _currentPosition!.longitude,
      actionType: actionType,
      timestamp: DateTime.now(),
      distanceMeters: _distanceToCollege,
      withinGeofence: _isInside,
      syncStatus: 0,
    );

    // 1. Dastlab darhol lokal SQLite ga keshlaymiz
    await DatabaseHelper.instance.insertAttendance(record);

    // 2. Render serverga yuborishga urinish
    final apiResult = await ApiService.sendAttendance(record);

    if (apiResult['success'] == true) {
      await DatabaseHelper.instance.markAsSynced(record.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('\$actionType muvaffaqiyatli qayd etildi va serverga yuborildi!'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Internet yo\\'q yoki server band. Davomat lokal SQLite keshida saqlandi va internet paydo bo\\'lganda yuboriladi.'),
            backgroundColor: Colors.amber.shade900,
          ),
        );
      }
    }

    setState(() => _isSubmitting = false);
    _loadHistoryAndPending();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("O'qituvchi Davomati", style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: "Hozir sinxronlash",
            onPressed: () async {
              final synced = await SyncWorker.syncPendingRecords();
              _loadHistoryAndPending();
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('\$synced ta yozuv sinxronlandi')),
                );
              }
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Geofence GPS Card
            Card(
              elevation: 2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text("GPS Geozona Holati", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        IconButton(
                          icon: _isLoadingGps
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.my_location),
                          onPressed: _refreshLocation,
                        ),
                      ],
                    ),
                    const Divider(),
                    Row(
                      children: [
                        Icon(
                          _isInside ? Icons.check_circle : Icons.warning_amber_rounded,
                          color: _isInside ? Colors.green : Colors.orange,
                          size: 32,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _isInside ? "Kollej hududi ichidasiz" : "Kollej hududidan tashqarisiz",
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: _isInside ? Colors.green.shade800 : Colors.orange.shade800,
                                ),
                              ),
                              Text(
                                "Masofa: \${_distanceToCollege.toStringAsFixed(1)} metr (Chegara: 500m)",
                                style: const TextStyle(fontSize: 13, color: Colors.grey),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // JSHR Input
            TextField(
              controller: _jshrController,
              keyboardType: TextInputType.number,
              maxLength: 14,
              decoration: InputDecoration(
                labelText: "O'qituvchi JSHR (14 raqam)",
                prefixIcon: const Icon(Icons.badge),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                counterText: "",
              ),
            ),
            const SizedBox(height: 20),

            // Action Buttons
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.teal.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.login),
                    label: const Text("Keldi (Check-in)", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    onPressed: _isSubmitting ? null : () => _handleAttendance('Keldi'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.logout),
                    label: const Text("Ketdi (Check-out)", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    onPressed: _isSubmitting ? null : () => _handleAttendance('Ketdi'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // SQLite Cache Status Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: _pendingCount > 0 ? Colors.amber.shade50 : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _pendingCount > 0 ? Colors.amber.shade300 : Colors.grey.shade300),
              ),
              child: Row(
                children: [
                  Icon(Icons.storage, color: _pendingCount > 0 ? Colors.amber.shade800 : Colors.grey),
                  const SizedBox(width: 10),
                  Text("Lokal SQLite keshida: \$_pendingCount ta kutilmoqda"),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // History List
            const Text("So'nggi davomatlar tarixi", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _history.length,
              itemBuilder: (context, index) {
                final item = _history[index];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: item.actionType == 'Keldi' ? Colors.green.shade100 : Colors.red.shade100,
                    child: Icon(
                      item.actionType == 'Keldi' ? Icons.login : Icons.logout,
                      color: item.actionType == 'Keldi' ? Colors.green : Colors.red,
                    ),
                  ),
                  title: Text("\${item.actionType} - \${item.jshr}"),
                  subtitle: Text(DateFormat('yyyy-MM-dd HH:mm').format(item.timestamp)),
                  trailing: Icon(
                    item.syncStatus == 1 ? Icons.cloud_done : Icons.cloud_upload_outlined,
                    color: item.syncStatus == 1 ? Colors.green : Colors.amber.shade700,
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
`
  },
  {
    name: 'README.md',
    path: 'README.md',
    language: 'markdown',
    description: "Loyihani o'rnatish va Android APK chiqarish qo'llanmasi",
    content: `# O'qituvchi Davomati - Flutter Android Dasturi

Ushbu Flutter ilovasi o'qituvchilar davomatini GPS geozona orqali nazorat qilish, orqa fonda ishlash va oflayn SQLite kesh bilan ta'minlash uchun ishlab chiqilgan.

## Asosiy imkoniyatlar:
1. **GPS Geozona nazorati**:
   - Kollej koordinatalari: \`latitude: 38.971199, longitude: 66.707470\`
   - Ruxsat etilgan radius: \`500 metr\`
2. **JSHR (14 xonali PINFL)** orqali autentifikatsiya.
3. **Render Server integratsiyasi**:
   - API Endpoint: \`POST /check-attendance\`
   - Parametrlar: \`jshr\`, \`latitude\`, \`longitude\`, \`action_type ('Keldi' yoki 'Ketdi')\`, \`timestamp\`
4. **Oflayn SQLite Keshlash**:
   - Internet uzilganda davomat mahalliy SQLite bazasiga saqlanadi.
   - Internet paydo bo'lganda \`SyncWorker\` orqali avtomatik sinxronlanadi.
5. **Orqa fonda ishlash (Background Service)**:
   - Android \`WorkManager\` va \`ForegroundService\` orqali doimiy geofence monitoringi.

## Dasturni ishga tushirish (Android Studio / CLI):

\`\`\`bash
# 1. Bog'liqliklarni yuklab olish
flutter pub get

# 2. Ulangan Android telefonda ishga tushirish
flutter run

# 3. Release APK tayyorlash
flutter build apk --release
\`\`\`
`
  }
];

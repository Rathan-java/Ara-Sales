import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'api_service.dart';
import '../config.dart';

/// GPS permission, current fix (with mock-location flag), and the background-safe
/// ping loop while a work session is active.
///
/// Background strategy (no paid plugin): we open a *continuous* position stream
/// instead of a foreground-only Timer. On Android the stream runs inside a
/// foreground service (via [AndroidSettings.foregroundNotificationConfig]) so it
/// keeps producing fixes when the phone is locked or the app is backgrounded; on
/// iOS we enable background location updates. The stream itself may emit often,
/// so we THROTTLE network sends to one ping every [AppConfig.pingIntervalSeconds]
/// (default 300s = 5 min) — giving reliable background pings at the 5-min cadence.
class LocationService {
  LocationService._();
  static final LocationService instance = LocationService._();

  StreamSubscription<Position>? _sub;
  int? _activeSessionId;
  DateTime? _lastSentAt;

  int? get activeSessionId => _activeSessionId;
  bool get isTracking => _activeSessionId != null;

  Future<bool> ensurePermission() async {
    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    return perm == LocationPermission.always ||
        perm == LocationPermission.whileInUse;
  }

  /// Returns the current position and whether it is a mock/fake location.
  Future<({Position position, bool isMocked})> currentFix() async {
    final pos = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
    );
    return (position: pos, isMocked: pos.isMocked);
  }

  /// Platform-specific stream settings that keep location alive in the background.
  LocationSettings _backgroundSettings() {
    // Emit a fix at most every ~50 m or whenever the OS provides one; we throttle
    // sends ourselves. distanceFilter keeps battery use reasonable.
    return AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 25,
      // Foreground service => keeps running when the screen is off / app in bg.
      foregroundNotificationConfig: const ForegroundNotificationConfig(
        notificationTitle: 'Ara Sales — tracking active',
        notificationText: 'Your field route is being recorded during this trip.',
        enableWakeLock: true,
      ),
    );
    // NOTE: On iOS, geolocator uses AppleSettings; see _appleSettings below.
  }

  LocationSettings _appleSettings() {
    return AppleSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 25,
      allowBackgroundLocationUpdates: true,
      pauseLocationUpdatesAutomatically: false,
      showBackgroundLocationIndicator: true,
    );
  }

  /// Start a work session on the server and begin background pinging.
  ///
  /// If the server says a session is already active (e.g. the app was closed
  /// without tapping End Work, so the server session is still open while local
  /// state was lost), we transparently RESUME that existing session instead of
  /// failing — the rep is never stuck.
  Future<int> startWork() async {
    final ok = await ensurePermission();
    if (!ok) throw Exception('Location permission denied');

    int sessionId;
    try {
      final res = await ApiService.instance.post('/rep/work/start', {});
      sessionId = res['sessionId'] as int;
    } on ApiException catch (e) {
      // 409 conflict -> a session is already open on the server. Resume it.
      final existing = e.body is Map &&
              (e.body as Map)['error'] is Map &&
              ((e.body as Map)['error'] as Map)['details'] is Map
          ? (((e.body as Map)['error'] as Map)['details'] as Map)['sessionId']
          : null;
      if (e.status == 409 && existing != null) {
        sessionId = existing as int;
      } else {
        rethrow;
      }
    }

    _activeSessionId = sessionId;
    _lastSentAt = null;

    // Pick platform settings. geolocator selects the right impl per OS, but the
    // settings classes differ, so choose based on the running platform.
    LocationSettings settings;
    try {
      settings = _backgroundSettings(); // Android
    } catch (_) {
      settings = _appleSettings();
    }

    _sub = Geolocator.getPositionStream(locationSettings: settings).listen(
      _onPosition,
      onError: (_) {/* transient stream errors are ignored; OS will resume */},
    );

    // Send an immediate first ping so the live map updates without waiting 5 min.
    await _maybeSend(force: true);
    return _activeSessionId!;
  }

  void _onPosition(Position _) {
    // Fire-and-forget; _maybeSend throttles to the configured cadence.
    _maybeSend();
  }

  Future<void> _maybeSend({bool force = false}) async {
    final sid = _activeSessionId;
    if (sid == null) return;

    final now = DateTime.now();
    if (!force && _lastSentAt != null) {
      final elapsed = now.difference(_lastSentAt!).inSeconds;
      if (elapsed < AppConfig.pingIntervalSeconds) return; // throttle
    }

    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      await ApiService.instance.post('/rep/work/ping', {
        'sessionId': sid,
        'lat': pos.latitude,
        'lng': pos.longitude,
      });
      _lastSentAt = now;
    } catch (_) {
      // Swallow transient failures; the stream keeps the loop alive.
    }
  }

  /// End the active work session. Calls the server unconditionally so it also
  /// closes a session that's open on the server even if local state was lost
  /// (the server ends "the rep's open session", not a specific id). A 404 (no
  /// active session) is treated as success — there's nothing to end.
  Future<void> endWork() async {
    await _sub?.cancel();
    _sub = null;
    _lastSentAt = null;
    try {
      await ApiService.instance.post('/rep/work/end', {});
    } on ApiException catch (e) {
      if (e.status != 404) rethrow; // 404 = no open session; already ended
    }
    _activeSessionId = null;
  }
}

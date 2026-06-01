/// App configuration, supplied at build time via --dart-define.
class AppConfig {
  /// Backend base URL. Android emulator default points at host loopback.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );

  /// GPS ping cadence while a work session is active (spec: 300s = 5 min).
  static const int pingIntervalSeconds = int.fromEnvironment(
    'PING_INTERVAL_SECONDS',
    defaultValue: 300,
  );

  static String get apiBase => '$apiBaseUrl/api';
}

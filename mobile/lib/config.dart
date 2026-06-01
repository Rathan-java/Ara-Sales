/// App configuration, supplied at build time via --dart-define.
class AppConfig {
  /// Backend base URL. Defaults to the live Azure backend so a plain
  /// `flutter build apk` works on a real phone with no extra flags. Override for
  /// local dev with: --dart-define=API_BASE_URL=http://10.0.2.2:4000
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://ara-sales-b4becqhyf7h2drf6.eastasia-01.azurewebsites.net',
  );

  /// GPS ping cadence while a work session is active (spec: 300s = 5 min).
  static const int pingIntervalSeconds = int.fromEnvironment(
    'PING_INTERVAL_SECONDS',
    defaultValue: 300,
  );

  static String get apiBase => '$apiBaseUrl/api';
}

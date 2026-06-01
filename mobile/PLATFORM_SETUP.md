# Mobile platform setup (Flutter)

The `mobile/` folder contains the Dart source (`lib/`), `pubspec.yaml` and unit
tests. Generate the native Android/iOS projects once with:

```bash
cd mobile
flutter create .      # generates android/, ios/, etc. without overwriting lib/
flutter pub get
```

Then add the permissions below before running on a device.

## Android — `android/app/src/main/AndroidManifest.xml`

Add inside `<manifest>` (above `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<!-- Keep pinging during a work trip (foreground service). -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
```

Set `minSdkVersion 21` (or higher) in `android/app/build.gradle`.

## iOS — `ios/Runner/Info.plist`

```xml
<key>NSCameraUsageDescription</key>
<string>Used to capture verified client-visit photos.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Used to track field movement during a work trip.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Used to send periodic location pings while a work trip is active.</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```

### How background tracking works

`LocationService` opens a continuous `Geolocator.getPositionStream` while a work
trip is active (not a foreground-only timer). On **Android** the stream runs in a
**foreground service** (configured via `ForegroundNotificationConfig`), so pings
keep flowing when the screen is off or the app is backgrounded. On **iOS**,
`allowBackgroundLocationUpdates` + the `location` background mode above keep
updates alive. The stream may emit frequently; `LocationService` **throttles
network sends** to one ping every `PING_INTERVAL_SECONDS` (default 300s = 5 min).

> iOS restricts background location more tightly than Android. With "Always"
> permission and the background mode above, updates continue; for very long idle
> periods Apple may coalesce them — pair with significant-change updates if you
> need guaranteed wake-ups across hours of no movement.

## Run

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:4000 \
  --dart-define=PING_INTERVAL_SECONDS=300
```

(`10.0.2.2` = host loopback from the Android emulator. Use `localhost` for the
iOS simulator, or your machine's LAN IP for a physical device.)

import 'dart:io';
import 'dart:math' as math;
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;
import 'package:intl/intl.dart';
import 'api_service.dart';

/// Visit verification flow (client side of the anti-fraud feature).
///
/// 1. startVisit  -> ask server for a one-time, short-lived code + server time.
/// 2. (caller captures a photo via the camera — NEVER the gallery).
/// 3. stampPhoto  -> burn code + server timestamp + GPS into the image.
/// 4. submitVisit -> upload the stamped photo; server re-verifies everything.
class VisitService {
  VisitService._();
  static final VisitService instance = VisitService._();

  /// Step 1 — request a one-time code tied to rep + client.
  Future<VisitCode> startVisit(int clientId) async {
    final res = await ApiService.instance.post('/rep/visits/start', {
      'clientId': clientId,
    });
    return VisitCode(
      visitId: res['visitId'] as int,
      code: res['visitCode'] as String,
      serverTimestamp: DateTime.parse(res['serverTimestamp'] as String),
      expiresAt: DateTime.parse(res['expiresAt'] as String),
    );
  }

  /// Web Mercator slippy-tile coords for a lat/lng at zoom z.
  static ({int x, int y}) _latLngToTile(double lat, double lng, int z) {
    final n = math.pow(2, z).toDouble();
    final x = ((lng + 180.0) / 360.0 * n).floor();
    final latRad = lat * math.pi / 180.0;
    final y = ((1.0 - math.log(math.tan(latRad) + 1.0 / math.cos(latRad)) / math.pi) / 2.0 * n).floor();
    return (x: x, y: y);
  }

  /// Fetch the OpenStreetMap tile that contains the point, as a decoded image.
  /// Returns null on any network/decoding failure (the stamp still proceeds).
  Future<img.Image?> _fetchOsmThumbnail(double lat, double lng, {int zoom = 16}) async {
    try {
      final t = _latLngToTile(lat, lng, zoom);
      final url = 'https://tile.openstreetmap.org/$zoom/${t.x}/${t.y}.png';
      final res = await http
          .get(Uri.parse(url), headers: {'User-Agent': 'AraSales/1.0 (visit-stamp)'})
          .timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return null;
      return img.decodePng(res.bodyBytes);
    } catch (_) {
      return null;
    }
  }

  /// Step 3 — burn the one-time code, server timestamp, GPS AND a small OSM map
  /// thumbnail onto the ORIGINAL photo (a fixed forensic overlay; no free-form
  /// editing). The map tile is rendered from OpenStreetMap (no API key).
  /// Returns the path of the stamped file.
  Future<String> stampPhoto({
    required String sourcePath,
    required VisitCode code,
    required double lat,
    required double lng,
  }) async {
    final bytes = await File(sourcePath).readAsBytes();
    final original = img.decodeImage(bytes);
    if (original == null) throw Exception('Could not decode photo');

    final fmt = DateFormat('yyyy-MM-dd HH:mm:ss');
    final lines = [
      'ARA VERIFIED VISIT',
      'Code: ${code.code}',
      'Server: ${fmt.format(code.serverTimestamp.toUtc())} UTC',
      'GPS: ${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}',
    ];

    // Semi-transparent banner at the bottom.
    final bandHeight = 22 * lines.length + 16;
    final bandTop = original.height - bandHeight;
    img.fillRect(
      original,
      x1: 0,
      y1: bandTop,
      x2: original.width,
      y2: original.height,
      color: img.ColorRgba8(0, 0, 0, 160),
    );
    var y = bandTop + 8;
    for (final line in lines) {
      img.drawString(original, line,
          font: img.arial24, x: 12, y: y, color: img.ColorRgba8(255, 255, 255, 255));
      y += 22;
    }

    // OSM map thumbnail in the bottom-right corner, with a centre marker dot.
    final tile = await _fetchOsmThumbnail(lat, lng);
    if (tile != null) {
      const thumb = 120;
      final resized = img.copyResize(tile, width: thumb, height: thumb);
      final dstX = original.width - thumb - 12;
      final dstY = original.height - thumb - 12;
      img.compositeImage(original, resized, dstX: dstX, dstY: dstY);
      // white border + red centre dot
      img.drawRect(original, x1: dstX, y1: dstY, x2: dstX + thumb, y2: dstY + thumb,
          color: img.ColorRgba8(255, 255, 255, 255), thickness: 2);
      img.fillCircle(original, x: dstX + thumb ~/ 2, y: dstY + thumb ~/ 2, radius: 5,
          color: img.ColorRgba8(220, 38, 38, 255));
    }

    final out = '${sourcePath}_stamped.jpg';
    await File(out).writeAsBytes(img.encodeJpg(original, quality: 90));
    return out;
  }

  /// Step 4 — upload the stamped photo + capture metadata for server re-verify.
  Future<VisitResult> submitVisit({
    required VisitCode code,
    required String stampedPath,
    required double lat,
    required double lng,
  }) async {
    final bytes = await File(stampedPath).readAsBytes();
    final res = await ApiService.instance.multipart(
      '/rep/visits/submit',
      fields: {
        'visitId': '${code.visitId}',
        'visitCode': code.code,
        'captureLat': '$lat',
        'captureLng': '$lng',
      },
      fileBytes: bytes,
      fileField: 'photo',
      filename: 'visit_${code.visitId}.jpg',
    );
    return VisitResult(
      status: res['status'] as String,
      photoUrl: res['photoUrl'] as String?,
    );
  }
}

class VisitCode {
  VisitCode({
    required this.visitId,
    required this.code,
    required this.serverTimestamp,
    required this.expiresAt,
  });
  final int visitId;
  final String code;
  final DateTime serverTimestamp;
  final DateTime expiresAt;
}

class VisitResult {
  VisitResult({required this.status, this.photoUrl});
  final String status; // 'pass' | 'flag'
  final String? photoUrl;
}

import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:latlong2/latlong.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../services/visit_service.dart';
import '../widgets/map_preview.dart';

/// Camera-based client-visit flow:
///   pick client -> Start Visit (one-time code) -> CAMERA capture (no gallery)
///   -> stamp overlay -> submit -> server re-verifies (one-time code + geofence).
class VisitScreen extends StatefulWidget {
  const VisitScreen({super.key});
  @override
  State<VisitScreen> createState() => _VisitScreenState();
}

class _VisitScreenState extends State<VisitScreen> {
  List<dynamic> _clients = [];
  int? _clientId;
  String? _status;
  String? _error;
  bool _busy = false;
  LatLng? _myLocation; // live position for the map preview

  @override
  void initState() {
    super.initState();
    _loadClients();
    _loadLocation();
  }

  Future<void> _loadClients() async {
    final res = await ApiService.instance.get('/rep/clients');
    setState(() {
      _clients = res['clients'] as List<dynamic>;
      if (_clients.isNotEmpty) _clientId = _clients.first['id'] as int;
    });
  }

  Future<void> _loadLocation() async {
    try {
      final ok = await LocationService.instance.ensurePermission();
      if (!ok) return;
      final fix = await LocationService.instance.currentFix();
      if (mounted) {
        setState(() => _myLocation = LatLng(fix.position.latitude, fix.position.longitude));
      }
    } catch (_) {/* preview is best-effort */}
  }

  LatLng? get _selectedClientPoint {
    if (_clientId == null) return null;
    dynamic c;
    for (final item in _clients) {
      if (item['id'] == _clientId) { c = item; break; }
    }
    if (c == null || c['reference_lat'] == null || c['reference_lng'] == null) return null;
    return LatLng(
      double.parse('${c['reference_lat']}'),
      double.parse('${c['reference_lng']}'),
    );
  }

  Future<void> _startVisit() async {
    if (_clientId == null) return;
    setState(() { _busy = true; _error = null; _status = null; });
    try {
      // 1. permission first (we capture the LIVE GPS at the moment of the shot)
      final ok = await LocationService.instance.ensurePermission();
      if (!ok) throw Exception('Location permission denied');

      // 2. one-time code from server (tied to rep + client)
      final code = await VisitService.instance.startVisit(_clientId!);

      // 3. CAMERA capture only (no gallery)
      if (!mounted) return;
      final shotPath = await Navigator.push<String>(
        context,
        MaterialPageRoute(builder: (_) => const _CameraCaptureScreen()),
      );
      if (shotPath == null) { setState(() => _busy = false); return; }

      // 3b. Capture the LIVE location at the exact moment the photo was taken —
      //     a fresh fix, not a pre-fetched one — so the stamp/metadata reflect
      //     where the rep actually stood when shooting.
      final fix = await LocationService.instance.currentFix();

      // 4. burn overlay (code + server time + live GPS)
      final stamped = await VisitService.instance.stampPhoto(
        sourcePath: shotPath,
        code: code,
        lat: fix.position.latitude,
        lng: fix.position.longitude,
      );

      // 5. submit (mock-GPS detection removed — it false-positived on real phones)
      final result = await VisitService.instance.submitVisit(
        code: code,
        stampedPath: stamped,
        lat: fix.position.latitude,
        lng: fix.position.longitude,
      );
      setState(() => _status = result.status);
    } catch (e) {
      setState(() => _error = _explainError(e));
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Client Visit')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Select client', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              initialValue: _clientId,
              decoration: const InputDecoration(border: OutlineInputBorder()),
              items: _clients
                  .map((c) => DropdownMenuItem<int>(value: c['id'] as int, child: Text(c['name'] as String)))
                  .toList(),
              onChanged: (v) => setState(() => _clientId = v),
            ),
            const SizedBox(height: 16),
            // Live OpenStreetMap preview (flutter_map): rep position + client pin.
            if (_myLocation != null)
              MapPreview(center: _myLocation!, clientPoint: _selectedClientPoint)
            else
              Container(
                height: 200,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.grey.shade200,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text('Locating…'),
              ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _busy ? null : _startVisit,
              icon: const Icon(Icons.camera_alt),
              label: Text(_busy ? 'Verifying...' : 'Start Visit & Capture'),
            ),
            const SizedBox(height: 16),
            if (_status != null) _resultBanner(_status!),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 24),
            Text(
              'The photo is captured live (camera only — no gallery). Your live GPS '
              'is read at the moment of capture and, with a one-time code and server '
              'timestamp, burned into the image. The server re-checks the code and '
              'geofence before accepting.',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  // Turn a server rejection into a clear, human reason.
  String _explainError(Object e) {
    if (e is ApiException && e.body is Map) {
      final d = (e.body as Map)['error'];
      final details = d is Map ? d['details'] : null;
      if (details is Map) {
        if (details['codeValid'] == false) {
          final reason = details['codeReason'];
          if (reason == 'expired') {
            return 'Visit rejected: the one-time code expired before upload. '
                'Please tap Start Visit and capture again without delay.';
          }
          return 'Visit rejected: the verification code was invalid. Please try again.';
        }
      }
      final msg = d is Map ? d['message'] : null;
      if (msg != null) return '$msg';
    }
    return e.toString().replaceFirst('Exception: ', '');
  }

  Widget _resultBanner(String status) {
    final pass = status == 'pass';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: pass ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(children: [
        Icon(pass ? Icons.verified : Icons.warning, color: pass ? Colors.green : Colors.orange),
        const SizedBox(width: 8),
        Expanded(
          child: Text(pass
              ? 'Visit verified — photo submitted successfully.'
              : 'Visit submitted and flagged for review (location check). '
                'The photo was saved; HR will verify it.'),
        ),
      ]),
    );
  }
}

/// Minimal full-screen camera preview that returns the captured file path.
class _CameraCaptureScreen extends StatefulWidget {
  const _CameraCaptureScreen();
  @override
  State<_CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<_CameraCaptureScreen> {
  CameraController? _controller;
  Future<void>? _init;

  @override
  void initState() {
    super.initState();
    _init = _setup();
  }

  Future<void> _setup() async {
    final cameras = await availableCameras();
    final back = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.back,
      orElse: () => cameras.first,
    );
    _controller = CameraController(back, ResolutionPreset.high, enableAudio: false);
    await _controller!.initialize();
    if (mounted) setState(() {});
  }

  Future<void> _capture() async {
    final file = await _controller!.takePicture();
    if (!mounted) return;
    Navigator.pop(context, file.path);
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: FutureBuilder(
        future: _init,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done || _controller == null) {
            return const Center(child: CircularProgressIndicator());
          }
          return Stack(
            alignment: Alignment.bottomCenter,
            children: [
              Center(child: CameraPreview(_controller!)),
              Padding(
                padding: const EdgeInsets.all(24),
                child: FloatingActionButton.large(
                  onPressed: _capture,
                  child: const Icon(Icons.camera),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

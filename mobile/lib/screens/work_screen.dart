import 'package:flutter/material.dart';
import '../services/location_service.dart';
import '../config.dart';

/// Start/End Work tracking. While active, the LocationService pings GPS every
/// PING_INTERVAL_SECONDS (default 300s = 5 min).
class WorkScreen extends StatefulWidget {
  const WorkScreen({super.key});
  @override
  State<WorkScreen> createState() => _WorkScreenState();
}

class _WorkScreenState extends State<WorkScreen> {
  bool _busy = false;
  String? _error;
  bool get _tracking => LocationService.instance.isTracking;

  Future<void> _toggle() async {
    setState(() { _busy = true; _error = null; });
    try {
      if (_tracking) {
        await LocationService.instance.endWork();
      } else {
        await LocationService.instance.startWork();
      }
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mins = (AppConfig.pingIntervalSeconds / 60).round();
    return Scaffold(
      appBar: AppBar(title: const Text('Field Tracking')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(_tracking ? Icons.gps_fixed : Icons.gps_off,
                size: 96, color: _tracking ? Colors.green : Colors.grey),
            const SizedBox(height: 16),
            Text(_tracking ? 'Tracking active' : 'Not tracking',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('Sends a GPS ping every $mins min while active',
                style: TextStyle(color: Colors.grey.shade600)),
            if (_error != null) Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _busy ? null : _toggle,
              icon: Icon(_tracking ? Icons.stop : Icons.play_arrow),
              label: Text(_tracking ? 'End Work' : 'Start Work'),
              style: FilledButton.styleFrom(
                backgroundColor: _tracking ? Colors.red : const Color(0xFF2563EB),
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

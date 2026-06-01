import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// A small OpenStreetMap preview (flutter_map) used on the Visit screen.
///
/// Shows the rep's current position (blue dot) and, optionally, the selected
/// client's reference point (red pin). Uses free OSM tiles — no API key.
class MapPreview extends StatelessWidget {
  const MapPreview({
    super.key,
    required this.center,
    this.clientPoint,
    this.height = 200,
    this.zoom = 16,
  });

  final LatLng center;
  final LatLng? clientPoint;
  final double height;
  final double zoom;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        height: height,
        child: FlutterMap(
          options: MapOptions(initialCenter: center, initialZoom: zoom),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.ara.sales',
            ),
            MarkerLayer(
              markers: [
                Marker(
                  point: center,
                  width: 24,
                  height: 24,
                  child: const Icon(Icons.my_location, color: Colors.blue, size: 24),
                ),
                if (clientPoint != null)
                  Marker(
                    point: clientPoint!,
                    width: 36,
                    height: 36,
                    child: const Icon(Icons.location_on, color: Colors.red, size: 36),
                  ),
              ],
            ),
            const RichAttributionWidget(
              attributions: [TextSourceAttribution('© OpenStreetMap contributors')],
            ),
          ],
        ),
      ),
    );
  }
}

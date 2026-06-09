import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';

/// Rep analytics dashboard: their own sales broken down by product (pie),
/// lead type (bar), and a daily revenue trend (line) — with month + product +
/// lead-type filters. Responsive: charts size to the screen width.
class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});
  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  static const leads = ['hot', 'warm', 'cold'];
  // Lead mode value -> label (matches the backend + web).
  static const leadModes = [
    ['platform', 'Platform'],
    ['specific_dm', 'Specific Digital Marketing'],
    ['general_dm', 'General Digital Marketing'],
    ['direct_visit', 'Direct Visit'],
  ];
  static String leadModeLabel(String? v) {
    for (final m in leadModes) { if (m[0] == v) return m[1]; }
    return v ?? '';
  }
  static const palette = [
    Color(0xFF2563EB), Color(0xFF16A34A), Color(0xFFD97706),
    Color(0xFFDC2626), Color(0xFF7C3AED), Color(0xFF0891B2),
  ];

  DateTime _month = DateTime.now();
  List<String> _products = []; // live catalogue from the backend
  String? _product;
  String? _leadMode;
  String? _leadType;
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProducts();
    _load();
  }

  Future<void> _loadProducts() async {
    try {
      final res = await ApiService.instance.get('/rep/products');
      final list = (res['products'] as List).map((p) => p['name'] as String).toList();
      if (mounted) setState(() => _products = list);
    } catch (_) {/* filter still works without the list */}
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final q = <String, dynamic>{'month': DateFormat('yyyy-MM').format(_month)};
      if (_product != null) q['product'] = _product;
      if (_leadMode != null) q['leadMode'] = _leadMode;
      if (_leadType != null) q['leadType'] = _leadType;
      final res = await ApiService.instance.get('/rep/analytics', query: q);
      setState(() => _data = res as Map<String, dynamic>);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Analytics'), actions: [
        IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
      ]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _filters(),
                      const SizedBox(height: 12),
                      _totals(),
                      const SizedBox(height: 16),
                      _sectionTitle('Revenue by Lead Mode'),
                      _leadModePie(),
                      const SizedBox(height: 16),
                      _sectionTitle('Leads by Type'),
                      _leadBar(),
                      const SizedBox(height: 16),
                      _sectionTitle('Daily Sales Trend (₹)'),
                      _trendLine(),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
    );
  }

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
      );

  Widget _filters() {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        OutlinedButton.icon(
          icon: const Icon(Icons.calendar_month, size: 18),
          label: Text(DateFormat('MMM yyyy').format(_month)),
          onPressed: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _month,
              firstDate: DateTime(2024),
              lastDate: DateTime.now(),
            );
            if (picked != null) { setState(() => _month = picked); _load(); }
          },
        ),
        // Product filter from the LIVE catalogue.
        _dropdown('All products', _product,
            _products.map((p) => [p, p]).toList(),
            (v) { setState(() => _product = v); _load(); }),
        // Lead mode filter (value/label pairs).
        _dropdown('All lead modes', _leadMode, leadModes,
            (v) { setState(() => _leadMode = v); _load(); }),
        // Lead type filter.
        _dropdown('All lead types', _leadType, leads.map((l) => [l, l]).toList(),
            (v) { setState(() => _leadType = v); _load(); }),
      ],
    );
  }

  // opts = list of [value, label] pairs; null = "All".
  Widget _dropdown(String allLabel, String? value, List<List<String>> opts, ValueChanged<String?> onCh) {
    return DropdownButton<String?>(
      value: value,
      hint: Text(allLabel),
      items: [
        DropdownMenuItem<String?>(value: null, child: Text(allLabel)),
        ...opts.map((o) => DropdownMenuItem<String?>(value: o[0], child: Text(o[1]))),
      ],
      onChanged: onCh,
    );
  }

  Widget _totals() {
    final t = (_data?['totals'] as Map?) ?? {};
    final revenue = (t['revenue'] ?? 0);
    final count = (t['salesCount'] ?? 0);
    return Row(
      children: [
        Expanded(child: _statCard('₹ ${_fmt(revenue)}', 'Revenue')),
        const SizedBox(width: 12),
        Expanded(child: _statCard('$count', 'Sales')),
      ],
    );
  }

  Widget _statCard(String value, String label) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          ]),
        ),
      );

  Widget _leadModePie() {
    final m = (_data?['byLeadModeAmount'] as Map?) ?? {};
    final entries = m.entries.where((e) => (e.value ?? 0) > 0).toList();
    if (entries.isEmpty) return _empty();
    final sections = <PieChartSectionData>[];
    for (var i = 0; i < entries.length; i++) {
      final v = (entries[i].value as num).toDouble();
      sections.add(PieChartSectionData(
        value: v, title: '', radius: 70, color: palette[i % palette.length],
      ));
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          SizedBox(height: 200, child: PieChart(PieChartData(sections: sections, centerSpaceRadius: 36))),
          const SizedBox(height: 12),
          Wrap(spacing: 12, runSpacing: 6, children: [
            for (var i = 0; i < entries.length; i++)
              _legend(palette[i % palette.length],
                  '${leadModeLabel(entries[i].key as String)}: ₹${_fmt(entries[i].value)}'),
          ]),
        ]),
      ),
    );
  }

  Widget _leadBar() {
    final m = (_data?['byLeadType'] as Map?) ?? {};
    final values = leads.map((k) => ((m[k] ?? 0) as num).toDouble()).toList();
    if (values.every((v) => v == 0)) return _empty();
    final maxV = (values.reduce((a, b) => a > b ? a : b)).clamp(1, double.infinity).toDouble();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SizedBox(
          height: 200,
          child: BarChart(BarChartData(
            maxY: maxV + 1,
            titlesData: FlTitlesData(
              leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28)),
              rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              bottomTitles: AxisTitles(sideTitles: SideTitles(
                showTitles: true,
                getTitlesWidget: (v, _) {
                  final i = v.toInt();
                  return Padding(padding: const EdgeInsets.only(top: 6), child: Text(i >= 0 && i < leads.length ? leads[i] : ''));
                },
              )),
            ),
            barGroups: [
              for (var i = 0; i < leads.length; i++)
                BarChartGroupData(x: i, barRods: [
                  BarChartRodData(toY: values[i], color: palette[i], width: 28, borderRadius: BorderRadius.circular(4)),
                ]),
            ],
          )),
        ),
      ),
    );
  }

  Widget _trendLine() {
    final trend = (_data?['trend'] as List?) ?? [];
    if (trend.isEmpty) return _empty();
    final spots = <FlSpot>[];
    for (var i = 0; i < trend.length; i++) {
      spots.add(FlSpot(i.toDouble(), ((trend[i]['amount'] ?? 0) as num).toDouble()));
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SizedBox(
          height: 200,
          child: LineChart(LineChartData(
            titlesData: const FlTitlesData(
              leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 36)),
              rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
              topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
              bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
            ),
            lineBarsData: [
              LineChartBarData(spots: spots, isCurved: true, color: const Color(0xFF2563EB), barWidth: 3, dotData: const FlDotData(show: false)),
            ],
          )),
        ),
      ),
    );
  }

  Widget _legend(Color c, String label) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 12, height: 12, color: c), const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontSize: 12)),
      ]);

  Widget _empty() => const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No data for this filter'))));

  String _fmt(dynamic n) => NumberFormat('#,##0').format((n ?? 0) as num);
}

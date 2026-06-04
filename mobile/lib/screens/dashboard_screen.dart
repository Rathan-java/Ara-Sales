import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import 'sales_entry_screen.dart';
import 'work_screen.dart';
import 'visit_screen.dart';
import 'analytics_screen.dart';
import 'clients_screen.dart';
import 'login_screen.dart';

/// Rep dashboard: current month split into Achieved + Pending.
/// Incentive shows ONLY when there is a revenue surplus. Salary is never shown.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _summary;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiService.instance.get('/rep/dashboard');
      setState(() => _summary = res['summary'] as Map<String, dynamic>);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    await AuthService.instance.logout();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = _summary;
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Dashboard'),
        actions: [
          IconButton(
            tooltip: 'Analytics',
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AnalyticsScreen())),
            icon: const Icon(Icons.bar_chart),
          ),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _statusBadge(s!),
                      const SizedBox(height: 16),
                      _achievedCard(s),
                      const SizedBox(height: 16),
                      _pendingCard(s),
                      const SizedBox(height: 16),
                      if ((s['incentiveAmount'] ?? 0) > 0) _incentiveCard(s),
                    ],
                  ),
                ),
      bottomNavigationBar: _actionsBar(),
    );
  }

  Widget _statusBadge(Map<String, dynamic> s) {
    final achieved = s['status'] == 'achieved';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: achieved ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(achieved ? Icons.check_circle : Icons.timelapse,
              color: achieved ? Colors.green : Colors.orange),
          const SizedBox(width: 8),
          Text('Month status: ${s['status'].toString().toUpperCase()}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        ],
      ),
    );
  }

  Widget _achievedCard(Map<String, dynamic> s) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Achieved', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            const SizedBox(height: 8),
            _metric('Clients onboarded', '${s['achievedClients']} / ${s['clientTarget']}', '${s['clientPct']}%'),
            _metric('Revenue (₹)', '${s['achievedAmount']} / ${s['revenueTarget']}', '${s['revenuePct']}%'),
            const SizedBox(height: 6),
            Text('Either-One rule: hitting one target marks the month achieved.',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _pendingCard(Map<String, dynamic> s) {
    final prod = (s['byProduct'] as Map?) ?? {};
    final lead = (s['byLeadType'] as Map?) ?? {};
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Pending', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            const SizedBox(height: 8),
            _metric('Remaining clients', '${s['remainingClients']}', ''),
            _metric('Remaining revenue (₹)', '${s['remainingRevenue']}', ''),
            const Divider(),
            const Text('By product', style: TextStyle(fontWeight: FontWeight.w600)),
            Text(prod.isEmpty ? '—' : prod.entries.map((e) => '${e.key}: ${e.value}').join('   ')),
            const SizedBox(height: 6),
            const Text('By lead type', style: TextStyle(fontWeight: FontWeight.w600)),
            Text('hot: ${lead['hot'] ?? 0}   warm: ${lead['warm'] ?? 0}   cold: ${lead['cold'] ?? 0}'),
          ],
        ),
      ),
    );
  }

  Widget _incentiveCard(Map<String, dynamic> s) {
    return Card(
      color: const Color(0xFFEFF6FF),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Incentive earned', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            Text('₹ ${s['incentiveAmount']}',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: Color(0xFF1D4ED8))),
          ],
        ),
      ),
    );
  }

  Widget _metric(String label, String value, String pct) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(child: Text(label)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
          if (pct.isNotEmpty) Padding(
            padding: const EdgeInsets.only(left: 8),
            child: Text(pct, style: const TextStyle(color: Color(0xFF2563EB))),
          ),
        ],
      ),
    );
  }

  // Bottom action bar. Uses BottomNavigationBar so 4 items lay out cleanly
  // (icon above a single-line label) at any screen width — no text wrapping.
  Widget _actionsBar() {
    return BottomNavigationBar(
      type: BottomNavigationBarType.fixed, // required for 4+ items
      currentIndex: 0,
      selectedItemColor: const Color(0xFF2563EB),
      unselectedItemColor: const Color(0xFF2563EB),
      showUnselectedLabels: true,
      onTap: (i) async {
        switch (i) {
          case 0:
            await Navigator.push(context, MaterialPageRoute(builder: (_) => const SalesEntryScreen()));
            _load();
            break;
          case 1:
            Navigator.push(context, MaterialPageRoute(builder: (_) => const WorkScreen()));
            break;
          case 2:
            Navigator.push(context, MaterialPageRoute(builder: (_) => const VisitScreen()));
            break;
          case 3:
            Navigator.push(context, MaterialPageRoute(builder: (_) => const ClientsScreen()));
            break;
        }
      },
      items: const [
        BottomNavigationBarItem(icon: Icon(Icons.add_chart), label: 'Add Sale'),
        BottomNavigationBarItem(icon: Icon(Icons.directions_walk), label: 'Work'),
        BottomNavigationBarItem(icon: Icon(Icons.camera_alt), label: 'Visit'),
        BottomNavigationBarItem(icon: Icon(Icons.people_alt), label: 'Clients'),
      ],
    );
  }
}

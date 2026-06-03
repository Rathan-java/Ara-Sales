import 'package:flutter/material.dart';
import '../services/api_service.dart';

/// Rep-facing client management.
/// Reps can add a client and edit its INFO (name, phone, address).
/// The LOCATION is never set here — it is fixed by HR (Google Maps link) or by
/// visiting & photographing the spot (then HR approves). We only DISPLAY the
/// location status so the rep knows whether a visit is needed.
class ClientsScreen extends StatefulWidget {
  const ClientsScreen({super.key});
  @override
  State<ClientsScreen> createState() => _ClientsScreenState();
}

class _ClientsScreenState extends State<ClientsScreen> {
  List<dynamic> _clients = [];
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
      final res = await ApiService.instance.get('/rep/clients');
      setState(() => _clients = res['clients'] as List<dynamic>);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _openEditor({Map<String, dynamic>? client}) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ClientEditor(client: client),
    );
    if (changed == true) _load();
  }

  Widget _locationBadge(String? status) {
    final s = status ?? 'unset';
    final cfg = {
      'approved': [Colors.green.shade100, Colors.green.shade800, 'Location set'],
      'pending': [Colors.orange.shade100, Colors.orange.shade800, 'Awaiting HR approval'],
      'unset': [Colors.grey.shade200, Colors.grey.shade700, 'No location — visit to set'],
    }[s]!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: cfg[0] as Color, borderRadius: BorderRadius.circular(999)),
      child: Text(cfg[2] as String, style: TextStyle(color: cfg[1] as Color, fontSize: 12)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Clients'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add),
        label: const Text('Add client'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _clients.isEmpty
                      ? ListView(children: const [
                          SizedBox(height: 80),
                          Center(child: Text('No clients yet. Tap “Add client”.')),
                        ])
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _clients.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final c = _clients[i] as Map<String, dynamic>;
                            return Card(
                              child: ListTile(
                                title: Text(c['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if ((c['phone'] ?? '').toString().isNotEmpty) Text('📞 ${c['phone']}'),
                                    if ((c['address'] ?? '').toString().isNotEmpty) Text('📍 ${c['address']}'),
                                    const SizedBox(height: 4),
                                    _locationBadge(c['location_status'] as String?),
                                  ],
                                ),
                                trailing: IconButton(
                                  icon: const Icon(Icons.edit),
                                  onPressed: () => _openEditor(client: c),
                                ),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}

class _ClientEditor extends StatefulWidget {
  const _ClientEditor({this.client});
  final Map<String, dynamic>? client;
  @override
  State<_ClientEditor> createState() => _ClientEditorState();
}

class _ClientEditorState extends State<_ClientEditor> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _address;
  bool _busy = false;
  String? _error;

  bool get isEdit => widget.client != null;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.client?['name']?.toString() ?? '');
    _phone = TextEditingController(text: widget.client?['phone']?.toString() ?? '');
    _address = TextEditingController(text: widget.client?['address']?.toString() ?? '');
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });
    try {
      final body = {
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'address': _address.text.trim(),
      };
      if (isEdit) {
        await ApiService.instance.put('/rep/clients/${widget.client!['id']}', body);
      } else {
        await ApiService.instance.post('/rep/clients', body);
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, bottom + 16),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(isEdit ? 'Edit client' : 'Add client',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Client name *', border: OutlineInputBorder()),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder()),
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _address,
              decoration: const InputDecoration(labelText: 'Address', border: OutlineInputBorder()),
              maxLines: 2,
            ),
            const SizedBox(height: 8),
            Text(
              'Location is set by HR (Google Maps) or by visiting & photographing the spot '
              '(then HR approves). You cannot set it here.',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
            ),
            if (_error != null) Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : (isEdit ? 'Save changes' : 'Add client')),
            ),
          ],
        ),
      ),
    );
  }
}

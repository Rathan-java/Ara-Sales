import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';

class SalesEntryScreen extends StatefulWidget {
  const SalesEntryScreen({super.key});
  @override
  State<SalesEntryScreen> createState() => _SalesEntryScreenState();
}

class _SalesEntryScreenState extends State<SalesEntryScreen> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _notes = TextEditingController();

  List<Map<String, dynamic>> _clients = [];
  int? _clientId;
  List<String> _products = [];
  String? _product;
  String _leadMode = 'platform';
  String _leadType = 'hot';
  DateTime _saleDate = DateTime.now();
  bool _busy = false;
  bool _loading = true;
  String? _error;

  // Lead mode: how the sale was made (value -> label).
  static const leadModes = [
    ['platform', 'Platform'],
    ['specific_dm', 'Specific Digital Marketing'],
    ['general_dm', 'General Digital Marketing'],
    ['direct_visit', 'Direct Visit'],
  ];
  static const leadTypes = ['hot', 'warm', 'cold'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final prodRes = await ApiService.instance.get('/rep/products');
      final products = (prodRes['products'] as List).map((p) => p['name'] as String).toList();
      final cliRes = await ApiService.instance.get('/rep/clients');
      final clients = (cliRes['clients'] as List).cast<Map<String, dynamic>>();
      setState(() {
        _products = products;
        if (products.isNotEmpty) _product = products.first;
        _clients = clients;
        if (clients.isNotEmpty) _clientId = clients.first['id'] as int;
      });
    } catch (e) {
      setState(() => _error = 'Could not load data: $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_product == null) { setState(() => _error = 'Please select a product'); return; }
    if (_clientId == null) { setState(() => _error = 'Please select a client'); return; }
    setState(() { _busy = true; _error = null; });
    try {
      final client = _clients.firstWhere((c) => c['id'] == _clientId);
      await ApiService.instance.post('/rep/sales', {
        'clientId': _clientId,
        'clientName': client['name'],
        'product': _product,
        'leadMode': _leadMode,
        'leadType': _leadType,
        'amount': double.parse(_amount.text.trim()),
        'saleDate': DateFormat('yyyy-MM-dd').format(_saleDate),
        'notes': _notes.text.trim(),
      });
      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add Sale')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Client (from the existing clients list — no free typing)
            _clients.isEmpty
                ? Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.orange),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'No clients yet. Add a client first from the Clients screen, '
                      'then book the sale.',
                    ),
                  )
                : DropdownButtonFormField<int>(
                    initialValue: _clientId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Client', border: OutlineInputBorder()),
                    items: _clients
                        .map((c) => DropdownMenuItem<int>(
                              value: c['id'] as int,
                              child: Text(c['name'] as String, overflow: TextOverflow.ellipsis),
                            ))
                        .toList(),
                    onChanged: (v) => setState(() => _clientId = v),
                    validator: (v) => v == null ? 'Select a client' : null,
                  ),
            const SizedBox(height: 12),
            // Product (from the catalogue)
            DropdownButtonFormField<String>(
              initialValue: _product,
              decoration: const InputDecoration(labelText: 'Product', border: OutlineInputBorder()),
              items: _products.map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
              onChanged: (v) => setState(() => _product = v),
              validator: (v) => v == null ? 'Select a product' : null,
            ),
            const SizedBox(height: 12),
            // Lead mode
            DropdownButtonFormField<String>(
              initialValue: _leadMode,
              decoration: const InputDecoration(labelText: 'Lead mode', border: OutlineInputBorder()),
              items: leadModes.map((m) => DropdownMenuItem(value: m[0], child: Text(m[1]))).toList(),
              onChanged: (v) => setState(() => _leadMode = v!),
            ),
            const SizedBox(height: 12),
            // Lead type
            DropdownButtonFormField<String>(
              initialValue: _leadType,
              decoration: const InputDecoration(labelText: 'Lead type', border: OutlineInputBorder()),
              items: leadTypes.map((l) => DropdownMenuItem(value: l, child: Text(l))).toList(),
              onChanged: (v) => setState(() => _leadType = v!),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _amount,
              decoration: const InputDecoration(labelText: 'Amount (₹)', border: OutlineInputBorder()),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: (v) => (double.tryParse(v ?? '') == null) ? 'Enter a valid amount' : null,
            ),
            const SizedBox(height: 12),
            ListTile(
              shape: RoundedRectangleBorder(
                side: const BorderSide(color: Colors.grey),
                borderRadius: BorderRadius.circular(4),
              ),
              title: Text('Sale date: ${DateFormat('yyyy-MM-dd').format(_saleDate)}'),
              trailing: const Icon(Icons.calendar_today),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _saleDate,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now(),
                );
                if (picked != null) setState(() => _saleDate = picked);
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _notes,
              decoration: const InputDecoration(labelText: 'Notes (optional)', border: OutlineInputBorder()),
              maxLines: 2,
            ),
            if (_error != null) Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Saving...' : 'Save sale')),
          ],
        ),
      ),
    );
  }
}

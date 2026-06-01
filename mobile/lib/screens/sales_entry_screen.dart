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
  final _clientName = TextEditingController();
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  String _product = 'schoolmate';
  String _leadType = 'hot';
  DateTime _saleDate = DateTime.now();
  bool _busy = false;
  String? _error;

  static const products = ['schoolmate', 'school_dm', 'general_dm', 'both'];
  static const leads = ['hot', 'warm', 'cold'];

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });
    try {
      await ApiService.instance.post('/rep/sales', {
        'clientName': _clientName.text.trim(),
        'product': _product,
        'leadType': _leadType,
        'amount': double.parse(_amount.text.trim()),
        'saleDate': DateFormat('yyyy-MM-dd').format(_saleDate),
        'notes': _notes.text.trim(),
      });
      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add Sale')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _clientName,
              decoration: const InputDecoration(labelText: 'Client name', border: OutlineInputBorder()),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _product,
              decoration: const InputDecoration(labelText: 'Product', border: OutlineInputBorder()),
              items: products.map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
              onChanged: (v) => setState(() => _product = v!),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _leadType,
              decoration: const InputDecoration(labelText: 'Lead type', border: OutlineInputBorder()),
              items: leads.map((l) => DropdownMenuItem(value: l, child: Text(l))).toList(),
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

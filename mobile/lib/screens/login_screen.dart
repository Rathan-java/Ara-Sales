import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import 'dashboard_screen.dart';
import 'forgot_password_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'ravi@ara.test');
  final _password = TextEditingController();
  bool _obscure = true;
  String? _error;
  bool _busy = false;

  Future<void> _login() async {
    setState(() { _busy = true; _error = null; });
    try {
      await AuthService.instance.login(_email.text.trim(), _password.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    } catch (e) {
      setState(() => _error = _clean(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _clean(Object e) => e.toString().replaceFirst('Exception: ', '');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Ara Sales',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 30, fontWeight: FontWeight.bold, color: Color(0xFF2563EB))),
              const SizedBox(height: 4),
              const Text('Sales Rep', textAlign: TextAlign.center),
              const SizedBox(height: 24),
              TextField(
                controller: _email,
                decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                obscureText: _obscure,
                decoration: InputDecoration(
                  labelText: 'Password',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                onSubmitted: (_) => _busy ? null : _login(),
              ),
              if (_error != null) Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _login,
                child: Text(_busy ? '...' : 'Log in'),
              ),
              TextButton(
                onPressed: _busy ? null : () {
                  Navigator.push(context, MaterialPageRoute(
                    builder: (_) => ForgotPasswordScreen(initialEmail: _email.text.trim()),
                  ));
                },
                child: const Text('Forgot Password?'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

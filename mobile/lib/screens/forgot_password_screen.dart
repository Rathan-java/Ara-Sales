import 'package:flutter/material.dart';
import '../services/auth_service.dart';

/// Three-step password recovery:
///   1. enter email   -> request OTP
///   2. enter OTP      -> verify
///   3. new password   -> reset, then return to login
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});
  final String initialEmail;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  int _step = 0; // 0=email, 1=otp, 2=new password
  late final TextEditingController _email =
      TextEditingController(text: widget.initialEmail);
  final _otp = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  String? _error;
  String? _info;
  bool _busy = false;

  String _clean(Object e) => e.toString().replaceFirst('Exception: ', '');

  Future<void> _sendCode() async {
    setState(() { _busy = true; _error = null; _info = null; });
    try {
      await AuthService.instance.forgotPassword(_email.text.trim());
      setState(() {
        _info = 'If an account exists, a 6-digit code was emailed.';
        _step = 1;
      });
    } catch (e) {
      setState(() => _error = _clean(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() { _busy = true; _error = null; _info = null; });
    try {
      await AuthService.instance.verifyResetOtp(_email.text.trim(), _otp.text.trim());
      setState(() { _info = 'Code verified. Set a new password.'; _step = 2; });
    } catch (e) {
      setState(() => _error = _clean(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    if (_newPassword.text != _confirm.text) {
      setState(() => _error = 'Passwords do not match');
      return;
    }
    if (_newPassword.text.length < 8) {
      setState(() => _error = 'Password must be at least 8 characters');
      return;
    }
    setState(() { _busy = true; _error = null; _info = null; });
    try {
      await AuthService.instance.resetPassword(
        _email.text.trim(), _otp.text.trim(), _newPassword.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password updated. Please log in.')),
      );
      Navigator.pop(context); // back to login
    } catch (e) {
      setState(() => _error = _clean(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reset Password')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Step ${_step + 1} of 3',
                style: TextStyle(color: Colors.grey.shade600, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            if (_step == 0) ..._emailStep(),
            if (_step == 1) ..._otpStep(),
            if (_step == 2) ..._passwordStep(),
            if (_info != null) Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_info!, style: const TextStyle(color: Color(0xFF1D4ED8))),
            ),
            if (_error != null) Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _emailStep() => [
        const Text('Enter your account email to receive a verification code.'),
        const SizedBox(height: 12),
        TextField(
          controller: _email,
          decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: _busy ? null : _sendCode, child: Text(_busy ? '...' : 'Send code')),
      ];

  List<Widget> _otpStep() => [
        Text('Enter the 6-digit code sent to ${_email.text.trim()}.'),
        const SizedBox(height: 12),
        TextField(
          controller: _otp,
          decoration: const InputDecoration(labelText: 'Verification code', border: OutlineInputBorder()),
          keyboardType: TextInputType.number,
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: _busy ? null : _verify, child: Text(_busy ? '...' : 'Verify code')),
        TextButton(onPressed: _busy ? null : _sendCode, child: const Text('Resend code')),
      ];

  List<Widget> _passwordStep() => [
        const Text('Set a new password (minimum 8 characters).'),
        const SizedBox(height: 12),
        TextField(
          controller: _newPassword,
          obscureText: _obscure,
          decoration: InputDecoration(
            labelText: 'New password',
            border: const OutlineInputBorder(),
            suffixIcon: IconButton(
              icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _confirm,
          obscureText: _obscure,
          decoration: const InputDecoration(labelText: 'Confirm password', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: _busy ? null : _reset, child: Text(_busy ? '...' : 'Set new password')),
      ];
}

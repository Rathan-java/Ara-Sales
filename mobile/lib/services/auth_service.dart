import 'api_service.dart';

/// Authentication for the rep app.
///
/// Primary login is email + PASSWORD. The OTP is used ONLY for the
/// forgot-password recovery flow.
class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  /// Verifies email + password, persists session. Throws if the account is not
  /// a rep (admins use the web dashboard).
  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await ApiService.instance.post('/auth/login', {
      'email': email,
      'password': password,
    });
    final user = res['user'] as Map<String, dynamic>;
    if (user['role'] != 'rep') {
      throw Exception('This app is for sales reps. Admins use the web dashboard.');
    }
    await ApiService.instance.setSession(res['token'] as String, user);
    return user;
  }

  // ---- Forgot-password flow (OTP via email) ----

  Future<void> forgotPassword(String email) async {
    await ApiService.instance.post('/auth/forgot-password', {'email': email});
  }

  Future<void> verifyResetOtp(String email, String otp) async {
    await ApiService.instance.post('/auth/verify-reset-otp', {'email': email, 'otp': otp});
  }

  Future<void> resetPassword(String email, String otp, String newPassword) async {
    await ApiService.instance.post('/auth/reset-password', {
      'email': email,
      'otp': otp,
      'newPassword': newPassword,
    });
  }

  Future<void> logout() => ApiService.instance.clearSession();
}

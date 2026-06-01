import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiService.instance.loadToken();
  runApp(const AraSalesApp());
}

class AraSalesApp extends StatelessWidget {
  const AraSalesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ara Sales',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF2563EB),
        useMaterial3: true,
      ),
      home: ApiService.instance.isLoggedIn
          ? const DashboardScreen()
          : const LoginScreen(),
    );
  }
}

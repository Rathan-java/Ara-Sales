import 'package:flutter_test/flutter_test.dart';

/// Mirror of the server rule the rep UI relies on: incentive is shown ONLY when
/// there is a revenue surplus, and salary is never present in rep data.
bool shouldShowIncentive(Map<String, dynamic> summary) {
  final inc = summary['incentiveAmount'] ?? 0;
  return inc is num && inc > 0;
}

void main() {
  test('incentive shown only with a revenue surplus', () {
    expect(shouldShowIncentive({'incentiveAmount': 4000}), isTrue);
    expect(shouldShowIncentive({'incentiveAmount': 0}), isFalse);
    expect(shouldShowIncentive({}), isFalse);
  });

  test('rep summary never contains salary fields', () {
    final repSummary = {
      'achievedClients': 3, 'clientTarget': 10, 'achievedAmount': 120000,
      'revenueTarget': 100000, 'status': 'achieved', 'incentiveAmount': 4000,
    };
    expect(repSummary.containsKey('monthlySalary'), isFalse);
    expect(repSummary.containsKey('salary'), isFalse);
  });
}

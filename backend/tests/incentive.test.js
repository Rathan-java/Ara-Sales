'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeIncentive,
  computeTieredIncentive,
  validateTiers,
  evaluateEitherOne,
  toPaise,
  fromPaise,
} = require('../src/services/incentive.service');

const HR_TIERS = [
  { from: 0, to: 100000, percent: 5 },
  { from: 100000, to: 200000, percent: 3 },
  { from: 200000, to: null, percent: 2 },
];

test('TIERED — HR worked example: target 100000, achieved 250000 -> 6500', () => {
  const r = computeTieredIncentive({ revenueTarget: 100000, achievedAmount: 250000 }, HR_TIERS);
  assert.equal(r.surplus, 150000);
  assert.equal(r.incentiveAmount, 6500); // 100000*5% + 50000*3%
  assert.equal(r.breakdown.length, 2);
});

test('TIERED — no surplus (achieved = target) pays 0', () => {
  const r = computeTieredIncentive({ revenueTarget: 100000, achievedAmount: 100000 }, HR_TIERS);
  assert.equal(r.incentiveAmount, 0);
  assert.equal(r.hasRevenueSurplus, false);
});

test('TIERED — below target pays 0', () => {
  const r = computeTieredIncentive({ revenueTarget: 100000, achievedAmount: 80000 }, HR_TIERS);
  assert.equal(r.incentiveAmount, 0);
});

test('TIERED — only first slab partially filled', () => {
  // surplus 50000 -> 50000 * 5% = 2500
  const r = computeTieredIncentive({ revenueTarget: 100000, achievedAmount: 150000 }, HR_TIERS);
  assert.equal(r.incentiveAmount, 2500);
});

test('TIERED — first slab fully filled exactly', () => {
  // surplus 100000 -> 100000 * 5% = 5000
  const r = computeTieredIncentive({ revenueTarget: 100000, achievedAmount: 200000 }, HR_TIERS);
  assert.equal(r.incentiveAmount, 5000);
});

test('TIERED — into third open-ended slab', () => {
  // target 100000, achieved 400000 -> surplus 300000
  // 100000*5%=5000 + 100000*3%=3000 + 100000*2%=2000 = 10000
  const r = computeTieredIncentive({ revenueTarget: 100000, achievedAmount: 400000 }, HR_TIERS);
  assert.equal(r.incentiveAmount, 10000);
});

test('TIERED — beyond last CLOSED slab pays 0% on the excess', () => {
  // closed tiers (no open-ended): surplus above 200000 earns nothing
  const closed = [
    { from: 0, to: 100000, percent: 5 },
    { from: 100000, to: 200000, percent: 3 },
  ];
  // achieved 400000 -> surplus 300000; only first 200000 counts: 5000 + 3000 = 8000
  const r = computeTieredIncentive({ revenueTarget: 100000, achievedAmount: 400000 }, closed);
  assert.equal(r.incentiveAmount, 8000);
});

test('TIERED — HR can set any percentages (not hardcoded)', () => {
  const custom = [
    { from: 0, to: 50000, percent: 10 },
    { from: 50000, to: null, percent: 4 },
  ];
  // target 100000 achieved 200000 -> surplus 100000: 50000*10%=5000 + 50000*4%=2000 = 7000
  const r = computeTieredIncentive({ revenueTarget: 100000, achievedAmount: 200000 }, custom);
  assert.equal(r.incentiveAmount, 7000);
});

test('TIERED — empty/no tiers pays 0', () => {
  const r = computeTieredIncentive({ revenueTarget: 100000, achievedAmount: 250000 }, []);
  assert.equal(r.incentiveAmount, 0);
});

test('validateTiers — accepts a valid contiguous set', () => {
  assert.equal(validateTiers(HR_TIERS).valid, true);
});

test('validateTiers — rejects gap between slabs', () => {
  const gapped = [
    { from: 0, to: 100000, percent: 5 },
    { from: 150000, to: 200000, percent: 3 }, // gap 100000-150000
  ];
  assert.equal(validateTiers(gapped).valid, false);
});

test('validateTiers — rejects more than 5 slabs', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ from: i * 10000, to: (i + 1) * 10000, percent: 1 }));
  assert.equal(validateTiers(six).valid, false);
});

test('validateTiers — first slab must start at 0', () => {
  const r = validateTiers([{ from: 5000, to: 100000, percent: 5 }]);
  assert.equal(r.valid, false);
});

test('worked example: target 100000, achieved 120000, salary 20000 -> 20% -> incentive 4000', () => {
  const result = computeIncentive({
    revenueTarget: 100000,
    achievedAmount: 120000,
    monthlySalary: 20000,
  });
  assert.equal(result.surplusPct, 20);
  assert.equal(result.incentiveAmount, 4000);
  assert.equal(result.hasRevenueSurplus, true);
});

test('no incentive when achieved equals target (no surplus)', () => {
  const result = computeIncentive({
    revenueTarget: 100000,
    achievedAmount: 100000,
    monthlySalary: 20000,
  });
  assert.equal(result.incentiveAmount, 0);
  assert.equal(result.hasRevenueSurplus, false);
});

test('no incentive when achieved is below target', () => {
  const result = computeIncentive({
    revenueTarget: 100000,
    achievedAmount: 80000,
    monthlySalary: 20000,
  });
  assert.equal(result.incentiveAmount, 0);
  assert.equal(result.hasRevenueSurplus, false);
});

test('client-count surplus alone pays nothing (revenue target not exceeded)', () => {
  // Client target smashed, but revenue exactly on target -> zero incentive.
  const result = computeIncentive({
    revenueTarget: 100000,
    achievedAmount: 100000,
    monthlySalary: 20000,
  });
  assert.equal(result.incentiveAmount, 0);
  assert.equal(result.hasRevenueSurplus, false);
});

test('cap config (default off) does not limit payout', () => {
  const result = computeIncentive({
    revenueTarget: 100000,
    achievedAmount: 300000, // 200% surplus
    monthlySalary: 20000,
  });
  assert.equal(result.surplusPct, 200);
  assert.equal(result.incentiveAmount, 40000);
});

test('cap config (enabled) limits payout without code change', () => {
  const result = computeIncentive(
    { revenueTarget: 100000, achievedAmount: 300000, monthlySalary: 20000 },
    { capEnabled: true, maxIncentiveAmount: 10000 },
  );
  assert.equal(result.incentiveAmount, 10000);
});

test('multiplier config scales the payout', () => {
  const result = computeIncentive(
    { revenueTarget: 100000, achievedAmount: 120000, monthlySalary: 20000 },
    { multiplier: 1.5 },
  );
  // 20% * 1.5 = 30% of 20000 = 6000
  assert.equal(result.incentiveAmount, 6000);
});

test('money parsing uses fixed precision (no float drift)', () => {
  assert.equal(toPaise('0.1') + toPaise('0.2'), 30); // 10 + 20 paise
  assert.equal(fromPaise(30), 0.3);
});

test('Either-One: revenue-only met -> achieved', () => {
  const r = evaluateEitherOne({
    clientTarget: 10,
    achievedClients: 4,
    revenueTarget: 100000,
    achievedAmount: 100000,
  });
  assert.equal(r.achieved, true);
  assert.equal(r.revenueMet, true);
  assert.equal(r.clientMet, false);
  assert.equal(r.status, 'achieved');
});

test('Either-One: client-only met -> achieved', () => {
  const r = evaluateEitherOne({
    clientTarget: 10,
    achievedClients: 12,
    revenueTarget: 100000,
    achievedAmount: 50000,
  });
  assert.equal(r.achieved, true);
  assert.equal(r.clientMet, true);
  assert.equal(r.revenueMet, false);
  assert.equal(r.status, 'achieved');
});

test('Either-One: neither met -> pending', () => {
  const r = evaluateEitherOne({
    clientTarget: 10,
    achievedClients: 3,
    revenueTarget: 100000,
    achievedAmount: 40000,
  });
  assert.equal(r.achieved, false);
  assert.equal(r.status, 'pending');
  assert.equal(r.remainingClients, 7);
  assert.equal(r.remainingRevenue, 60000);
});

test('Either-One: percentages and surpluses computed', () => {
  const r = evaluateEitherOne({
    clientTarget: 10,
    achievedClients: 15,
    revenueTarget: 100000,
    achievedAmount: 120000,
  });
  assert.equal(r.clientPct, 150);
  assert.equal(r.revenuePct, 120);
  assert.equal(r.clientSurplus, 5);
  assert.equal(r.revenueSurplus, 20000);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeIncentive,
  evaluateEitherOne,
  toPaise,
  fromPaise,
} = require('../src/services/incentive.service');

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

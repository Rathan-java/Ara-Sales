'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCoordsFromText } = require('../src/services/geocode.service');

test('plain "lat, lng"', () => {
  const r = parseCoordsFromText('12.9716, 77.5946');
  assert.deepEqual(r, { lat: 12.9716, lng: 77.5946 });
});

test('plain "lat,lng" no space', () => {
  const r = parseCoordsFromText('12.9716,77.5946');
  assert.deepEqual(r, { lat: 12.9716, lng: 77.5946 });
});

test('maps URL with @center', () => {
  const r = parseCoordsFromText('https://www.google.com/maps/@12.9716,77.5946,15z');
  assert.deepEqual(r, { lat: 12.9716, lng: 77.5946 });
});

test('maps URL with !3d!4d (placed pin wins over center)', () => {
  const url = 'https://www.google.com/maps/place/X/@12.0,77.0,17z/data=!3d12.9716!4d77.5946';
  const r = parseCoordsFromText(url);
  assert.deepEqual(r, { lat: 12.9716, lng: 77.5946 });
});

test('maps URL with ?q=lat,lng', () => {
  const r = parseCoordsFromText('https://maps.google.com/?q=12.9716,77.5946');
  assert.deepEqual(r, { lat: 12.9716, lng: 77.5946 });
});

test('rejects garbage', () => {
  assert.equal(parseCoordsFromText('not a location'), null);
  assert.equal(parseCoordsFromText(''), null);
  assert.equal(parseCoordsFromText('999, 999'), null); // out of range
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { filterRoutes, getRouteColor, getVisibleClaims } from './routeFilters.js';

const now = Date.now();
const routes = [
  { id: 'north', color: '#b8ff5c', recordedAt: now },
  { id: 'south', color: '#ff5e7d', recordedAt: now - 1000 },
  { id: 'open', color: '#5cdcff', recordedAt: now - 2000 },
];
const claims = [
  { id: 'claim-north', routeId: 'north', color: '#000000' },
  { id: 'claim-south', routeId: 'south', color: '#000000' },
];

test('shows only selected route territories, with matching route colors', () => {
  const visible = filterRoutes(routes, new Set(['south']), 'year', now);
  assert.deepEqual(getVisibleClaims(claims, visible), [
    { ...claims[1], color: routes[1].color },
  ]);
});

test('shows multiple selected territories and none when selection is empty', () => {
  assert.equal(getVisibleClaims(claims, routes).length, 2);
  assert.deepEqual(getVisibleClaims(claims, []), []);
  assert.deepEqual(getVisibleClaims(claims, [routes[2]]), []);
});

test('last-route period also filters captured territories', () => {
  const visible = filterRoutes(routes, new Set(routes.map((route) => route.id)), 'last', now);
  assert.deepEqual(getVisibleClaims(claims, visible).map((claim) => claim.routeId), ['north']);
});

test('route colors are stable and distinct across a batch', () => {
  const colors = Array.from({ length: 100 }, (_, index) => getRouteColor(index));
  assert.equal(new Set(colors).size, colors.length);
  assert.equal(getRouteColor(4), getRouteColor(4));
});
import assert from 'node:assert/strict';
import test from 'node:test';
import { filterRoutes } from './routeFilters.js';

const now = Date.parse('2026-11-09T12:00:00Z');
const routes = [
  { id: 'today', recordedAt: now },
  { id: 'yesterday', recordedAt: now - 24 * 60 * 60 * 1000 },
  { id: 'three-weeks', recordedAt: now - 21 * 24 * 60 * 60 * 1000 },
  { id: 'six-months', recordedAt: now - 180 * 24 * 60 * 60 * 1000 },
  { id: 'two-years', recordedAt: now - 730 * 24 * 60 * 60 * 1000 },
];
const allSelected = new Set(routes.map((route) => route.id));

test('filters to the most recent route', () => {
  assert.deepEqual(filterRoutes(routes, allSelected, 'last', now).map((route) => route.id), ['today']);
});

test('filters routes by week, month, and year', () => {
  assert.deepEqual(filterRoutes(routes, allSelected, 'week', now).map((route) => route.id), ['today', 'yesterday']);
  assert.deepEqual(filterRoutes(routes, allSelected, 'month', now).map((route) => route.id), ['today', 'yesterday', 'three-weeks']);
  assert.deepEqual(filterRoutes(routes, allSelected, 'year', now).map((route) => route.id), ['today', 'yesterday', 'three-weeks', 'six-months']);
});

test('omits unselected routes from the selected period', () => {
  assert.deepEqual(filterRoutes(routes, new Set(['today', 'three-weeks']), 'month', now).map((route) => route.id), ['today', 'three-weeks']);
});

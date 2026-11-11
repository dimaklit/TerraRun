import assert from 'node:assert/strict';
import test from 'node:test';
import { area, polygon } from '@turf/turf';
import { buildTerritoryTowers, calculateRouteMetrics, calculateSharedAreaSqKm } from './routeMetrics.js';

test('overlapping towers have additive heights and non-overlapping geometry', () => {
  const first = rectangle(0, 0, 2, 1);
  first.properties = { height: 10, color: '#b8ff5c' };
  const second = rectangle(1, 0, 3, 1);
  second.properties = { height: 12, color: '#ff5e7d' };
  const regions = buildTerritoryTowers([first, second]).features;
  assert.deepEqual(regions.map((region) => region.properties.height).sort((left, right) => left - right), [10, 12, 22]);
  assert.equal(calculateSharedAreaSqKm(regions), 0);
  assert.equal(regions.find((region) => region.properties.coverage === 2).properties.height, 22);
});

test('triple coverage raises height again and selection removes extra height', () => {
  const feature = rectangle(0, 0, 1, 1);
  feature.properties = { height: 10, color: '#b8ff5c' };
  const triple = buildTerritoryTowers([feature, feature, feature]).features;
  assert.equal(triple.length, 1);
  assert.equal(triple[0].properties.height, 30);
  assert.equal(triple[0].properties.coverage, 3);
  assert.equal(buildTerritoryTowers([feature]).features[0].properties.height, 10);
  assert.equal(buildTerritoryTowers([]).features.length, 0);
});

const rectangle = (west, south, east, north) => polygon([[
  [west, south], [east, south], [east, north], [west, north], [west, south],
]]);

test('shared area is zero for one route, disjoint routes, or touching boundaries', () => {
  const first = rectangle(0, 0, 1, 1);
  assert.equal(calculateSharedAreaSqKm([]), 0);
  assert.equal(calculateSharedAreaSqKm([first]), 0);
  assert.equal(calculateSharedAreaSqKm([first, rectangle(2, 0, 3, 1)]), 0);
  assert.equal(calculateSharedAreaSqKm([first, rectangle(1, 0, 2, 1)]), 0);
});

test('shared area measures the intersection rather than adding route areas', () => {
  const shared = calculateSharedAreaSqKm([rectangle(0, 0, 2, 1), rectangle(1, 0, 3, 1)]);
  const expected = area(rectangle(1, 0, 2, 1)) / 1_000_000;
  assert.ok(Math.abs(shared - expected) < 0.000001);
});

test('shared area grows with new overlap and counts triple coverage only once', () => {
  const first = rectangle(0, 0, 2, 1);
  const second = rectangle(1, 0, 3, 1);
  const initial = calculateSharedAreaSqKm([first, second]);
  assert.ok(calculateSharedAreaSqKm([first, second, rectangle(2, 0, 4, 1)]) > initial);
  assert.ok(Math.abs(calculateSharedAreaSqKm([first, second, rectangle(1, 0, 2, 1)]) - initial) < 0.000001);
});

test('captures an area enclosed by an open self-crossing route', () => {
  const metrics = calculateRouteMetrics([
    [-73.99, 40.75],
    [-73.98, 40.76],
    [-73.98, 40.75],
    [-73.99, 40.76],
  ]);

  assert.equal(metrics.isClosed, false);
  assert.ok(metrics.routeDistanceKm > 0);
  assert.ok(metrics.areaSqKm > 0);
  assert.ok(metrics.polygon);
});

test('returns separate captured faces for a figure-eight route', () => {
  const metrics = calculateRouteMetrics([
    [0, 0], [1, 1], [-1, 1], [0, 0], [-1, -1], [1, -1], [0, 0],
  ]);

  assert.equal(metrics.polygon.geometry.type, 'MultiPolygon');
  assert.equal(metrics.polygon.geometry.coordinates.length, 2);
  assert.ok(metrics.areaSqKm > 0);
});

test('does not capture area for an open route without a self-crossing', () => {
  const metrics = calculateRouteMetrics([
    [-73.99, 40.75], [-73.98, 40.75], [-73.98, 40.76],
  ]);

  assert.equal(metrics.polygon, null);
  assert.equal(metrics.areaSqKm, 0);
});

test('calculates area for a closed route', () => {
  const metrics = calculateRouteMetrics([
    [-73.99, 40.75], [-73.98, 40.75], [-73.98, 40.76], [-73.99, 40.76], [-73.99, 40.75],
  ]);

  assert.equal(metrics.isClosed, true);
  assert.ok(metrics.areaSqKm > 0);
});

test('closes a route whose finish is within the 50 meter tolerance', () => {
  const metrics = calculateRouteMetrics([
    [-73.99, 40.75], [-73.98, 40.75], [-73.98, 40.76], [-73.99, 40.7501],
  ]);

  assert.equal(metrics.isClosed, true);
  assert.ok(metrics.areaSqKm > 0);
});

test('withholds area for a speed-flagged route', () => {
  const metrics = calculateRouteMetrics(
    [[0, 0], [0.001, 0], [0, 0]],
    [0, 1, 2],
  );

  assert.equal(metrics.flagged, true);
  assert.equal(metrics.polygon, null);
  assert.equal(metrics.areaSqKm, 0);
});
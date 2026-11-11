import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRouteGeometries } from './geo.js';

test('extracts every route from a GeoJSON FeatureCollection', () => {
  const routes = extractRouteGeometries({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'North Loop' }, geometry: { type: 'LineString', coordinates: [[-73.99, 40.75], [-73.98, 40.75]] } },
      { type: 'Feature', properties: { name: 'South Loop' }, geometry: { type: 'LineString', coordinates: [[-73.99, 40.74], [-73.98, 40.74]] } },
    ],
  });

  assert.equal(routes.length, 2);
  assert.deepEqual(routes.map((route) => route.name), ['North Loop', 'South Loop']);
});

test('splits MultiLineString parts into routes and keeps coordinate times', () => {
  const routes = extractRouteGeometries({
    type: 'Feature',
    properties: {
      name: 'Morning Run',
      coordinateProperties: { times: ['2026-11-09T08:00:00Z', '2026-11-09T08:01:00Z', '2026-11-09T08:02:00Z', '2026-11-09T08:03:00Z'] },
    },
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        [[-73.99, 40.75], [-73.98, 40.75]],
        [[-73.97, 40.75], [-73.96, 40.75]],
      ],
    },
  });

  assert.equal(routes.length, 2);
  assert.deepEqual(routes[0].times, [Date.parse('2026-11-09T08:00:00Z'), Date.parse('2026-11-09T08:01:00Z')]);
  assert.deepEqual(routes[1].times, [Date.parse('2026-11-09T08:02:00Z'), Date.parse('2026-11-09T08:03:00Z')]);
});

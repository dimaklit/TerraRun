import assert from 'node:assert/strict';
import test from 'node:test';
import { booleanPointInPolygon, multiPolygon, polygon } from '@turf/turf';
import { groupTerritoryFlags, territoryFlagAnchor } from './territoryPresentation.js';

test('flag anchors stay on concave territories and outside holes', () => {
  const surfaces = [
    polygon([[[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4], [0, 0]]]),
    polygon([[[0, 0], [6, 0], [6, 6], [0, 6], [0, 0]], [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]]]),
  ];
  for (const surface of surfaces) {
    assert.ok(booleanPointInPolygon(territoryFlagAnchor({ polygon: surface }), surface));
  }
});

test('fragmented territory puts its flag on the largest island', () => {
  const small = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];
  const large = [[[10, 0], [14, 0], [14, 4], [10, 4], [10, 0]]];
  const anchor = territoryFlagAnchor({ polygon: multiPolygon([small, large]) });
  assert.ok(booleanPointInPolygon(anchor, polygon(large)));
});

test('nearby flags group at screen scale, preserving selection and omitting offscreen flags', () => {
  const flags = [
    { claim: { id: 'a' }, coordinates: [100, 100] },
    { claim: { id: 'b' }, coordinates: [120, 110] },
    { claim: { id: 'c' }, coordinates: [240, 150] },
    { claim: { id: 'outside' }, coordinates: [-60, 100] },
  ];
  const groups = groupTerritoryFlags(flags, ([x, y]) => ({ x, y }), 375, 667, 'b');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].flags.map((flag) => flag.claim.id), ['b', 'a']);
  assert.equal(groups[1].flags[0].claim.id, 'c');
  assert.equal(groupTerritoryFlags(flags, ([x, y]) => ({ x: x * 4, y }), 1500, 667).length, 3);
});

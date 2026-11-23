import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRivalClaims, publishClaims, rivalColorFromToken, rivalFromFeedRow } from './sharedClaims.js';

const polygon = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };

test('rival feed rows become anonymous combat activities', () => {
  const rival = rivalFromFeedRow({ id: 'abc', owner_token: 'deadbeef', claim: { polygon, areaSqKm: 0.5, activityType: 'bike' }, recorded_at: '2026-11-17T08:00:00Z' });
  assert.equal(rival.username, 'rival:deadbeef');
  assert.equal(rival.name, 'Rival DEAD');
  assert.equal(rival.recordedAt, Date.parse('2026-11-17T08:00:00Z'));
  assert.deepEqual(rival.polygon, polygon);
  assert.equal(rival.activityType, 'bike');
  // Claims published before activity types existed fall back to the default world.
  assert.equal(rivalFromFeedRow({ id: 'x', owner_token: 'cafe', claim: { polygon, areaSqKm: 0.1 }, recorded_at: '2026-11-17T08:00:00Z' }).activityType, 'run');
});

test('each rival token gets a unique stable color', () => {
  const first = rivalColorFromToken('deadbeef00');
  assert.equal(first, rivalColorFromToken('deadbeef00'));
  assert.match(first, /^hsl\(\d+, 82%, 58%\)$/);
  assert.notEqual(first, rivalColorFromToken('cafebabe00'));
});

test('publishClaims sends only polygon, area and type, skips open routes, ignores duplicates', async () => {
  const inserted = [];
  // The first row is already published (23505); the second must still be inserted.
  const client = { from: () => ({ insert: async (row) => { inserted.push(row); return { error: inserted.length === 1 ? { code: '23505' } : null }; } }) };
  await publishClaims(client, [
    { activityKey: 'user@example.com:key1', polygon, areaSqKm: 0.5, recordedAt: 1700000000000, name: 'Secret run', username: 'user@example.com', activityType: 'bike' },
    { activityKey: 'user@example.com:key2', polygon: null, areaSqKm: 0, recordedAt: 1700000000000 },
    { activityKey: 'user@example.com:key3', polygon, areaSqKm: 0.2, recordedAt: 1700000001000 },
  ]);
  assert.equal(inserted.length, 2);
  assert.deepEqual(Object.keys(inserted[0]).sort(), ['claim', 'claim_key', 'recorded_at']);
  assert.deepEqual(Object.keys(inserted[0].claim).sort(), ['activityType', 'areaSqKm', 'polygon']);
  assert.equal(inserted[0].claim.activityType, 'bike');
  // Claims without an explicit type publish into the default world.
  assert.equal(inserted[1].claim.activityType, 'run');

  const failing = { from: () => ({ insert: async () => ({ error: { code: '42501', message: 'denied' } }) }) };
  await assert.rejects(publishClaims(failing, [{ activityKey: 'k', polygon, areaSqKm: 1, recordedAt: 0 }]));
});

test('loadRivalClaims maps feed rows through rivalFromFeedRow', async () => {
  const row = { id: 'r1', owner_token: 'cafe', mine: false, claim: { polygon, areaSqKm: 0.25 }, recorded_at: '2026-11-17T08:00:00Z' };
  const client = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [row], error: null }) }) }) }) };
  const rivals = await loadRivalClaims(client);
  assert.equal(rivals.length, 1);
  assert.equal(rivals[0].id, 'rival-r1');
  assert.equal(rivals[0].areaSqKm, 0.25);
});

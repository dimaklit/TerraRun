import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRivalClaims, publishClaims, rivalFromFeedRow } from './sharedClaims.js';

const polygon = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };

test('rival feed rows become anonymous combat activities', () => {
  const rival = rivalFromFeedRow({ id: 'abc', owner_token: 'deadbeef', claim: { polygon, areaSqKm: 0.5 }, recorded_at: '2026-11-17T08:00:00Z' });
  assert.equal(rival.username, 'rival:deadbeef');
  assert.equal(rival.name, 'Rival territory');
  assert.equal(rival.recordedAt, Date.parse('2026-11-17T08:00:00Z'));
  assert.deepEqual(rival.polygon, polygon);
});

test('publishClaims sends only polygon and area, skips open routes, ignores duplicates', async () => {
  const inserted = [];
  const client = { from: () => ({ insert: async (rows) => { inserted.push(...rows); return { error: { code: '23505' } }; } }) };
  await publishClaims(client, [
    { activityKey: 'user@example.com:key1', polygon, areaSqKm: 0.5, recordedAt: 1700000000000, name: 'Secret run', username: 'user@example.com' },
    { activityKey: 'user@example.com:key2', polygon: null, areaSqKm: 0, recordedAt: 1700000000000 },
  ]);
  assert.equal(inserted.length, 1);
  assert.deepEqual(Object.keys(inserted[0]).sort(), ['claim', 'claim_key', 'recorded_at']);
  assert.deepEqual(Object.keys(inserted[0].claim).sort(), ['areaSqKm', 'polygon']);

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
